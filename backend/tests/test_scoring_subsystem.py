"""Comprehensive tests for SEO Health Scoring, policy, coverage, priorities, and APIs."""

import uuid
from typing import AsyncGenerator
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_engine.registry import default_registry
from app.audit_engine.result import RuleAssessment
from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage, SeoIssue
from app.scoring.calculator import (
    calculate_category_scores,
    calculate_composite_score,
    calculate_rule_score,
)
from app.scoring.coverage import calculate_coverage
from app.scoring.engine import ScoringEngine, compute_input_fingerprint
from app.scoring.grouping import create_group_fingerprint, group_findings_by_rule_and_cause
from app.scoring.policy import ScoringPolicy
from app.scoring.priorities import classify_priority_tier, compute_priority_items


# =========================================================================
# 1. SCORING POLICY & CALCULATOR UNIT TESTS
# =========================================================================

def test_scoring_policy_defaults():
    policy = ScoringPolicy()
    assert policy.version == "2.4.0"
    assert sum(policy.category_weights.values()) == 1.00
    assert policy.category_weights["on_page"] == 0.35
    assert policy.category_weights["technical"] == 0.40
    assert policy.category_weights["sitewide"] == 0.25
    assert policy.status_multipliers["unknown"] is None  # Excluded from direct health penalties
    assert policy.status_multipliers["not_applicable"] is None


def test_rule_score_exact_formula():
    policy = ScoringPolicy()
    # 4 pages evaluated for a page rule: 2 pass (1.0), 1 warning (0.5), 1 fail (0.0)
    # Expected: (1.0 + 1.0 + 0.5 + 0.0) / 4 = 2.5 / 4 = 62.5%
    evals = [
        {"status": "pass", "is_sitewide": False},
        {"status": "pass", "is_sitewide": False},
        {"status": "warning", "is_sitewide": False},
        {"status": "fail", "is_sitewide": False},
    ]
    r = calculate_rule_score(evals, default_severity="high", policy=policy)
    assert r is not None
    assert r["score"] == 62.5
    assert r["deduction"] == 37.5
    assert r["pass_count"] == 2
    assert r["warn_count"] == 1
    assert r["fail_count"] == 1
    assert r["known_applicable_count"] == 4


def test_unknown_status_does_not_penalize_known_checks():
    policy = ScoringPolicy()
    # Example: 5 passes, 5 unknowns -> Known-check health = 100.0, unknown_count = 5
    evals = [{"status": "pass", "is_sitewide": False}] * 5 + [{"status": "unknown", "is_sitewide": False}] * 5
    r = calculate_rule_score(evals, default_severity="medium", policy=policy)
    assert r is not None
    assert r["score"] == 100.0  # Known-check health is 100.0
    assert r["known_applicable_count"] == 5
    assert r["unknown_count"] == 5
    assert r["eligible_count"] == 10

    # If all assessments are unknown, known_applicable_count == 0 -> score is None (never 100!)
    evals_all_unknown = [{"status": "unknown", "is_sitewide": False}] * 5
    r_unknown = calculate_rule_score(evals_all_unknown, default_severity="medium", policy=policy)
    assert r_unknown is not None
    assert r_unknown["score"] is None
    assert r_unknown["known_applicable_count"] == 0


def test_not_applicable_excluded_from_denominator():
    policy = ScoringPolicy()
    # 3 evaluations: 1 pass, 2 not_applicable -> 1.0 / 1 = 100.0%
    evals = [
        {"status": "pass", "is_sitewide": False},
        {"status": "not_applicable", "is_sitewide": False},
        {"status": "not_applicable", "is_sitewide": False},
    ]
    r = calculate_rule_score(evals, default_severity="medium", policy=policy)
    assert r is not None
    assert r["score"] == 100.0
    assert r["eligible_count"] == 1


def test_composite_score_exact_weighting():
    policy = ScoringPolicy()
    cat_scores = {
        "on_page": 80.0,    # 80 * 0.35 = 28.0
        "technical": 90.0,  # 90 * 0.40 = 36.0
        "sitewide": 70.0,   # 70 * 0.25 = 17.5
    }
    # Expected composite: 28.0 + 36.0 + 17.5 = 81.5
    score, label = calculate_composite_score(cat_scores, score_state="available", policy=policy)
    assert score == 81.5
    assert label == "good"


