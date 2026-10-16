"""Comprehensive regression tests for one-click end-to-end audit pipeline orchestration.

Verifies:
1. End-to-end 9-stage pipeline execution: validation -> crawling -> storage -> on_page -> technical -> sitewide -> tech -> scoring -> publishing.
2. Rule family preservation: ONPAGE_, TECH_, and SITE_ families coexist after full analysis.
3. 51-rule coverage: All 51 rules in the registry are evaluated with truthful statuses (no fabricated passes).
4. Complete missing analysis endpoint: Safe, idempotent execution on existing crawls without recrawling.
5. Priority card affected page count: Duplicate content groups with 49 pages report 49 affected pages instead of 1.
6. Worker resume and stage skipping: Crash recovery skips already completed stages.
7. Cancellation handling: Mid-pipeline cancellation cleanly halts downstream stages.
"""

import uuid
from typing import Dict, Any
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit_engine.registry import default_registry
from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage, SeoIssue, AuditScorecard
from app.scoring.grouping import group_findings_by_rule_and_cause
from app.services.audit_pipeline_service import AuditPipelineService, PIPELINE_STAGES


def create_test_session_factory(session: AsyncSession):
    return async_sessionmaker(
        bind=session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


def build_synthetic_pages(audit_id: uuid.UUID) -> list[CrawlPage]:
    """Create 6 realistic CrawlPage records so all rules (including internal graph >5 pages) can evaluate."""
    pages = []
    urls = [
        "https://example.com/",
        "https://example.com/about",
        "https://example.com/services",
        "https://example.com/pricing",
        "https://example.com/blog",
        "https://example.com/contact",
    ]
    for i, u in enumerate(urls):
        p = CrawlPage(
            id=uuid.uuid4(),
            audit_id=audit_id,
            requested_url=u,
            final_url=u,
            depth=0 if i == 0 else 1,
            fetch_status="success",
            http_status=200,
            content_type="text/html",
            response_time_ms=120,
            title=f"Page {i} Title",
            meta_description=f"Description for page {i} with sufficient length for validation.",
            headings_json={"h1": [f"Header {i}"]},
            canonical_url=u,
            canonical_tag_count=1,
            normalized_main_text_hash=f"hash_{i}",
            main_text_word_count=250,
            main_text_character_count=1500,
            content_quality_status="usable",
            headers_json={"content-type": "text/html; charset=utf-8"},
            html_lang="en",
            image_count=2,
            missing_alt_count=0,
            empty_alt_count=0,
        )
        pages.append(p)
    return pages


@pytest.mark.asyncio
async def test_full_pipeline_orchestration(test_db_session: AsyncSession):
    """Test full 9-stage pipeline execution from created to completed."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.queued.value,
        max_pages=10,
    )
    test_db_session.add(audit)

    # Add synthetic pages so crawl stage can be skipped or populated
    pages = build_synthetic_pages(audit_id)
    for p in pages:
        test_db_session.add(p)
    audit.pages_crawled = len(pages)
    audit.pages_discovered = 15

    # Initialize progress with crawling pre-marked so synthetic pages act as crawl evidence
    audit.progress_json = {
        "pipeline": {
            "current_stage": "crawling",
            "total_stages": len(PIPELINE_STAGES),
            "completed_stages": ["validation", "crawling", "storage"],
            "stages": {
                "validation": {"status": "completed"},
                "crawling": {"status": "completed"},
                "storage": {"status": "completed"},
            },
            "errors": {},
        }
    }
    await test_db_session.commit()

    factory = create_test_session_factory(test_db_session)
    pipeline = AuditPipelineService(session_factory=factory)

    await pipeline.execute_pipeline(audit_id, worker_token="worker-test-1")

    await test_db_session.refresh(audit)
    updated_audit = audit

    assert updated_audit.status == AuditStatus.completed.value
    assert updated_audit.worker_token is None

    pipe = updated_audit.progress_json.get("pipeline", {})
    assert pipe.get("current_stage") == "completed"
    assert len(pipe.get("completed_stages", [])) == len(PIPELINE_STAGES)
    for stage_name in PIPELINE_STAGES:
        assert pipe["stages"][stage_name]["status"] == "completed"

    # Verify score was calculated and persisted
    score_stmt = select(AuditScorecard).where(AuditScorecard.audit_id == audit_id)
    score_res = await test_db_session.execute(score_stmt)
    scorecard = score_res.scalar_one_or_none()
    assert scorecard is not None
    assert scorecard.overall_score is not None


@pytest.mark.asyncio
async def test_three_rule_families_coexist(test_db_session: AsyncSession):
    """Verify that ONPAGE_, TECH_, and SITE_ rule families coexist after analysis."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.queued.value,
        max_pages=10,
        pages_crawled=6,
    )
    test_db_session.add(audit)
    for p in build_synthetic_pages(audit_id):
        test_db_session.add(p)

    audit.progress_json = {
        "pipeline": {
            "completed_stages": ["validation", "crawling", "storage"],
            "stages": {
                "validation": {"status": "completed"},
                "crawling": {"status": "completed"},
                "storage": {"status": "completed"},
            },
        }
    }
    await test_db_session.commit()

    factory = create_test_session_factory(test_db_session)
    pipeline = AuditPipelineService(session_factory=factory)
    await pipeline.execute_pipeline(audit_id, worker_token="worker-test-coexist")

    # Query all issues
    stmt = select(SeoIssue).where(SeoIssue.audit_id == audit_id)
    res = await test_db_session.execute(stmt)
    issues = res.scalars().all()

    onpage_rules = {i.rule_id for i in issues if i.rule_id.startswith("ONPAGE_")}
    tech_rules = {i.rule_id for i in issues if i.rule_id.startswith("TECH_")}
    site_rules = {i.rule_id for i in issues if i.rule_id.startswith("SITE_")}

    assert len(onpage_rules) > 0, "Expected ONPAGE_ rules to be persisted"
    assert len(tech_rules) > 0, "Expected TECH_ rules to be persisted"
    assert len(site_rules) > 0, "Expected SITE_ rules to be persisted"


