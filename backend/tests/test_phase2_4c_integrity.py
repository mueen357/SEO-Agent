"""Comprehensive regression test suite for Phase 2 Task 2.4C integrity hardening.

Validates:
1. Scoring Family Mapping & Display Category Preservation (All 51 rules)
2. Registered-Rule Execution Coverage & State Transitions
3. Deterministic Evidence-Aware Fingerprinting & Staleness Detection
4. Evidence-Aware Priority Tiering & Ranking
5. Near-Duplicate Clustering Safety Bounds & Determinism
"""

import hashlib
import time
import uuid
from unittest.mock import MagicMock

import pytest

from app.audit_engine.context import SiteWideAuditContext
from app.audit_engine.registry import RuleRegistry
from app.audit_engine.rules.sitewide.duplicate_content import DuplicateNearContentRule
from app.content.fingerprint import compute_simhash64
from app.scoring.calculator import (
    calculate_category_scores,
    calculate_composite_score,
    calculate_rule_score,
)
from app.scoring.coverage import calculate_coverage
from app.scoring.engine import ScoringEngine, compute_input_fingerprint
from app.scoring.grouping import group_findings_by_rule_and_cause
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy
from app.scoring.priorities import classify_priority_tier, compute_priority_items
from app.scoring.rule_mapping import (
    ALL_SCORING_FAMILIES,
    RULE_FAMILY_PREFIXES,
    get_rule_scoring_family,
    get_rules_for_family,
    validate_rule_family_mapping,
)


# =========================================================================
# 1. SCORING FAMILY MAPPING REGRESSION TESTS
# =========================================================================

def test_all_51_rules_mapped_and_partitioned():
    """Verify that all 51 registered rules are mapped into exactly one family."""
    registry = RuleRegistry()
    all_rules = registry.get_all_rules()
    assert len(all_rules) == 51

    onpage_rules = registry.get_onpage_rules()
    technical_rules = registry.get_technical_rules()
    sitewide_rules = registry.get_sitewide_rules()

    assert len(onpage_rules) == 16
    assert len(technical_rules) == 22
    assert len(sitewide_rules) == 13

    # Validate mapping utility
    val = validate_rule_family_mapping(all_rules)
    assert val["total_rules"] == 51
    assert val["unmapped_count"] == 0
    assert len(val["unmapped_rules"]) == 0
    assert len(val["family_counts"]) == 3
    assert val["family_counts"]["on_page"] == 16
    assert val["family_counts"]["technical"] == 22
    assert val["family_counts"]["sitewide"] == 13

    # Verify no rule appears in more than one family
    onpage_ids = {r.rule_id for r in onpage_rules}
    technical_ids = {r.rule_id for r in technical_rules}
    sitewide_ids = {r.rule_id for r in sitewide_rules}

    assert onpage_ids.isdisjoint(technical_ids)
    assert onpage_ids.isdisjoint(sitewide_ids)
    assert technical_ids.isdisjoint(sitewide_ids)


def test_rule_display_categories_retained():
    """Verify that original descriptive categories are preserved for UI and findings."""
    registry = RuleRegistry()

    # Image checks have category 'images', but family 'on_page'
    img_rule = registry.get_rule("ONPAGE_IMAGE_ALT_MISSING")
    assert img_rule is not None
    assert img_rule.category == "images"
    assert get_rule_scoring_family("ONPAGE_IMAGE_ALT_MISSING") == "on_page"

    # Link checks have category 'links', but family 'on_page'
    link_rule = registry.get_rule("ONPAGE_INTERNAL_OUTLINKS")
    assert link_rule is not None
    assert link_rule.category == "links"
    assert get_rule_scoring_family("ONPAGE_INTERNAL_OUTLINKS") == "on_page"

    # Content duplicate checks have category 'content', but family 'sitewide'
    content_rule = registry.get_rule("SITE_CONTENT_DUPLICATE_EXACT")
    assert content_rule is not None
    assert content_rule.category == "content"
    assert get_rule_scoring_family("SITE_CONTENT_DUPLICATE_EXACT") == "sitewide"


def test_scoring_engine_unknown_rules_not_dropped():
    """Verify that unrecognized rule IDs are not silently dropped from reports."""
    engine = ScoringEngine()
    evals = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "status": "pass", "severity": "high"},
        {"rule_id": "UNRECOGNIZED_CUSTOM_AUDIT_RULE", "status": "fail", "severity": "critical"},
    ]

    card, prios = engine.evaluate_audit(
        audit_id=uuid.uuid4(),
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
    )
    unrec = card["coverage_json"].get("details", {}).get("unrecognized_rules", [])
    assert "UNRECOGNIZED_CUSTOM_AUDIT_RULE" in unrec
    assert "UNRECOGNIZED_CUSTOM_AUDIT_RULE" in card["explanation_json"].get("unrecognized_rules", [])