def test_insufficient_evidence_produces_none_score():
    policy = ScoringPolicy()
    cat_scores = {"on_page": 80.0, "technical": 90.0, "sitewide": 70.0}
    score, label = calculate_composite_score(cat_scores, score_state="insufficient_evidence", policy=policy)
    assert score is None
    assert label == "unrated"


# =========================================================================
# 2. EVIDENCE COVERAGE & CONFIDENCE TESTS
# =========================================================================

def test_coverage_state_transitions():
    policy = ScoringPolicy()

    # 0 pages evaluated -> insufficient_evidence
    cov_empty = calculate_coverage(
        total_pages=0, evaluated_pages=0, failed_pages=0,
        evaluations=[], audit_status="completed", policy=policy
    )
    assert cov_empty.score_state == "insufficient_evidence"
    assert cov_empty.coverage_ratio == 0.0

    # Crawling in progress with partial pages -> provisional
    cov_crawling = calculate_coverage(
        total_pages=10, evaluated_pages=8, failed_pages=2,
        evaluations=[{"status": "pass", "category": "on_page"}],
        audit_status="crawling", policy=policy
    )
    assert cov_crawling.score_state == "provisional"

    # Completed with high coverage -> available
    evals = [{"status": "pass", "category": "on_page"}] * 20
    cov_avail = calculate_coverage(
        total_pages=10, evaluated_pages=10, failed_pages=0,
        evaluations=evals, audit_status="completed", policy=policy
    )
    assert cov_avail.score_state == "available"
    assert cov_avail.coverage_ratio >= 0.80


# =========================================================================
# 3. PRIORITIZATION & GROUPING TESTS
# =========================================================================

def test_priority_tier_classification():
    assert classify_priority_tier("TECH_REDIRECT_LOOP", "high") == "P0"
    assert classify_priority_tier("TECH_HTTP_5XX", "high", evidence={"http_status": 500}) == "P0"
    assert classify_priority_tier("TECH_HTTP_5XX", "high", evidence={}) == "P2"  # Missing evidence demotes to P2
    assert classify_priority_tier("ONPAGE_TITLE_PRESENT", "high") == "P1"
    assert classify_priority_tier("SITE_INTERNAL_LINK_TO_4XX", "high") == "P1"
    assert classify_priority_tier("ONPAGE_META_DESC_PRESENT", "low") == "P2"
    assert classify_priority_tier("ONPAGE_IMAGE_ALT_MISSING", "low") == "P2"
    assert classify_priority_tier("ONPAGE_HTML_LANG", "info") == "P3"


def test_issue_grouping_and_deduplication():
    # 3 distinct pages failing ONPAGE_TITLE_PRESENT
    issues = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "severity": "high", "status": "fail", "page_url": "https://example.com/p1"},
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "severity": "high", "status": "fail", "page_url": "https://example.com/p2"},
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "severity": "high", "status": "fail", "page_url": "https://example.com/p3"},
    ]
    grouped = group_findings_by_rule_and_cause(issues)
    assert len(grouped) == 1
    item = grouped[0]
    assert item["rule_id"] == "ONPAGE_TITLE_PRESENT"
    assert item["affected_page_count"] == 3
    assert len(item["affected_urls_json"]) == 3

    # Ranking
    prioritized = compute_priority_items(grouped, total_pages=3)
    assert len(prioritized) == 1
    assert prioritized[0]["priority_tier"] == "P1"
    assert prioritized[0]["priority_rank"] == 1


# =========================================================================
# 4. ACCURACY HARDENING TESTS
# =========================================================================