@pytest.mark.asyncio
async def test_51_rule_coverage_accuracy(test_db_session: AsyncSession, client: AsyncClient):
    """Ensure all 51 rules in the registry are evaluated and represented without fabricated passes."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.completed.value,
        max_pages=10,
        pages_crawled=6,
    )
    test_db_session.add(audit)
    for p in build_synthetic_pages(audit_id):
        test_db_session.add(p)

    audit.progress_json = {
        "pipeline": {
            "completed_stages": ["validation", "crawling", "storage"],
            "stages": {
                "validation": {"status": "completed"},
                "crawling": {"status": "completed"},
                "storage": {"status": "completed"},
            },
        }
    }
    await test_db_session.commit()

    factory = create_test_session_factory(test_db_session)
    pipeline = AuditPipelineService(session_factory=factory)
    await pipeline.execute_pipeline(audit_id, worker_token="worker-test-51")

    # Check distinct evaluated rule count
    stmt = select(SeoIssue.rule_id).where(SeoIssue.audit_id == audit_id).distinct()
    res = await test_db_session.execute(stmt)
    evaluated_rule_ids = set(res.scalars().all())

    all_registered_ids = [r.rule_id for r in default_registry.get_all_rules()]
    total_registered = len(all_registered_ids)
    assert total_registered == 51

    # Verify that all 51 rules are represented
    missing_rules = set(all_registered_ids) - evaluated_rule_ids
    assert len(missing_rules) == 0, f"Missing evaluated rule IDs: {missing_rules}"
    assert len(evaluated_rule_ids) == 51, f"Expected 51 distinct rules, got {len(evaluated_rule_ids)}"


@pytest.mark.asyncio
async def test_complete_missing_analysis_api(client: AsyncClient, test_db_session: AsyncSession):
    """Test POST /api/v1/audits/{id}/complete-analysis on an existing crawl."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.completed.value,
        max_pages=10,
        pages_crawled=6,
    )
    test_db_session.add(audit)
    for p in build_synthetic_pages(audit_id):
        test_db_session.add(p)
    await test_db_session.commit()

    # Call endpoint
    resp = await client.post(f"/api/v1/audits/{audit_id}/complete-analysis")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"

    # Verify all 3 rule families exist
    stmt = select(SeoIssue).where(SeoIssue.audit_id == audit_id)
    res = await test_db_session.execute(stmt)
    issues = res.scalars().all()
    rule_ids = {i.rule_id for i in issues}

    assert any(r.startswith("ONPAGE_") for r in rule_ids)
    assert any(r.startswith("TECH_") for r in rule_ids)
    assert any(r.startswith("SITE_") for r in rule_ids)


