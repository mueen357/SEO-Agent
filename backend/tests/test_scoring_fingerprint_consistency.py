"""Regression tests for Task 2.4D: Scoring Fingerprint Consistency and Staleness Detection.

Verifies:
1. Identical evidence produces identical hash.
2. Row reordering produces identical hash (order-invariant).
3. HTTP 200 to 500 produces a different hash.
4. Fetch success to error produces a different hash.
5. Canonical target change produces a new hash.
6. Redirect target change produces a new hash.
7. Page ID change produces a new hash.
8. Seed URL change produces a new hash.
9. Scoring policy change produces a new hash.
10. Render evidence change produces a new hash.
11. New issue assessment produces a new hash.
12. Recalculation produces current fingerprint without false staleness.
13. GET score detects truly stale persisted scorecard when crawl evidence mutates.
"""

import uuid
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage, SeoIssue
from app.scoring.engine import compute_input_fingerprint, FINGERPRINT_VERSION
from app.scoring.policy import ScoringPolicy
from app.services.scoring_service import ScoringService


@pytest.fixture
def base_evals():
    return [
        {
            "rule_id": "ONPAGE_TITLE_PRESENT",
            "category": "on_page",
            "status": "pass",
            "severity": "high",
            "page_url": "https://example.com/",
            "rule_version": "1.0.0",
            "evidence": {"title": "Home"},
        },
        {
            "rule_id": "TECH_HTTPS_USAGE",
            "category": "technical",
            "status": "pass",
            "severity": "critical",
            "page_url": "https://example.com/",
            "rule_version": "1.0.0",
            "evidence": {"is_https": True},
        },
    ]


@pytest.fixture
def base_pages():
    return [
        {
            "page_id": "p1",
            "requested_url": "https://example.com/",
            "final_url": "https://example.com/",
            "http_status": 200,
            "fetch_status": "success",
            "canonical_url": "https://example.com/",
            "redirect_chain": [],
            "depth": 0,
            "has_render": False,
        },
        {
            "page_id": "p2",
            "requested_url": "https://example.com/about",
            "final_url": "https://example.com/about",
            "http_status": 200,
            "fetch_status": "success",
            "canonical_url": "https://example.com/about",
            "redirect_chain": [],
            "depth": 1,
            "has_render": False,
        },
    ]


def test_1_identical_evidence_produces_identical_hash(base_evals, base_pages):
    fp1 = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        audit_id="audit-123",
        page_evidence_summary=base_pages,
        seed_url="https://example.com/",
    )
    fp2 = compute_input_fingerprint(
        evaluations=[dict(e) for e in base_evals],
        pages_count=2,
        audit_id="audit-123",
        page_evidence_summary=[dict(p) for p in base_pages],
        seed_url="https://example.com/",
    )
    assert fp1 == fp2
    assert len(fp1) == 64


def test_2_row_reordering_produces_identical_hash(base_evals, base_pages):
    fp_normal = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        audit_id="audit-123",
        page_evidence_summary=base_pages,
        seed_url="https://example.com/",
    )
    # Reverse evaluation order and page order
    fp_reversed = compute_input_fingerprint(
        evaluations=list(reversed(base_evals)),
        pages_count=2,
        audit_id="audit-123",
        page_evidence_summary=list(reversed(base_pages)),
        seed_url="https://example.com/",
    )
    assert fp_normal == fp_reversed


def test_3_http_200_to_500_produces_different_hash(base_evals, base_pages):
    fp_200 = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
    )
    mutated_pages = [dict(p) for p in base_pages]
    mutated_pages[1]["http_status"] = 500

    fp_500 = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=mutated_pages,
    )
    assert fp_200 != fp_500


def test_4_fetch_success_to_error_produces_different_hash(base_evals, base_pages):
    fp_success = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
    )
    mutated_pages = [dict(p) for p in base_pages]
    mutated_pages[1]["fetch_status"] = "network_timeout"

    fp_error = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=mutated_pages,
    )
    assert fp_success != fp_error


def test_5_canonical_target_changes_produces_new_hash(base_evals, base_pages):
    fp_orig = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
    )
    mutated_pages = [dict(p) for p in base_pages]
    mutated_pages[1]["canonical_url"] = "https://example.com/canonical-override"

    fp_mut = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=mutated_pages,
    )
    assert fp_orig != fp_mut


def test_6_redirect_target_changes_produces_new_hash(base_evals, base_pages):
    fp_orig = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
    )
    mutated_pages = [dict(p) for p in base_pages]
    mutated_pages[1]["final_url"] = "https://example.com/about-redirected"
    mutated_pages[1]["redirect_chain"] = [{"url": "https://example.com/about", "status": 301}]

    fp_mut = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=mutated_pages,
    )
    assert fp_orig != fp_mut


