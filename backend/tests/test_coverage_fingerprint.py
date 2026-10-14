"""Tests for registered-rule execution coverage accuracy and versioned evidence fingerprinting."""

import copy
import random
import pytest
from app.audit_engine.registry import default_registry
from app.scoring.coverage import calculate_coverage
from app.scoring.engine import ScoringEngine, compute_input_fingerprint
from app.scoring.policy import ScoringPolicy


# =========================================================================
# 1. RULE-FAMILY COVERAGE ACCURACY TESTS (SECTION 4)
# =========================================================================

def test_single_technical_rule_does_not_imply_100_percent_completion():
    """1 of 22 technical rules executed must NOT claim 100% completion; 21 rules are missing."""
    policy = ScoringPolicy()
    evals = [
        {
            "rule_id": "TECH_HTTPS_USAGE",
            "category": "technical",
            "status": "pass",
            "severity": "critical",
            "page_url": "https://example.com/",
        }
    ]

    cov = calculate_coverage(
        total_pages=1,
        evaluated_pages=1,
        failed_pages=0,
        evaluations=evals,
        audit_status="completed",
        policy=policy,
        audit_mode="full",
    )

    tech_exec = cov.rule_family_execution["technical"]
    assert tech_exec["expected_count"] == 22
    assert tech_exec["executed_count"] == 1
    assert tech_exec["missing_count"] == 21
    assert len(tech_exec["missing_rule_ids"]) == 21
    assert "TECH_REDIRECT_LOOP" in tech_exec["missing_rule_ids"]
    assert "TECH_HTTP_5XX" in tech_exec["missing_rule_ids"]
    assert tech_exec["execution_ratio"] == round(1 / 22, 3)
    assert cov.rule_family_completion["technical"] == round(1 / 22, 3)
    assert tech_exec["status"] == "partial"

    # Crucial assertion: partial execution must never receive unqualified 'available' status
    assert cov.score_state == "provisional"


def test_full_technical_execution():
    """When all 22 technical rules are evaluated, execution ratio is 1.0 and missing_count is 0."""
    policy = ScoringPolicy()
    tech_rules = default_registry.get_technical_rules()
    assert len(tech_rules) == 22

    evals = [
        {
            "rule_id": r.rule_id,
            "category": r.category,
            "status": "pass",
            "severity": r.default_severity,
            "page_url": "https://example.com/",
        }
        for r in tech_rules
    ]

    cov = calculate_coverage(
        total_pages=1,
        evaluated_pages=1,
        failed_pages=0,
        evaluations=evals,
        audit_status="completed",
        policy=policy,
        audit_mode="full",
    )

    tech_exec = cov.rule_family_execution["technical"]
    assert tech_exec["expected_count"] == 22
    assert tech_exec["executed_count"] == 22
    assert tech_exec["missing_count"] == 0
    assert tech_exec["missing_rule_ids"] == []
    assert tech_exec["execution_ratio"] == 1.0
    assert cov.rule_family_completion["technical"] == 1.0
    assert tech_exec["status"] == "complete"


def test_missing_sitewide_family_marks_audit_provisional():
    """An audit with On-Page and Technical rules but 0 Site-Wide rules must be marked provisional."""
    policy = ScoringPolicy()
    onpage_rules = default_registry.get_onpage_rules()
    tech_rules = default_registry.get_technical_rules()

    evals = [
        {"rule_id": r.rule_id, "category": r.category, "status": "pass", "severity": "medium", "page_url": "https://example.com/"}
        for r in (onpage_rules + tech_rules)
    ]

    cov = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_status="completed",
        policy=policy,
        audit_mode="full",
    )

    assert cov.rule_family_execution["sitewide"]["status"] == "not_evaluated"
    assert cov.rule_family_execution["sitewide"]["executed_count"] == 0
    assert cov.rule_family_execution["sitewide"]["missing_count"] == 13
    assert cov.score_state == "provisional"


def test_no_assessments_yields_insufficient_evidence():
    """An audit with 0 evaluations yields insufficient_evidence state."""
    cov = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=[],
        audit_status="completed",
    )
    assert cov.score_state == "insufficient_evidence"
    assert cov.coverage_ratio == 0.0


def test_unknown_assessments_tracked_without_conflation():
    """Unknown observations are accurately counted and reduce evidence completion without being treated as not-applicable."""
    evals = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "status": "pass", "severity": "high"},
        {"rule_id": "ONPAGE_TITLE_LENGTH", "category": "on_page", "status": "unknown", "severity": "medium"},
        {"rule_id": "ONPAGE_H1_PRESENCE", "category": "on_page", "status": "not_applicable", "severity": "low"},
    ]

    cov = calculate_coverage(
        total_pages=1,
        evaluated_pages=1,
        failed_pages=0,
        evaluations=evals,
        audit_status="completed",
    )
    assert cov.rule_evaluations_pass == 1
    assert cov.rule_evaluations_unknown == 1
    assert cov.rule_evaluations_not_applicable == 1
    assert cov.rule_evaluations_total == 3