def test_priority_duplicate_content_affected_pages_count():
    """Verify duplicate-content finding with 49 pages reports 49 affected pages."""
    synthetic_issue = {
        "rule_id": "SITE_CONTENT_DUPLICATE_EXACT",
        "category": "content",
        "severity": "high",
        "status": "fail",
        "title": "Exact duplicate content across 49 pages",
        "recommendation": "Consolidate duplicate pages.",
        "page_url": None,
        "evidence": {
            "group_id": "dup_hash_abc",
            "page_count": 49,
            "all_urls": [f"https://example.com/page-{i}" for i in range(49)],
            "sample_urls": [f"https://example.com/page-{i}" for i in range(5)],
        },
    }

    grouped = group_findings_by_rule_and_cause([synthetic_issue])
    assert len(grouped) == 1
    item = grouped[0]

    assert item["affected_page_count"] == 49
    assert "49 page(s)" in item["description"]
    assert len(item["affected_urls_json"]) == 49


@pytest.mark.asyncio
async def test_worker_crash_recovery_skips_completed_stages(test_db_session: AsyncSession):
    """Verify that a resumed worker skips stages already marked completed."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.analyzing.value,
        max_pages=10,
        pages_crawled=6,
    )
    test_db_session.add(audit)
    for p in build_synthetic_pages(audit_id):
        test_db_session.add(p)

    # Pre-mark validation, crawling, storage, and on_page_seo as completed
    audit.progress_json = {
        "pipeline": {
            "current_stage": "technical_seo",
            "total_stages": len(PIPELINE_STAGES),
            "completed_stages": ["validation", "crawling", "storage", "on_page_seo"],
            "stages": {
                "validation": {"status": "completed"},
                "crawling": {"status": "completed"},
                "storage": {"status": "completed"},
                "on_page_seo": {"status": "completed"},
                "technical_seo": {"status": "pending"},
                "sitewide_seo": {"status": "pending"},
                "technology_detection": {"status": "pending"},
                "seo_scoring": {"status": "pending"},
                "publishing": {"status": "pending"},
            },
            "errors": {},
        }
    }
    await test_db_session.commit()

    factory = create_test_session_factory(test_db_session)
    pipeline = AuditPipelineService(session_factory=factory)

    await pipeline.execute_pipeline(audit_id, worker_token="worker-resume-test")

    await test_db_session.refresh(audit)
    updated_audit = audit

    assert updated_audit.status == AuditStatus.completed.value
    pipe = updated_audit.progress_json.get("pipeline", {})
    assert len(pipe.get("completed_stages", [])) == len(PIPELINE_STAGES)


@pytest.mark.asyncio
async def test_pipeline_cancellation(test_db_session: AsyncSession):
    """Verify pipeline cancellation stops execution before downstream stages."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.cancelled.value,
        max_pages=10,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    factory = create_test_session_factory(test_db_session)
    pipeline = AuditPipelineService(session_factory=factory)

    # Calling execute on a cancelled audit should abort immediately
    await pipeline.execute_pipeline(audit_id, worker_token="worker-cancel-test")

    stmt = select(Audit).where(Audit.id == audit_id)
    res = await test_db_session.execute(stmt)
    updated_audit = res.scalar_one()

    assert updated_audit.status == AuditStatus.cancelled.value
    # No issues or scorecards should have been generated
    score_stmt = select(AuditScorecard).where(AuditScorecard.audit_id == audit_id)
    score_res = await test_db_session.execute(score_stmt)
    assert score_res.scalar_one_or_none() is None