def test_7_page_id_changes_produces_new_hash(base_evals, base_pages):
    fp_orig = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
    )
    mutated_pages = [dict(p) for p in base_pages]
    mutated_pages[1]["page_id"] = "different-page-uuid"

    fp_mut = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=mutated_pages,
    )
    assert fp_orig != fp_mut


def test_8_seed_url_changes_produces_new_hash(base_evals, base_pages):
    fp1 = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
        seed_url="https://example.com/",
    )
    fp2 = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
        seed_url="https://example.com/other-seed",
    )
    assert fp1 != fp2


def test_9_scoring_policy_changes_produces_new_hash(base_evals, base_pages):
    pol1 = ScoringPolicy()
    pol2 = ScoringPolicy(category_weights={"on_page": 0.50, "technical": 0.30, "sitewide": 0.20})

    fp1 = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        policy=pol1,
        page_evidence_summary=base_pages,
    )
    fp2 = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        policy=pol2,
        page_evidence_summary=base_pages,
    )
    assert fp1 != fp2


def test_10_render_evidence_changes_produces_new_hash(base_evals, base_pages):
    fp_no_render = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        has_renders=False,
        page_evidence_summary=base_pages,
    )
    fp_with_render = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        has_renders=True,
        page_evidence_summary=base_pages,
    )
    assert fp_no_render != fp_with_render


def test_11_new_issue_assessment_produces_new_hash(base_evals, base_pages):
    fp_orig = compute_input_fingerprint(
        evaluations=base_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
    )
    new_evals = list(base_evals) + [
        {
            "rule_id": "ONPAGE_H1_PRESENCE",
            "category": "on_page",
            "status": "fail",
            "severity": "high",
            "page_url": "https://example.com/about",
            "rule_version": "1.0.0",
            "evidence": {"h1_count": 0},
        }
    ]
    fp_new = compute_input_fingerprint(
        evaluations=new_evals,
        pages_count=2,
        page_evidence_summary=base_pages,
    )
    assert fp_orig != fp_new


@pytest.mark.asyncio
async def test_12_and_13_scoring_service_staleness_and_recalculation(test_db_session: AsyncSession):
    """ScoringService detects staleness when crawl evidence mutates, and recalculates with current fingerprint."""
    # 1. Setup audit with 2 pages and 1 issue
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

    page1 = CrawlPage(
        id=uuid.uuid4(),
        audit_id=audit.id,
        requested_url="https://example.com/",
        final_url="https://example.com/",
        fetch_status="success",
        http_status=200,
        depth=0,
    )
    page2 = CrawlPage(
        id=uuid.uuid4(),
        audit_id=audit.id,
        requested_url="https://example.com/blog",
        final_url="https://example.com/blog",
        fetch_status="success",
        http_status=200,
        depth=1,
    )
    test_db_session.add_all([page1, page2])

    issue1 = SeoIssue(
        id=uuid.uuid4(),
        audit_id=audit.id,
        crawl_page_id=page1.id,
        rule_id="ONPAGE_TITLE_PRESENT",
        category="on_page",
        subcategory="title",
        severity="high",
        status="pass",
        title="Title Present",
        description="Page has title.",
        recommendation="None.",
        fingerprint="fp_title_1",
        evidence_json={"page_url": page1.final_url},
    )
    test_db_session.add(issue1)
    await test_db_session.commit()

    service = ScoringService(test_db_session)

    # Compute initial score
    card1 = await service.compute_score(audit.id)
    initial_fp = card1.input_fingerprint
    assert initial_fp is not None
    assert card1.overall_state != "stale"

    # GET scorecard immediately without changes -> matches, NOT stale
    card_cached = await service.get_scorecard(audit.id)
    assert card_cached.overall_state != "stale"
    assert card_cached.input_fingerprint == initial_fp

    # Mutate crawl evidence: page2 HTTP status changes 200 -> 500
    page2.http_status = 500
    await test_db_session.commit()

    # GET scorecard now must detect staleness!
    card_stale = await service.get_scorecard(audit.id)
    assert card_stale.overall_state == "stale"
    assert card_stale.input_fingerprint == initial_fp

    # Forced recalculation produces fresh scorecard with new fingerprint
    card_recalculated = await service.compute_score(audit.id, force=True)
    assert card_recalculated.overall_state != "stale"
    assert card_recalculated.input_fingerprint != initial_fp

    # Subsequent GET score confirms fresh state without false staleness
    card_fresh = await service.get_scorecard(audit.id)
    assert card_fresh.overall_state != "stale"
    assert card_fresh.input_fingerprint == card_recalculated.input_fingerprint
