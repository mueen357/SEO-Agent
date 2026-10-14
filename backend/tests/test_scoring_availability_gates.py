"""Regression tests for Task 2.4D: Scoring Availability State Eligibility Gates.

Verifies:
- 1/22 technical rules executed
- 21/22 technical rules executed
- 22/22 technical rules executed (with missing other families)
- 50/51 total rules executed
- 51/51 registered rules executed
- Missing on-page image rules
- Missing site-wide rules
- One-page crawl
- Partial crawl
- Failed fetches
- Unknown-only evidence
- N/A-only assessments
- Insufficient evidence
- Quick Page Audit vs Complete Full Audit
"""

import pytest
from app.audit_engine.registry import RuleRegistry
from app.scoring.calculator import calculate_composite_score, calculate_category_scores, calculate_rule_score
from app.scoring.coverage import calculate_coverage
from app.scoring.policy import ScoringPolicy


@pytest.fixture
def registry():
    return RuleRegistry()


def test_availability_gate_1_of_22_technical_rules(registry):
    """1/22 technical rules executed must yield provisional state, not available."""
    evals = [
        {"rule_id": "TECH_HTTPS_USAGE", "status": "pass", "severity": "high", "page_url": "https://example.com/"}
    ]
    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.score_state == "provisional"
    assert report.rule_family_execution["technical"]["executed_count"] == 1
    assert report.rule_family_execution["technical"]["missing_count"] == 21
    assert report.rule_family_execution["technical"]["status"] == "partial"
    assert report.missing_rules_total == 50


def test_availability_gate_21_of_22_technical_rules(registry):
    """21/22 technical rules executed must remain provisional, even if coverage ratio is high."""
    tech_rules = registry.get_technical_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in tech_rules[:-1]
    ]
    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.score_state == "provisional"
    assert report.rule_family_execution["technical"]["executed_count"] == 21
    assert report.rule_family_execution["technical"]["missing_count"] == 1
    assert report.rule_family_execution["technical"]["status"] == "partial"


def test_availability_gate_22_of_22_technical_rules_alone(registry):
    """22/22 technical rules executed without on-page or sitewide must remain provisional."""
    tech_rules = registry.get_technical_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in tech_rules
    ]
    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.rule_family_execution["technical"]["status"] == "complete"
    assert report.rule_family_execution["on_page"]["status"] == "not_evaluated"
    assert report.rule_family_execution["sitewide"]["status"] == "not_evaluated"
    assert report.score_state == "provisional"


def test_availability_gate_50_of_51_rules(registry):
    """50/51 total registered rules executed must NOT yield unqualified 'available'."""
    all_rules = registry.get_all_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in all_rules[:-1]
    ]
    missing_rule = all_rules[-1]

    report = calculate_coverage(
        total_pages=10,
        evaluated_pages=10,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.score_state == "provisional"
    assert report.missing_rules_total == 1
    assert missing_rule.rule_id in report.missing_rule_ids
    assert report.executed_rules_total == 50


def test_availability_gate_51_of_51_rules_complete(registry):
    """51/51 registered rules with 100% evaluated pages yields available state."""
    all_rules = registry.get_all_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in all_rules
    ]
    report = calculate_coverage(
        total_pages=10,
        evaluated_pages=10,
        failed_pages=0,
        evaluations=evals,
        audit_status="completed",
        audit_mode="full",
    )
    assert report.score_state == "available"
    assert report.missing_rules_total == 0
    assert report.executed_rules_total == 51
    assert report.rule_family_execution["on_page"]["status"] == "complete"
    assert report.rule_family_execution["technical"]["status"] == "complete"
    assert report.rule_family_execution["sitewide"]["status"] == "complete"


def test_availability_gate_missing_onpage_image_rules(registry):
    """Full audit missing image rules must be provisional."""
    all_rules = registry.get_all_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in all_rules if r.category != "images"
    ]
    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.score_state == "provisional"
    assert "ONPAGE_IMAGE_ALT_MISSING" in report.missing_rule_ids
    assert report.rule_family_execution["on_page"]["status"] == "partial"


