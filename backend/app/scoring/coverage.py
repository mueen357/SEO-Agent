"""Evidence coverage, registered-rule execution verification, and confidence assessment subsystem."""

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Set
from app.audit_engine.registry import default_registry
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy
from app.scoring.rule_mapping import get_rule_scoring_family


@dataclass
class CoverageReport:
    """Detailed evidence coverage and assessment completeness report."""

    total_pages_crawled: int
    pages_evaluated: int
    pages_failed: int
    rule_evaluations_total: int
    rule_evaluations_pass: int
    rule_evaluations_warning: int
    rule_evaluations_fail: int
    rule_evaluations_unknown: int
    rule_evaluations_not_applicable: int
    expected_rules_total: int = 51
    executed_rules_total: int = 0
    missing_rules_total: int = 51
    rule_execution_coverage: float = 0.0
    rule_family_completion: Dict[str, float] = field(default_factory=dict)
    rule_family_execution: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    coverage_ratio: float = 0.0
    coverage_label: str = "minimal"
    score_state: str = "insufficient_evidence"
    has_rendering_evidence: bool = False
    crawl_limit_hit: bool = False
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def calculate_coverage(
    total_pages: int,
    evaluated_pages: int,
    failed_pages: int,
    evaluations: List[Dict[str, Any]],
    audit_status: str = "completed",
    max_pages_limit: int = 50,
    has_renders: bool = False,
    policy: ScoringPolicy = DEFAULT_SCORING_POLICY,
    audit_mode: str = "full",
) -> CoverageReport:
    """Calculate evidence coverage metrics, registered-rule execution provenance, and score state.

    Builds coverage strictly by comparing executed evaluations against the 51 expected registered SEO rules.
    Prevents a single passing rule from claiming 100% completion when other registered rules were unexecuted.
    """
    pass_cnt = sum(1 for e in evaluations if e.get("status") == "pass")
    warn_cnt = sum(1 for e in evaluations if e.get("status") == "warning")
    fail_cnt = sum(1 for e in evaluations if e.get("status") == "fail")
    unknown_cnt = sum(1 for e in evaluations if e.get("status") == "unknown")
    na_cnt = sum(1 for e in evaluations if e.get("status") == "not_applicable")
    total_evals = len(evaluations)

    # Page success ratio
    attempted_pages = evaluated_pages + failed_pages
    page_ratio = (evaluated_pages / attempted_pages) if attempted_pages > 0 else 0.0

    # Rule evaluation ratio: assessments with known evidence vs total applicable
    applicable_evals = total_evals - na_cnt
    known_evals = pass_cnt + warn_cnt + fail_cnt
    eval_known_ratio = (known_evals / applicable_evals) if applicable_evals > 0 else 0.0

    # Expected registered rules from authoritative registry
    has_explicit_rule_ids = any(bool(e.get("rule_id")) for e in evaluations)

    if audit_mode == "quick":
        # Quick audits target on-page rules specifically
        expected_by_family = {
            "on_page": {r.rule_id for r in default_registry.get_onpage_rules()},
        }
    else:
        # Full audits expect all registered rules across all 3 families
        expected_by_family = {
            "on_page": {r.rule_id for r in default_registry.get_onpage_rules()},
            "technical": {r.rule_id for r in default_registry.get_technical_rules()},
            "sitewide": {r.rule_id for r in default_registry.get_sitewide_rules()},
        }

    all_expected_rules: Set[str] = set().union(*expected_by_family.values())
    total_expected_count = len(all_expected_rules)

    if has_explicit_rule_ids:
        # Exact rule execution provenance available
        executed_rules_all: Set[str] = {
            e.get("rule_id") for e in evaluations if e.get("rule_id") and e.get("rule_id") in all_expected_rules
        }
        executed_rules_count = len(executed_rules_all)
        missing_rules_count = total_expected_count - executed_rules_count
        rule_execution_coverage = round(executed_rules_count / total_expected_count, 3) if total_expected_count > 0 else 0.0
    else:
        # Synthetic / legacy evaluations without explicit rule_id
        executed_rules_count = total_evals
        missing_rules_count = 0
        rule_execution_coverage = eval_known_ratio

    # Rule family execution and completion breakdown
    rule_family_completion: Dict[str, float] = {}
    rule_family_execution: Dict[str, Dict[str, Any]] = {}

    all_three_families = ["on_page", "technical", "sitewide"]
    for family in all_three_families:
        expected_set = expected_by_family.get(family, set())
        fam_evals = [
            e for e in evaluations
            if (get_rule_scoring_family(e.get("rule_id", "")) or e.get("category")) == family
        ]
        fam_known = sum(1 for e in fam_evals if e.get("status") in ("pass", "warning", "fail"))
        fam_app = len(fam_evals) - sum(1 for e in fam_evals if e.get("status") == "not_applicable")

        if has_explicit_rule_ids and expected_set:
            executed_in_family = {
                e.get("rule_id") for e in fam_evals
                if e.get("rule_id") in expected_set
            }
            missing_in_family = expected_set - executed_in_family
            exec_ratio = (len(executed_in_family) / len(expected_set)) if expected_set else 0.0
            known_ratio = (fam_known / fam_app) if fam_app > 0 else (1.0 if len(fam_evals) > 0 else 0.0)
            completion = round(exec_ratio * known_ratio, 3)

            if len(executed_in_family) == 0:
                fam_status = "not_evaluated"
            elif len(missing_in_family) == 0:
                fam_status = "complete"
            else:
                fam_status = "partial"

            rule_family_execution[family] = {
                "expected_count": len(expected_set),
                "executed_count": len(executed_in_family),
                "missing_count": len(missing_in_family),
                "missing_rule_ids": sorted(list(missing_in_family)),
                "execution_ratio": round(exec_ratio, 3),
                "completion": completion,
                "status": fam_status,
            }
        else:
            # When family is not in expected set (e.g. quick mode) or no explicit rule_ids
            completion = round((fam_known / fam_app) if fam_app > 0 else 0.0, 3)
            rule_family_execution[family] = {
                "expected_count": len(expected_set),
                "executed_count": len(fam_evals),
                "missing_count": 0,
                "missing_rule_ids": [],
                "execution_ratio": 1.0 if fam_evals else 0.0,
                "completion": completion,
                "status": "complete" if fam_evals else ("not_applicable_mode" if audit_mode == "quick" else "not_evaluated"),
            }

        rule_family_completion[family] = completion

    # Composite coverage ratio
    if attempted_pages == 0 or total_evals == 0:
        coverage_ratio = 0.0
    elif has_explicit_rule_ids and audit_mode != "quick":
        coverage_ratio = round(
            0.35 * page_ratio + 0.35 * rule_execution_coverage + 0.30 * eval_known_ratio,
            3,
        )
    else:
        # Standard page & known ratio for quick audits and synthetic evaluations
        coverage_ratio = round(0.50 * page_ratio + 0.50 * eval_known_ratio, 3)

    # Coverage label
    if coverage_ratio >= 0.85:
        coverage_label = "full"
    elif coverage_ratio >= 0.70:
        coverage_label = "high"
    elif coverage_ratio >= 0.50:
        coverage_label = "moderate"
    elif coverage_ratio >= 0.30:
        coverage_label = "low"
    else:
        coverage_label = "minimal"

    crawl_limit_hit = total_pages >= max_pages_limit

    # Determine score state
    # Never display confident 'available' 100/100 based on a single rule or missing family in full audit
    if has_explicit_rule_ids:
        families_not_evaluated = [
            fam for fam, data in rule_family_execution.items()
            if data["status"] == "not_evaluated" and fam in expected_by_family
        ]
    else:
        families_not_evaluated = []

    if evaluated_pages == 0 or total_evals == 0 or known_evals == 0:
        if total_pages == 0 and audit_status in ("created", "queued"):
            score_state = "not_analyzed"
        else:
            score_state = "insufficient_evidence"
    elif (
        audit_status in ("crawling", "analyzing", "partially_completed")
        or coverage_ratio < policy.min_coverage_for_available
        or len(families_not_evaluated) > 0
        or (has_explicit_rule_ids and audit_mode == "full" and rule_execution_coverage < 0.60)
    ):
        score_state = "provisional"
    else:
        score_state = "available"

    return CoverageReport(
        total_pages_crawled=total_pages,
        pages_evaluated=evaluated_pages,
        pages_failed=failed_pages,
        rule_evaluations_total=total_evals,
        rule_evaluations_pass=pass_cnt,
        rule_evaluations_warning=warn_cnt,
        rule_evaluations_fail=fail_cnt,
        rule_evaluations_unknown=unknown_cnt,
        rule_evaluations_not_applicable=na_cnt,
        expected_rules_total=total_expected_count,
        executed_rules_total=executed_rules_count,
        missing_rules_total=missing_rules_count,
        rule_execution_coverage=rule_execution_coverage,
        rule_family_completion=rule_family_completion,
        rule_family_execution=rule_family_execution,
        coverage_ratio=coverage_ratio,
        coverage_label=coverage_label,
        score_state=score_state,
        has_rendering_evidence=has_renders,
        crawl_limit_hit=crawl_limit_hit,
        details={
            "audit_mode": audit_mode,
            "has_explicit_rule_ids": has_explicit_rule_ids,
            "families_not_evaluated": families_not_evaluated,
            "page_success_ratio": round(page_ratio, 3),
            "eval_known_ratio": round(eval_known_ratio, 3),
        },
    )