def test_near_duplicate_clustering_bridge_prevention():
    """Verify that an A-B-C similarity bridge does not group dissimilar endpoints A and C."""
    from app.audit_engine.rules.sitewide.duplicate_content import DuplicateNearContentRule
    from app.audit_engine.context import SiteWideAuditContext

    # Construct 3 mock crawl pages:
    # Page A: SimHash '0000000000000000'
    # Page B: SimHash '0000000000000007' (diff 3 bits from A -> near duplicate)
    # Page C: SimHash '0000000000000077' (diff 3 bits from B, but 6 bits from A -> NOT near duplicate of A!)
    p_a = CrawlPage(
        id=uuid.uuid4(), requested_url="https://example.com/a", final_url="https://example.com/a",
        fetch_status="success", http_status=200, content_quality_status="usable",
        main_text_word_count=100, main_text_simhash="0000000000000000", normalized_main_text_hash="hash_a"
    )
    p_b = CrawlPage(
        id=uuid.uuid4(), requested_url="https://example.com/b", final_url="https://example.com/b",
        fetch_status="success", http_status=200, content_quality_status="usable",
        main_text_word_count=100, main_text_simhash="0000000000000007", normalized_main_text_hash="hash_b"
    )
    p_c = CrawlPage(
        id=uuid.uuid4(), requested_url="https://example.com/c", final_url="https://example.com/c",
        fetch_status="success", http_status=200, content_quality_status="usable",
        main_text_word_count=100, main_text_simhash="0000000000000077", normalized_main_text_hash="hash_c"
    )

    ctx = SiteWideAuditContext(audit_id=uuid.uuid4(), pages=[p_a, p_b, p_c], links=[], sitemaps=[])
    rule = DuplicateNearContentRule()
    assessments = rule.evaluate_site(ctx)

    # Assessments should NEVER return a 3-page group containing both A and C
    for a in assessments:
        if a.status == "warning":
            ev = a.evidence
            page_ids = ev.get("page_ids", [])
            assert not (str(p_a.id) in page_ids and str(p_c.id) in page_ids), (
                "A-B-C bridge failed: Dissimilar pages A and C were incorrectly grouped into the same cluster!"
            )


# =========================================================================
# 5. FASTAPI SCORING API END-TO-END TESTS
# =========================================================================