def test_availability_gate_missing_sitewide_rules(registry):
    """Full audit with 16 onpage + 22 technical, but 0 sitewide must be provisional."""
    evals = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in registry.get_onpage_rules() + registry.get_technical_rules()
    ]
    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.score_state == "provisional"
    assert report.rule_family_execution["sitewide"]["status"] == "not_evaluated"
    assert report.rule_family_execution["sitewide"]["missing_count"] == 13


def test_availability_gate_one_page_crawl(registry):
    """A 1-page crawl running full 51 rules can be available; if partial, provisional."""
    all_rules = registry.get_all_rules()
    evals_full = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in all_rules
    ]
    rep_full = calculate_coverage(1, 1, 0, evals_full, audit_status="completed", audit_mode="full")
    assert rep_full.score_state == "available"

    # Only on-page executed on 1-page crawl
    evals_partial = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in registry.get_onpage_rules()
    ]
    rep_part = calculate_coverage(1, 1, 0, evals_partial, audit_status="completed", audit_mode="full")
    assert rep_part.score_state == "provisional"


def test_availability_gate_partial_crawl(registry):
    """An audit with status='partially_completed' must yield provisional state."""
    all_rules = registry.get_all_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in all_rules
    ]
    report = calculate_coverage(
        total_pages=10,
        evaluated_pages=8,
        failed_pages=2,
        evaluations=evals,
        audit_status="partially_completed",
        audit_mode="full",
    )
    assert report.score_state == "provisional"


def test_availability_gate_failed_fetches(registry):
    """When evaluated pages is 0 due to fetch failures, state must be insufficient_evidence and score null."""
    all_rules = registry.get_all_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "fail", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in all_rules
    ]
    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=0,
        failed_pages=5,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.score_state == "insufficient_evidence"

    # Composite score calculation must return None
    comp_score, label = calculate_composite_score(
        {"on_page": 0.0, "technical": 0.0, "sitewide": 0.0},
        score_state=report.score_state,
    )
    assert comp_score is None
    assert label == "unrated"


def test_availability_gate_unknown_only_evidence(registry):
    """When all evaluations have status='unknown', score state is insufficient_evidence and score is null."""
    all_rules = registry.get_all_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "unknown", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in all_rules
    ]
    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.score_state == "insufficient_evidence"
    assert report.rule_evaluations_known == 0

    # Rule score for unknown-only evaluation must be None
    r_score = calculate_rule_score(evals[:1])
    assert r_score["score"] is None
    assert r_score["deduction"] == 0.0


def test_availability_gate_na_only_assessments(registry):
    """When all evaluations have status='not_applicable', score state is insufficient_evidence and score is null."""
    all_rules = registry.get_all_rules()
    evals = [
        {"rule_id": r.rule_id, "status": "not_applicable", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in all_rules
    ]
    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.score_state == "insufficient_evidence"

    # Rule score for not_applicable must be None (not reducing health)
    r_score = calculate_rule_score(evals[:1])
    assert r_score is None


def test_availability_gate_quick_vs_full_mode(registry):
    """Quick mode requires only 16 on_page rules; Full mode requires all 51 rules."""
    onpage_rules = registry.get_onpage_rules()
    evals_onpage_16 = [
        {"rule_id": r.rule_id, "status": "pass", "severity": r.default_severity, "page_url": "https://example.com/"}
        for r in onpage_rules
    ]

    # Quick mode with 16 onpage -> available
    rep_quick_16 = calculate_coverage(1, 1, 0, evals_onpage_16, audit_status="completed", audit_mode="quick")
    assert rep_quick_16.score_state == "available"
    assert rep_quick_16.expected_rules_total == 16
    assert rep_quick_16.missing_rules_total == 0

    # Quick mode with 15 onpage -> provisional
    rep_quick_15 = calculate_coverage(1, 1, 0, evals_onpage_16[:-1], audit_status="completed", audit_mode="quick")
    assert rep_quick_15.score_state == "provisional"
    assert rep_quick_15.missing_rules_total == 1

    # Full mode with only 16 onpage -> provisional
    rep_full_16 = calculate_coverage(1, 1, 0, evals_onpage_16, audit_status="completed", audit_mode="full")
    assert rep_full_16.score_state == "provisional"
    assert rep_full_16.expected_rules_total == 51
    assert rep_full_16.missing_rules_total == 35