# =========================================================================
# 2. RULE-FAMILY COVERAGE & PROVENANCE REGRESSION TESTS
# =========================================================================

def test_coverage_single_technical_rule_does_not_imply_100_percent():
    """One passing technical rule must not imply 100% technical family completion."""
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

    tech_data = report.rule_family_execution["technical"]
    assert tech_data["expected_count"] == 22
    assert tech_data["executed_count"] == 1
    assert tech_data["missing_count"] == 21
    assert tech_data["execution_ratio"] == round(1 / 22, 3)
    assert tech_data["status"] == "partial"
    assert report.score_state == "provisional"


def test_coverage_full_execution():
    """When all 51 rules execute across eligible pages, report shows complete status."""
    registry = RuleRegistry()
    evals = []
    for r in registry.get_all_rules():
        evals.append({
            "rule_id": r.rule_id,
            "status": "pass",
            "severity": r.default_severity,
            "page_url": "https://example.com/",
        })

    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.rule_family_execution["on_page"]["status"] == "complete"
    assert report.rule_family_execution["technical"]["status"] == "complete"
    assert report.rule_family_execution["sitewide"]["status"] == "complete"
    assert report.score_state == "available"


def test_coverage_missing_sitewide_in_full_audit():
    """Full audit missing sitewide execution must remain provisional."""
    registry = RuleRegistry()
    evals = []
    for r in registry.get_onpage_rules() + registry.get_technical_rules():
        evals.append({
            "rule_id": r.rule_id,
            "status": "pass",
            "severity": r.default_severity,
            "page_url": "https://example.com/",
        })

    report = calculate_coverage(
        total_pages=5,
        evaluated_pages=5,
        failed_pages=0,
        evaluations=evals,
        audit_mode="full",
    )
    assert report.rule_family_execution["sitewide"]["status"] == "not_evaluated"
    assert report.score_state == "provisional"


# =========================================================================
# 3. DETERMINISTIC FINGERPRINT & STALENESS TESTS
# =========================================================================

def test_fingerprint_evidence_change_detection():
    """Evidence changes must alter fingerprint even if status, severity, and URL remain identical."""
    eval_a = [{
        "rule_id": "TECH_HTTP_5XX",
        "status": "fail",
        "severity": "critical",
        "page_url": "https://example.com/api",
        "evidence": {"http_status": 500, "headers": {"retry-after": "120"}},
    }]
    eval_b = [{
        "rule_id": "TECH_HTTP_5XX",
        "status": "fail",
        "severity": "critical",
        "page_url": "https://example.com/api",
        "evidence": {"http_status": 503, "headers": {"retry-after": "30"}},
    }]

    fp_a = compute_input_fingerprint(eval_a, pages_count=10)
    fp_b = compute_input_fingerprint(eval_b, pages_count=10)
    assert fp_a != fp_b


def test_fingerprint_policy_change_invalidation():
    """Policy weights or version changes must invalidate fingerprint."""
    evals = [{"rule_id": "ONPAGE_TITLE_PRESENT", "status": "fail", "severity": "high", "page_url": "https://example.com/"}]

    pol_v1 = ScoringPolicy(version="2.4.0", category_weights={"on_page": 0.40, "technical": 0.35, "sitewide": 0.25})
    pol_v2 = ScoringPolicy(version="2.4.1", category_weights={"on_page": 0.50, "technical": 0.25, "sitewide": 0.25})

    fp1 = compute_input_fingerprint(evals, pages_count=5, policy=pol_v1)
    fp2 = compute_input_fingerprint(evals, pages_count=5, policy=pol_v2)
    assert fp1 != fp2


def test_fingerprint_order_invariance():
    """Evaluations provided in different orders must produce identical fingerprints."""
    item1 = {"rule_id": "TECH_HTTP_4XX", "status": "fail", "severity": "high", "page_url": "https://example.com/404"}
    item2 = {"rule_id": "ONPAGE_H1_PRESENCE", "status": "pass", "severity": "medium", "page_url": "https://example.com/p"}

    fp_order1 = compute_input_fingerprint([item1, item2], pages_count=2)
    fp_order2 = compute_input_fingerprint([item2, item1], pages_count=2)
    assert fp_order1 == fp_order2


# =========================================================================
# 4. PRIORITY ENGINE ACCURACY TESTS
# =========================================================================