@pytest.mark.asyncio
async def test_scoring_api_lifecycle(client: AsyncClient, test_db_session: AsyncSession):
    """End-to-end test verifying POST /score, GET /score, GET /breakdown, and GET /priorities."""
    # 1. Create audit
    audit = Audit(
        id=uuid.uuid4(),
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.quick.value,
        status=AuditStatus.completed.value,
        max_pages=10,
        pages_crawled=2,
    )
    test_db_session.add(audit)

    # 2. Add crawl pages
    page1 = CrawlPage(
        id=uuid.uuid4(),
        audit_id=audit.id,
        requested_url="https://example.com/",
        final_url="https://example.com/",
        fetch_status="success",
        http_status=200,
        content_quality_status="usable",
        title="Example Title",
        headings_json={"h1": ["Example Heading"]},
        canonical_url="https://example.com/",
        content_type="text/html",
    )
    page2 = CrawlPage(
        id=uuid.uuid4(),
        audit_id=audit.id,
        requested_url="https://example.com/about",
        final_url="https://example.com/about",
        fetch_status="success",
        http_status=200,
        content_quality_status="usable",
        title=None,  # Missing title
        headings_json={"h1": []},  # Missing H1
        canonical_url="https://example.com/about",
        content_type="text/html",
    )
    test_db_session.add_all([page1, page2])

    # 3. Add rule assessments as SeoIssue records
    issue1 = SeoIssue(
        id=uuid.uuid4(),
        audit_id=audit.id,
        crawl_page_id=page2.id,
        rule_id="ONPAGE_TITLE_PRESENT",
        category="on_page",
        subcategory="title",
        title="Missing Title Tag",
        description="Page lacks a title element.",
        severity="high",
        status="fail",
        fingerprint="fp_title_missing_about",
        evidence_json={"page_url": page2.final_url},
        recommendation="Add a descriptive title tag.",
    )
    issue2 = SeoIssue(
        id=uuid.uuid4(),
        audit_id=audit.id,
        crawl_page_id=page1.id,
        rule_id="ONPAGE_TITLE_PRESENT",
        category="on_page",
        subcategory="title",
        title="Title Tag Present",
        description="Page has title.",
        severity="high",
        status="pass",
        fingerprint="fp_title_pass_home",
        evidence_json={"page_url": page1.final_url},
        recommendation="None.",
    )
    all_issues = [issue1, issue2]
    # Add other 15 on-page rules as pass to complete the required on_page family for quick audit
    for r in default_registry.get_onpage_rules():
        if r.rule_id != "ONPAGE_TITLE_PRESENT":
            all_issues.append(
                SeoIssue(
                    id=uuid.uuid4(),
                    audit_id=audit.id,
                    crawl_page_id=page1.id,
                    rule_id=r.rule_id,
                    category="on_page",
                    subcategory=getattr(r, "subcategory", "general"),
                    title=f"{r.rule_id} Passed",
                    description="Passing check",
                    severity="medium",
                    status="pass",
                    fingerprint=f"fp_{r.rule_id}_pass",
                    evidence_json={"page_url": page1.final_url},
                    recommendation="None.",
                )
            )
    test_db_session.add_all(all_issues)
    await test_db_session.commit()

    # 4. POST /api/v1/audits/{id}/score
    res_post = await client.post(f"/api/v1/audits/{audit.id}/score")
    assert res_post.status_code == 200
    card_data = res_post.json()
    assert card_data["audit_id"] == str(audit.id)
    assert card_data["overall_score"] is not None
    assert card_data["overall_state"] == "available"
    assert card_data["on_page_score"] == 95.2  # 15 pass rules + 1 rule at 50% = 95.2%

    # 5. GET /api/v1/audits/{id}/score
    res_get = await client.get(f"/api/v1/audits/{audit.id}/score")
    assert res_get.status_code == 200
    assert res_get.json()["id"] == card_data["id"]

    # 6. GET /api/v1/audits/{id}/score/breakdown
    res_bd = await client.get(f"/api/v1/audits/{audit.id}/score/breakdown")
    assert res_bd.status_code == 200
    bd_data = res_bd.json()
    assert bd_data["overall_score"] == card_data["overall_score"]
    assert "formula" in bd_data
    assert "disclaimer" in bd_data
    assert "Google" in bd_data["disclaimer"]

    # 7. GET /api/v1/audits/{id}/score/coverage
    res_cov = await client.get(f"/api/v1/audits/{audit.id}/score/coverage")
    assert res_cov.status_code == 200
    cov_data = res_cov.json()
    assert cov_data["pages_evaluated"] == 2
    assert cov_data["score_state"] == "available"

    # 8. GET /api/v1/audits/{id}/priorities
    res_prio = await client.get(f"/api/v1/audits/{audit.id}/priorities")
    assert res_prio.status_code == 200
    prio_data = res_prio.json()
    assert prio_data["total"] >= 1
    first_item = prio_data["items"][0]
    assert first_item["rule_id"] == "ONPAGE_TITLE_PRESENT"
    assert first_item["priority_tier"] == "P1"
    assert first_item["affected_page_count"] == 1

    # 9. Test Filter by Priority Tier
    res_filtered = await client.get(f"/api/v1/audits/{audit.id}/priorities?priority_tier=P1")
    assert res_filtered.status_code == 200
    assert len(res_filtered.json()["items"]) >= 1

    res_empty_tier = await client.get(f"/api/v1/audits/{audit.id}/priorities?priority_tier=P0")
    assert res_empty_tier.status_code == 200
    assert len(res_empty_tier.json()["items"]) == 0


def test_unknown_status_excluded_from_priority_blockers():
    """Verify that inconclusive unknown assessments never become confirmed P0/P1 blockers."""
    issues = [
        {"rule_id": "TECH_HTTP_5XX", "category": "technical", "severity": "critical", "status": "unknown", "page_url": "https://example.com/p1"},
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "severity": "high", "status": "unknown", "page_url": "https://example.com/p2"},
        {"rule_id": "TECH_REDIRECT_LOOP", "category": "technical", "severity": "critical", "status": "fail", "page_url": "https://example.com/p3"},
    ]
    grouped = group_findings_by_rule_and_cause(issues)
    # Only the confirmed failure (TECH_REDIRECT_LOOP) should be grouped as a remediation blocker
    assert len(grouped) == 1
    assert grouped[0]["rule_id"] == "TECH_REDIRECT_LOOP"
    prio_items = compute_priority_items(grouped, total_pages=3)
    assert len(prio_items) == 1
    assert prio_items[0]["priority_tier"] == "P0"


