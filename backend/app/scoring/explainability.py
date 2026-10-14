"""Transparency, formula documentation, and score explainability subsystem."""

from typing import Any, Dict, List, Optional
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy


DISCLAIMER_TEXT = (
    "Audit Health Score is an internal technical diagnostic metric designed to assess "
    "website crawlability, on-page optimization, and technical SEO hygiene based on verified evidence. "
    "It does not represent, predict, or emulate Google's proprietary search ranking algorithms."
)


def generate_explanation(
    overall_score: Optional[float],
    score_label: str,
    score_state: str,
    cat_scores: Dict[str, Optional[float]],
    category_breakdown: Dict[str, Any],
    coverage_ratio: float,
    policy: ScoringPolicy = DEFAULT_SCORING_POLICY,
) -> Dict[str, Any]:
    """Generate structured explainability metadata for the scorecard."""
    # Top deductions across all categories
    all_deductions = []
    for cat, data in category_breakdown.items():
        weight = data.get("weight", 0.0)
        for ded in data.get("deductions", []):
            impact = round(ded.get("deduction", 0.0) * weight, 2)
            all_deductions.append({
                "category": cat,
                "rule_id": ded.get("rule_id"),
                "points_lost": impact,
                "raw_deduction": ded.get("deduction"),
                "fail_count": ded.get("fail_count", 0),
                "warn_count": ded.get("warn_count", 0),
            })

    # Sort deductions by points lost descending
    all_deductions.sort(key=lambda d: d["points_lost"], reverse=True)
    top_deductions = all_deductions[:5]

    # Strengths: categories or rules that scored 100
    strengths = []
    for cat, sc in cat_scores.items():
        if sc is not None and sc >= 90.0:
            strengths.append(f"{cat.replace('_', ' ').title()} Health is strong ({sc}/100)")

    # Category inclusion and effective weights transparency
    included_categories = [cat for cat in policy.category_weights if cat_scores.get(cat) is not None]
    missing_categories = [cat for cat in policy.category_weights if cat_scores.get(cat) is None]
    avail_weight_sum = sum(policy.category_weights[c] for c in included_categories)
    effective_weights = {
        c: round(policy.category_weights[c] / avail_weight_sum, 4)
        for c in included_categories
    } if avail_weight_sum > 0 else {}

    is_provisional_partial = len(missing_categories) > 0 and len(included_categories) > 0

    return {
        "policy_version": policy.version,
        "score_label": score_label,
        "score_state": score_state,
        "formula": "35% On-Page Health + 40% Technical Health + 25% Site-Wide Health",
        "category_weights": policy.category_weights,
        "effective_weights": effective_weights,
        "included_categories": included_categories,
        "missing_categories": missing_categories,
        "is_provisional_partial": is_provisional_partial,
        "coverage_ratio": coverage_ratio,
        "top_deductions": top_deductions,
        "top_strengths": strengths,
        "disclaimer": DISCLAIMER_TEXT,
    }
