"""Deterministic, evidence-based SEO health score calculator."""

from typing import Any, Dict, List, Optional, Tuple
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy


def calculate_rule_score(
    evaluations: List[Dict[str, Any]],
    default_severity: str = "medium",
    total_site_pages: int = 1,
    policy: ScoringPolicy = DEFAULT_SCORING_POLICY,
) -> Optional[Dict[str, Any]]:
    """Calculate the health score (0-100) and point deduction for a single SEO rule.
    
    Returns None if rule was not applicable across all evaluated contexts.
    """
    if not evaluations:
        return None

    # Filter out not_applicable evaluations
    applicable_evals = [e for e in evaluations if e.get("status") != "not_applicable"]
    if not applicable_evals:
        return None

    is_sitewide = any(e.get("is_sitewide", False) for e in applicable_evals)

    sev_weight = policy.severity_weights.get(default_severity, 0.5)

    if not is_sitewide:
        # Page-level rule aggregation: ratio of passing pages
        total_eligible = len(applicable_evals)
        earned_points = 0.0
        pass_count = 0
        warn_count = 0
        fail_count = 0
        unknown_count = 0

        for e in applicable_evals:
            st = e.get("status", "unknown")
            mult = policy.status_multipliers.get(st, 0.0)
            if mult is not None:
                earned_points += mult
            if st == "pass":
                pass_count += 1
            elif st == "warning":
                warn_count += 1
            elif st == "fail":
                fail_count += 1
            elif st == "unknown":
                unknown_count += 1

        rule_score = round((earned_points / total_eligible) * 100.0, 2)
        deduction = round(100.0 - rule_score, 2)

        return {
            "score": rule_score,
            "deduction": deduction,
            "weight": sev_weight,
            "eligible_count": total_eligible,
            "pass_count": pass_count,
            "warn_count": warn_count,
            "fail_count": fail_count,
            "unknown_count": unknown_count,
            "is_sitewide": False,
        }
    else:
        # Site-wide rule assessment
        pass_count = sum(1 for e in applicable_evals if e.get("status") == "pass")
        warn_count = sum(1 for e in applicable_evals if e.get("status") == "warning")
        fail_count = sum(1 for e in applicable_evals if e.get("status") == "fail")
        unknown_count = sum(1 for e in applicable_evals if e.get("status") == "unknown")

        if fail_count == 0 and warn_count == 0 and unknown_count == 0:
            return {
                "score": 100.0,
                "deduction": 0.0,
                "weight": sev_weight,
                "eligible_count": 1,
                "pass_count": pass_count,
                "warn_count": 0,
                "fail_count": 0,
                "unknown_count": 0,
                "is_sitewide": True,
            }

        # Calculate deduction based on severity and page scope
        max_affected = 0
        for e in applicable_evals:
            evid = e.get("evidence", {}) or {}
            aff = evid.get("page_count") or len(evid.get("affected_urls", [])) or len(evid.get("all_urls", [])) or 1
            if aff > max_affected:
                max_affected = aff

        scope_ratio = min(1.0, max_affected / max(1, total_site_pages))
        # Base penalty scaled by severity and affected scope
        if fail_count > 0:
            penalty = 50.0 + (50.0 * scope_ratio)
        elif warn_count > 0:
            penalty = 20.0 + (30.0 * scope_ratio)
        else:
            penalty = 30.0  # unknown evidence

        rule_score = max(0.0, round(100.0 - penalty, 2))
        deduction = round(100.0 - rule_score, 2)

        return {
            "score": rule_score,
            "deduction": deduction,
            "weight": sev_weight,
            "eligible_count": 1,
            "pass_count": pass_count,
            "warn_count": warn_count,
            "fail_count": fail_count,
            "unknown_count": unknown_count,
            "is_sitewide": True,
            "affected_pages": max_affected,
        }


def calculate_category_scores(
    rule_scores_by_cat: Dict[str, Dict[str, Dict[str, Any]]],
    policy: ScoringPolicy = DEFAULT_SCORING_POLICY,
) -> Tuple[Dict[str, Optional[float]], Dict[str, Any]]:
    """Compute weighted scores for each category and detailed deductions."""
    cat_scores: Dict[str, Optional[float]] = {}
    breakdown: Dict[str, Any] = {}

    for cat in ["on_page", "technical", "sitewide"]:
        rules = rule_scores_by_cat.get(cat, {})
        if not rules:
            cat_scores[cat] = None
            breakdown[cat] = {
                "score": None,
                "weight": policy.category_weights.get(cat, 0.0),
                "rules_evaluated": 0,
                "deductions": [],
            }
            continue

        weighted_sum = 0.0
        weight_total = 0.0
        deductions = []

        for rule_id, r_data in rules.items():
            w = r_data.get("weight", 0.5)
            s = r_data.get("score", 100.0)
            weighted_sum += w * s
            weight_total += w

            ded = r_data.get("deduction", 0.0)
            if ded > 0:
                deductions.append({
                    "rule_id": rule_id,
                    "score": s,
                    "deduction": ded,
                    "weight": w,
                    "pass_count": r_data.get("pass_count", 0),
                    "fail_count": r_data.get("fail_count", 0),
                    "warn_count": r_data.get("warn_count", 0),
                    "unknown_count": r_data.get("unknown_count", 0),
                })

        # Sort deductions by point impact descending
        deductions.sort(key=lambda d: d["deduction"] * d["weight"], reverse=True)

        if weight_total > 0:
            final_cat_score = round(weighted_sum / weight_total, 1)
        else:
            final_cat_score = 100.0

        cat_scores[cat] = final_cat_score
        breakdown[cat] = {
            "score": final_cat_score,
            "weight": policy.category_weights.get(cat, 0.0),
            "rules_evaluated": len(rules),
            "deductions": deductions,
        }

    return cat_scores, breakdown


def calculate_composite_score(
    cat_scores: Dict[str, Optional[float]],
    score_state: str,
    policy: ScoringPolicy = DEFAULT_SCORING_POLICY,
) -> Tuple[Optional[float], str]:
    """Calculate composite overall score (0-100) or None if evidence is insufficient."""
    if score_state == "insufficient_evidence" or all(s is None for s in cat_scores.values()):
        return None, "unrated"

    composite = 0.0
    applied_weight = 0.0

    for cat, weight in policy.category_weights.items():
        score = cat_scores.get(cat)
        if score is not None:
            composite += score * weight
            applied_weight += weight

    if applied_weight == 0:
        return None, "unrated"

    final_score = round(composite / applied_weight, 1)
    # Clamp between 0.0 and 100.0
    final_score = max(0.0, min(100.0, final_score))
    label = policy.get_score_label(final_score)

    return final_score, label