def test_near_duplicate_clustering_performance_500_pages():
    """Benchmark clustering performance on 500 simulated crawl pages."""
    import time
    from unittest.mock import MagicMock
    from app.audit_engine.context import SiteWideAuditContext
    from app.audit_engine.rules.sitewide.duplicate_content import DuplicateNearContentRule

    rule = DuplicateNearContentRule()
    pages = []
    # Generate 500 pages with SimHash values: 5 distinct clusters of 5 pages, rest unique
    for i in range(500):
        p = MagicMock()
        p.id = uuid.uuid4()
        p.fetch_status = "success"
        p.http_status = 200
        p.content_quality_status = "usable"
        p.main_text_word_count = 100
        p.final_url = f"https://example.com/page_{i}"
        p.requested_url = f"https://example.com/page_{i}"
        p.normalized_main_text_hash = f"hash_{i}"
        # For first 25 pages, group every 5 pages into 5 distinct clusters
        # Use sha256 prefix so unique pages have high Hamming distance (>20 bits)
        import hashlib
        if i < 25:
            cluster_idx = i // 5
            p.main_text_simhash = hashlib.sha256(f"cluster_{cluster_idx}".encode()).hexdigest()[:16]
        else:
            p.main_text_simhash = hashlib.sha256(f"unique_page_{i}".encode()).hexdigest()[:16]
        pages.append(p)

    ctx = SiteWideAuditContext(audit_id=uuid.uuid4(), pages=pages)
    t0 = time.time()
    assessments = rule.evaluate_site(ctx)
    duration = time.time() - t0

    assert duration < 2.0, f"Clustering took too long: {duration:.2f}s"
    warn_assessments = [a for a in assessments if a.status == "warning"]
    assert len(warn_assessments) == 5
    for a in warn_assessments:
        assert a.evidence["page_count"] == 5


def test_near_duplicate_overlapping_clique_disjoint_selection():
    """Ensure maximal cliques do not double count pages or inflate priorities across overlaps."""
    from unittest.mock import MagicMock
    from app.audit_engine.context import SiteWideAuditContext
    from app.audit_engine.rules.sitewide.duplicate_content import DuplicateNearContentRule

    rule = DuplicateNearContentRule()
    # A-B-C bridge where A~B and B~C, but A!~C
    pA = MagicMock(id=uuid.uuid4(), fetch_status="success", http_status=200, content_quality_status="usable",
                   main_text_word_count=100, final_url="https://example.com/a", requested_url="https://example.com/a",
                   normalized_main_text_hash="hA", main_text_simhash="0000000000000000")
    # pB has Hamming distance 2 from pA (bits 0,1 flipped)
    pB = MagicMock(id=uuid.uuid4(), fetch_status="success", http_status=200, content_quality_status="usable",
                   main_text_word_count=100, final_url="https://example.com/b", requested_url="https://example.com/b",
                   normalized_main_text_hash="hB", main_text_simhash="0000000000000003")
    # pC has Hamming distance 2 from pB (bits 2,3 flipped), but distance 4 from pA (> 3, not similar)
    pC = MagicMock(id=uuid.uuid4(), fetch_status="success", http_status=200, content_quality_status="usable",
                   main_text_word_count=100, final_url="https://example.com/c", requested_url="https://example.com/c",
                   normalized_main_text_hash="hC", main_text_simhash="000000000000000f")

    ctx = SiteWideAuditContext(audit_id=uuid.uuid4(), pages=[pA, pB, pC])
    assessments = rule.evaluate_site(ctx)
    warn_assessments = [a for a in assessments if a.status == "warning"]

    # Must NOT group A, B, C together into a 3-page cluster
    for a in warn_assessments:
        assert a.evidence["page_count"] < 3

    # All affected page URLs reported across all clusters should be distinct (no double-counting)
    all_urls = []
    for a in warn_assessments:
        all_urls.extend(a.evidence["all_urls"])
    assert len(all_urls) == len(set(all_urls)), "Pages were double-counted across overlapping clusters!"