# =========================================================================
# 2. EVIDENCE FINGERPRINT TESTS (SECTION 5)
# =========================================================================

def test_fingerprint_changes_when_http_evidence_changes():
    """Same rule, status, and URL with different HTTP evidence in JSON must produce different fingerprints."""
    base_evals = [
        {
            "rule_id": "TECH_HTTP_5XX",
            "category": "technical",
            "page_url": "https://example.com/api",
            "status": "fail",
            "severity": "critical",
            "evidence": {"http_status": 500, "message": "Internal Server Error"},
        }
    ]
    fp_500 = compute_input_fingerprint(base_evals, pages_count=1)

    changed_evals = [
        {
            "rule_id": "TECH_HTTP_5XX",
            "category": "technical",
            "page_url": "https://example.com/api",
            "status": "fail",
            "severity": "critical",
            "evidence": {"http_status": 503, "message": "Service Unavailable"},
        }
    ]
    fp_503 = compute_input_fingerprint(changed_evals, pages_count=1)

    assert fp_500 != fp_503
    assert len(fp_500) == 64
    assert len(fp_503) == 64


def test_fingerprint_changes_when_canonical_target_changes():
    """Same status and page URL with different canonical target URL in evidence alters the fingerprint."""
    evals_a = [
        {
            "rule_id": "TECH_CANONICAL_CONFLICT",
            "category": "technical",
            "page_url": "https://example.com/item",
            "status": "warning",
            "severity": "medium",
            "evidence": {"canonical_target": "https://example.com/item-a"},
        }
    ]
    fp_a = compute_input_fingerprint(evals_a, pages_count=1)

    evals_b = [
        {
            "rule_id": "TECH_CANONICAL_CONFLICT",
            "category": "technical",
            "page_url": "https://example.com/item",
            "status": "warning",
            "severity": "medium",
            "evidence": {"canonical_target": "https://example.com/item-b"},
        }
    ]
    fp_b = compute_input_fingerprint(evals_b, pages_count=1)

    assert fp_a != fp_b


def test_fingerprint_changes_when_page_identities_change():
    """Identical count and status with different page URLs alters the fingerprint."""
    evals_1 = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "page_url": "https://example.com/page-1", "status": "pass"}
    ]
    evals_2 = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "page_url": "https://example.com/page-2", "status": "pass"}
    ]

    fp_1 = compute_input_fingerprint(evals_1, pages_count=1)
    fp_2 = compute_input_fingerprint(evals_2, pages_count=1)
    assert fp_1 != fp_2


def test_fingerprint_changes_when_policy_weights_change():
    """Altering policy category weights changes the fingerprint, invalidating stale scorecards."""
    evals = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "page_url": "https://example.com/", "status": "pass"}
    ]
    policy_standard = ScoringPolicy(
        category_weights={"on_page": 0.35, "technical": 0.40, "sitewide": 0.25}
    )
    policy_custom = ScoringPolicy(
        category_weights={"on_page": 0.50, "technical": 0.30, "sitewide": 0.20}
    )

    fp_std = compute_input_fingerprint(evals, pages_count=1, policy=policy_standard)
    fp_cust = compute_input_fingerprint(evals, pages_count=1, policy=policy_custom)
    assert fp_std != fp_cust


def test_fingerprint_changes_when_policy_version_changes():
    """Altering policy version changes the fingerprint."""
    evals = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "page_url": "https://example.com/", "status": "pass"}
    ]
    policy_v1 = ScoringPolicy(version="2.4.0")
    policy_v2 = ScoringPolicy(version="2.5.0")

    fp_v1 = compute_input_fingerprint(evals, pages_count=1, policy=policy_v1)
    fp_v2 = compute_input_fingerprint(evals, pages_count=1, policy=policy_v2)
    assert fp_v1 != fp_v2


def test_fingerprint_is_order_invariant_and_idempotent():
    """Reordering evaluation rows yields the exact same deterministic SHA-256 fingerprint."""
    items = [
        {"rule_id": f"ONPAGE_RULE_{i}", "category": "on_page", "page_url": f"https://example.com/p{i}", "status": "pass", "evidence": {"val": i}}
        for i in range(15)
    ]
    fp_original = compute_input_fingerprint(items, pages_count=15)

    items_shuffled = copy.deepcopy(items)
    random.seed(12345)
    random.shuffle(items_shuffled)
    fp_shuffled = compute_input_fingerprint(items_shuffled, pages_count=15)

    assert fp_original == fp_shuffled
    assert len(fp_original) == 64