def test_priority_weak_evidence_critical_demoted():
    """Critical severity with weak evidence must be demoted and not receive P0."""
    tier = classify_priority_tier(
        rule_id="CUSTOM_ERROR",
        severity="critical",
        affected_pages=1,
        status="fail",
        evidence={"weak_evidence": True},
        total_pages=20,
    )
    assert tier == "P2"


def test_priority_unknown_findings_barred_from_p0_p1():
    """Findings with status='unknown' must strictly be barred from P0 and P1."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=5,
        status="unknown",
        evidence={"error": "socket timeout"},
        total_pages=5,
    )
    assert tier == "P2"
    assert tier not in ("P0", "P1")


def test_priority_isolated_500_is_p1():
    """An isolated HTTP 500 on 1 page of a multi-page site is P1, not P0."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="high",
        affected_pages=1,
        status="fail",
        evidence={"http_status": 500, "page_url": "https://example.com/deep/item"},
        total_pages=30,
        is_entrance_page=False,
    )
    assert tier == "P1"


def test_priority_intentional_noindex_is_p2():
    """Intentional noindex directive is P2, not P0/P1."""
    tier = classify_priority_tier(
        rule_id="TECH_META_ROBOTS_DIRECTIVES",
        severity="high",
        affected_pages=4,
        status="fail",
        evidence={"is_intentional": True},
        total_pages=20,
    )
    assert tier == "P2"


# =========================================================================
# 5. DUPLICATE CLUSTERING SAFETY & BOUNDS TESTS
# =========================================================================

def _make_page(url: str, text: str):
    p = MagicMock()
    p.id = uuid.uuid4()
    p.final_url = url
    p.requested_url = url
    p.fetch_status = "success"
    p.http_status = 200
    p.content_quality_status = "usable"
    p.main_text_word_count = len(text.split())
    p.main_text_simhash = compute_simhash64(text)
    return p


def test_clustering_abc_bridge_never_merges_endpoints():
    """A-B-C similarity bridge decomposes into cliques without merging endpoints A and C."""
    rule = DuplicateNearContentRule()
    pA = _make_page("https://example.com/A", "filler text A")
    pB = _make_page("https://example.com/B", "filler text B")
    pC = _make_page("https://example.com/C", "filler text C")

    pA.main_text_word_count = 100
    pB.main_text_word_count = 100
    pC.main_text_word_count = 100

    pA.main_text_simhash = f"{0x0000000000000000:016x}"
    pB.main_text_simhash = f"{0x0000000000000003:016x}"
    pC.main_text_simhash = f"{0x000000000000000F:016x}"

    ctx = SiteWideAuditContext(audit_id=uuid.uuid4(), pages=[pA, pB, pC])
    assessments = rule.evaluate_site(ctx)

    assert len(assessments) == 1
    assert assessments[0].evidence["page_count"] == 2
    urls = assessments[0].evidence["all_urls"]
    assert not ("https://example.com/A" in urls and "https://example.com/C" in urls)


def test_clustering_500_page_benchmark_performance():
    """Clustering 500 pages completes within bounded runtime."""
    rule = DuplicateNearContentRule()
    pages = []
    base_text = ("Deterministic test body text for benchmarking graph decomposition in near duplicate rule ") * 10

    # 10 clusters of 5 pages
    for c in range(10):
        t = f"Cluster {c}: " + base_text
        sh = compute_simhash64(t)
        for i in range(5):
            p = _make_page(f"https://example.com/c{c}/p{i}", t)
            p.main_text_simhash = sh
            p.main_text_word_count = 120
            pages.append(p)

    # 450 unique pages with orthogonal simhashes (preventing unintentional collisions)
    for i in range(450):
        p = _make_page(f"https://example.com/u/{i}", f"Unique independent page {i}")
        p.main_text_word_count = 120
        # Orthogonal bit spread
        p.main_text_simhash = f"{(i * 0x1f1f1f1f1f1f1f1f) & 0xFFFFFFFFFFFFFFFF:016x}"
        pages.append(p)

    assert len(pages) == 500

    start = time.perf_counter()
    ctx = SiteWideAuditContext(audit_id=uuid.uuid4(), pages=pages)
    assessments = rule.evaluate_site(ctx)
    duration = time.perf_counter() - start

    assert duration < 5.0, f"500-page execution took too long: {duration:.2f}s"
    assert len(assessments) >= 10
    for ass in assessments:
        assert ass.status in ("warning", "fail", "unknown")
        assert ass.evidence["page_count"] >= 2
