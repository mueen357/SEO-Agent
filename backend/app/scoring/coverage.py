"""Evidence coverage and confidence assessment subsystem."""

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy


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
    rule_family_completion: Dict[str, float] = field(default_factory=dict)
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
) -> CoverageReport:
    """Calculate evidence coverage metrics and determine the score state."""
    pass_cnt = sum(1 for e in evaluations if e.get("status") == "pass")
    warn_cnt = sum(1 for e in evaluations if e.get("status") == "warning")
    fail_cnt = sum(1 for e in evaluations if e.get("status") == "fail")
    unknown_cnt = sum(1 for e in evaluations if e.get("status") == "unknown")
    na_cnt = sum(1 for e in evaluations if e.get("status") == "not_applicable")
    total_evals = len(evaluations)

    # Page success ratio
    attempted_pages = evaluated_pages + failed_pages
    page_ratio = (evaluated_pages / attempted_pages) if attempted_pages > 0 else 0.0

    # Rule evaluation ratio: assessments with known evidence vs total expected
    applicable_evals = total_evals - na_cnt
    known_evals = pass_cnt + warn_cnt + fail_cnt
    eval_known_ratio = (known_evals / applicable_evals) if applicable_evals > 0 else 0.0

    # Composite coverage ratio
    if attempted_pages == 0 or total_evals == 0:
        coverage_ratio = 0.0
    else:
        coverage_ratio = round(0.5 * page_ratio + 0.5 * eval_known_ratio, 3)

    # Coverage label
    if coverage_ratio >= 0.90:
        coverage_label = "full"
    elif coverage_ratio >= 0.75:
        coverage_label = "high"
    elif coverage_ratio >= 0.50:
        coverage_label = "moderate"
    elif coverage_ratio >= 0.30:
        coverage_label = "low"
    else:
        coverage_label = "minimal"

    # Rule family completion
    categories = ["on_page", "technical", "sitewide"]
    rule_family_completion = {}
    for cat in categories:
        cat_evals = [e for e in evaluations if e.get("category") == cat]
        cat_known = sum(1 for e in cat_evals if e.get("status") in ("pass", "warning", "fail"))
        cat_app = len(cat_evals) - sum(1 for e in cat_evals if e.get("status") == "not_applicable")
        rule_family_completion[cat] = round((cat_known / cat_app) if cat_app > 0 else 0.0, 3)

    crawl_limit_hit = total_pages >= max_pages_limit

    # Determine score state
    if evaluated_pages == 0 or total_evals == 0 or known_evals == 0 or coverage_ratio < policy.min_coverage_for_provisional:
        if total_pages == 0 and audit_status in ("created", "queued"):
            score_state = "not_analyzed"
        else:
            score_state = "insufficient_evidence"
    elif audit_status in ("crawling", "analyzing") or coverage_ratio < policy.min_coverage_for_available:
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
        rule_family_completion=rule_family_completion,
        coverage_ratio=coverage_ratio,
        coverage_label=coverage_label,
        score_state=score_state,
        has_rendering_evidence=has_renders,
        crawl_limit_hit=crawl_limit_hit,
    )
