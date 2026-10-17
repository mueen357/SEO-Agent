"""Main scoring engine orchestrating policy, coverage, calculation, and prioritization."""

import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple
from app.scoring.calculator import (
    calculate_category_scores,
    calculate_composite_score,
    calculate_rule_score,
)
from app.scoring.coverage import CoverageReport, calculate_coverage
from app.scoring.explainability import generate_explanation
from app.scoring.grouping import group_findings_by_rule_and_cause
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy
from app.scoring.priorities import compute_priority_items
from app.scoring.rule_mapping import get_rule_scoring_family


def canonicalize_evidence_dict(evidence: Any) -> str:
    """Deterministically hash bounded evidence data without sensitive content leaks."""
    if not isinstance(evidence, dict) or not evidence:
        return "empty"
    try:
        raw = json.dumps(evidence, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
    except Exception:
        return "unhashable"


FINGERPRINT_VERSION = "v2.4d"


def compute_input_fingerprint(
    evaluations: List[Dict[str, Any]],
    pages_count: int,
    audit_id: Optional[Any] = None,
    audit_status: str = "completed",
    max_pages_limit: int = 50,
    has_renders: bool = False,
    policy: Optional[ScoringPolicy] = None,
    page_evidence_summary: Optional[List[Dict[str, Any]]] = None,
    seed_url: Optional[str] = None,
    audit_mode: str = "full",
    _include_legacy_status: bool = False,
) -> str:
    """Generate a deterministic, versioned evidence fingerprint to detect score staleness.

    Includes normalized:
    - Fingerprint schema version
    - Audit ID, crawl seed, mode, and scope limits (decoupled from pipeline progress status)
    - Page identities, fetch states, HTTP codes, redirects, and canonical targets
    - Assessment identities, versions, status, severity, and canonicalized evidence
    - Scoring policy version, category weights, and status multipliers
    """
    pol = policy or DEFAULT_SCORING_POLICY

    # 1. Policy & Rule-Set Metadata
    policy_spec = {
        "version": getattr(pol, "version", "2.4.0"),
        "category_weights": dict(sorted((pol.category_weights or {}).items())),
        "severity_weights": dict(sorted((pol.severity_weights or {}).items())),
        "status_multipliers": dict(sorted((pol.status_multipliers or {}).items())),
    }

    # 2. Scope & Crawl Metadata
    scope_spec = {
        "fingerprint_version": FINGERPRINT_VERSION,
        "audit_id": str(audit_id) if audit_id else "global",
        "audit_mode": audit_mode,
        "seed_url": seed_url or "",
        "pages_count": pages_count,
        "max_pages_limit": max_pages_limit,
        "has_renders": bool(has_renders),
    }
    if _include_legacy_status:
        scope_spec["audit_status"] = audit_status


    # 3. Canonicalized Assessments (lexicographically sorted for order-invariance)
    eval_tokens = []
    for e in evaluations:
        rid = e.get("rule_id", "")
        status = e.get("status", "")
        sev = e.get("severity", "")
        p_url = e.get("page_url", "")
        fam = get_rule_scoring_family(rid) or e.get("category", "")
        rule_ver = e.get("rule_version", "1.0.0")

        # Canonicalize evidence dictionary
        evid_hash = canonicalize_evidence_dict(e.get("evidence", {}))

        eval_token = (
            rid,
            fam,
            status,
            sev,
            p_url,
            rule_ver,
            evid_hash,
        )
        eval_tokens.append(eval_token)

    eval_tokens.sort()

    # 4. Canonical Page-level Fetch Evidence Summary (sorted for order-invariance)
    page_tokens = []
    if page_evidence_summary:
        for p in page_evidence_summary:
            page_tokens.append((
                str(p.get("page_id") or p.get("id") or ""),
                str(p.get("requested_url") or p.get("url") or ""),
                str(p.get("final_url") or ""),
                str(p.get("http_status") if p.get("http_status") is not None else ""),
                str(p.get("fetch_status") or ""),
                str(p.get("canonical_url") or ""),
                int(len(p.get("redirect_chain") or p.get("redirect_chain_json") or [])),
                bool(p.get("has_render", False)),
            ))
        page_tokens.sort()

    payload = {
        "version": FINGERPRINT_VERSION,
        "policy": policy_spec,
        "scope": scope_spec,
        "page_count": len(page_tokens),
        "pages": page_tokens,
        "eval_count": len(eval_tokens),
        "evaluations": eval_tokens,
    }

    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


class ScoringEngine:
    """Evidence-based SEO Health Scoring and Prioritization Engine."""

    def __init__(self, policy: ScoringPolicy = DEFAULT_SCORING_POLICY) -> None:
        self.policy = policy

    def evaluate_audit(
        self,
        audit_id: Any,
        total_pages: int,
        evaluated_pages: int,
        failed_pages: int,
        evaluations: List[Dict[str, Any]],
        audit_status: str = "completed",
        max_pages_limit: int = 50,
        has_renders: bool = False,
        audit_mode: str = "full",
        page_evidence_summary: Optional[List[Dict[str, Any]]] = None,
        seed_url: Optional[str] = None,
        seed_final_url: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """Compute complete scorecard and prioritized remediation items for an audit."""
        # 1. Coverage & state analysis
        cov_report = calculate_coverage(
            total_pages=total_pages,
            evaluated_pages=evaluated_pages,
            failed_pages=failed_pages,
            evaluations=evaluations,
            audit_status=audit_status,
            max_pages_limit=max_pages_limit,
            has_renders=has_renders,
            policy=self.policy,
            audit_mode=audit_mode,
        )

        input_fp = compute_input_fingerprint(
            evaluations=evaluations,
            pages_count=total_pages,
            audit_id=audit_id,
            audit_status=audit_status,
            max_pages_limit=max_pages_limit,
            has_renders=has_renders,
            policy=self.policy,
            page_evidence_summary=page_evidence_summary,
            seed_url=seed_url,
            audit_mode=audit_mode,
        )

        # 2. Group evaluations by authoritative scoring family and rule_id
        evals_by_cat_rule: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
            "on_page": {},
            "technical": {},
            "sitewide": {},
        }
        unrecognized_rules: List[str] = []
        for e in evaluations:
            rid = e.get("rule_id", "UNKNOWN")
            fam = get_rule_scoring_family(rid)
            if not fam:
                fam = "unrecognized"
                unrecognized_rules.append(rid)
            if fam not in evals_by_cat_rule:
                evals_by_cat_rule[fam] = {}
            evals_by_cat_rule[fam].setdefault(rid, []).append(e)

        # 3. Calculate rule scores
        rule_scores_by_cat: Dict[str, Dict[str, Dict[str, Any]]] = {}
        rules_evaluated_count = 0
        for cat, rules in evals_by_cat_rule.items():
            rule_scores_by_cat[cat] = {}
            for rid, ev_list in rules.items():
                sev = ev_list[0].get("severity", "medium") if ev_list else "medium"
                r_score = calculate_rule_score(
                    evaluations=ev_list,
                    default_severity=sev,
                    total_site_pages=total_pages,
                    policy=self.policy,
                )
                if r_score is not None:
                    rule_scores_by_cat[cat][rid] = r_score
                    rules_evaluated_count += 1

        # 4. Calculate category scores
        cat_scores, category_breakdown = calculate_category_scores(
            rule_scores_by_cat=rule_scores_by_cat,
            policy=self.policy,
        )

        # 5. Composite overall score
        overall_score, score_label = calculate_composite_score(
            cat_scores=cat_scores,
            score_state=cov_report.score_state,
            policy=self.policy,
        )

        # 6. Issue counts snapshot
        critical_count = sum(1 for e in evaluations if e.get("severity") == "critical" and e.get("status") == "fail")
        high_count = sum(1 for e in evaluations if e.get("severity") == "high" and e.get("status") == "fail")
        medium_count = sum(1 for e in evaluations if e.get("severity") == "medium" and e.get("status") in ("fail", "warning"))
        low_count = sum(1 for e in evaluations if e.get("severity") == "low" and e.get("status") in ("fail", "warning"))
        pass_count = cov_report.rule_evaluations_pass

        # 7. Explainability
        explanation = generate_explanation(
            overall_score=overall_score,
            score_label=score_label,
            score_state=cov_report.score_state,
            cat_scores=cat_scores,
            category_breakdown=category_breakdown,
            coverage_ratio=cov_report.coverage_ratio,
            policy=self.policy,
        )
        if unrecognized_rules:
            cov_report.details["unrecognized_rules"] = sorted(list(set(unrecognized_rules)))
            explanation["unrecognized_rules"] = sorted(list(set(unrecognized_rules)))

        scorecard_data = {
            "audit_id": audit_id,
            "policy_version": self.policy.version,
            "input_fingerprint": input_fp,
            "overall_score": overall_score,
            "score_label": score_label,
            "overall_state": cov_report.score_state,
            "on_page_score": cat_scores.get("on_page"),
            "technical_score": cat_scores.get("technical"),
            "sitewide_score": cat_scores.get("sitewide"),
            "category_scores_json": category_breakdown,
            "coverage_json": cov_report.to_dict(),
            "explanation_json": explanation,
            "pages_evaluated": evaluated_pages,
            "rules_evaluated": rules_evaluated_count,
            "critical_count": critical_count,
            "high_count": high_count,
            "medium_count": medium_count,
            "low_count": low_count,
            "pass_count": pass_count,
        }

        # 8. Group findings and prioritize remediation items
        grouped_items = group_findings_by_rule_and_cause(evaluations)
        priority_items = compute_priority_items(
            grouped_items,
            total_pages=total_pages,
            seed_url=seed_url,
            seed_final_url=seed_final_url,
        )

        # Attach audit_id to each priority item
        for p in priority_items:
            p["audit_id"] = audit_id

        return scorecard_data, priority_items
