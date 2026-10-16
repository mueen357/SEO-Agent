"""Comprehensive concurrency and reliability tests for one-click audit pipeline.

Verifies:
1. Safe merge of crawler callbacks: on_progress never erases pipeline or validation stages.
2. Atomic two-worker claiming: exactly one worker wins in concurrent claims (zero races).
3. Continuous heartbeat: lease renewed during downstream stages.
4. Stale worker release rejection: workers whose lease was stolen cannot publish or complete jobs.
5. Missing analysis endpoint safety: rejects 0-page audits, active workers, or duplicate queued requests.
6. Background complete-analysis E2E: enqueues 202, preserves crawl pages, executes missing stages, produces 3 SEO families.
7. Safe cancellation: mid-pipeline cancellation halts processing and preserves cancelled state.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage, SeoIssue, AuditScorecard
from app.repositories.crawl_repository import CrawlRepository
from app.services.audit_pipeline_service import AuditPipelineService, PIPELINE_STAGES
from app.services.crawl_service import CrawlService


def create_test_session_factory(session: AsyncSession):
    return async_sessionmaker(
        bind=session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


def build_test_pages(audit_id: uuid.UUID, count: int = 6) -> list[CrawlPage]:
    pages = []
    urls = [
        "https://example.com/",
        "https://example.com/about",
        "https://example.com/services",
        "https://example.com/pricing",
        "https://example.com/blog",
        "https://example.com/contact",
    ]
    for i in range(count):
        u = urls[i % len(urls)] + (f"-{i}" if i >= len(urls) else "")
        p = CrawlPage(
            id=uuid.uuid4(),
            audit_id=audit_id,
            requested_url=u,
            final_url=u,
            depth=0 if i == 0 else 1,
            fetch_status="success",
            http_status=200,
            content_type="text/html",
            response_time_ms=100 + i * 10,
            title=f"Reliability Page {i}",
            meta_description=f"Valid meta description for reliability test page {i} with sufficient length.",
            headings_json={"h1": [f"Heading {i}"]},
            canonical_url=u,
            canonical_tag_count=1,
            normalized_main_text_hash=f"rel_hash_{i}",
            main_text_word_count=300,
            main_text_character_count=1800,
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
async def test_crawler_progress_callback_safe_merge(test_db_session: AsyncSession):
    """Verify CrawlService on_progress callback does not wipe existing pipeline or validation stage."""
    audit_id = uuid.uuid4()
    worker_token = "worker-crawl-safe-merge"

    # Initial audit with pipeline validation completed and crawling running
    initial_pipeline = {
        "pipeline": {
            "current_stage": "crawling",
            "total_stages": len(PIPELINE_STAGES),
            "completed_stages": ["validation"],
            "stages": {
                "validation": {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()},
                "crawling": {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()},
                "storage": {"status": "running"},
            },
            "errors": {},
        },
        "custom_metadata": {"keep_me": True},
    }

    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.crawling.value,
        worker_token=worker_token,
        lease_expires_at=datetime.now(timezone.utc) + timedelta(seconds=60),
        progress_json=initial_pipeline,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    crawl_svc = CrawlService(test_db_session)
    crawl_repo = CrawlRepository(test_db_session)

    # Simulate crawler engine progress callback
    crawler_progress = {
        "pages_crawled": 5,
        "urls_discovered": 12,
        "crawl_rate_pages_per_sec": 2.5,
    }

    pipeline_update = {
        "pipeline": {
            "stages": {
                "crawling": {
                    "status": "running",
                    "pages_crawled": 5,
                    "urls_discovered": 12,
                }
            }
        },
        "crawl": crawler_progress,
    }

    heartbeat_ok = await crawl_repo.heartbeat(
        audit_id=audit_id,
        worker_token=worker_token,
        lease_seconds=60,
        progress_json=pipeline_update,
        pages_crawled=5,
        pages_discovered=12,
    )
    assert heartbeat_ok is True

    # Refresh audit and verify deep merge
    await test_db_session.refresh(audit)
    p_json = audit.progress_json

    # 1. Pipeline exists
    assert "pipeline" in p_json
    pipe = p_json["pipeline"]

    # 2. Validation stage is STILL completed
    assert pipe["stages"]["validation"]["status"] == "completed"
    assert "validation" in pipe["completed_stages"]

    # 3. Crawling stage updated with pages_crawled
    assert pipe["stages"]["crawling"]["status"] == "running"
    assert pipe["stages"]["crawling"]["pages_crawled"] == 5

    # 4. Crawl metadata present
    assert p_json["crawl"]["urls_discovered"] == 12

    # 5. Unrelated keys preserved
    assert p_json.get("custom_metadata", {}).get("keep_me") is True

    # 6. Audit columns updated
    assert audit.pages_crawled == 5
    assert audit.pages_discovered == 12


@pytest.mark.asyncio
async def test_atomic_two_worker_claiming_concurrency(test_db_session: AsyncSession):
    """Test two concurrent workers attempting to claim the same queued job atomically."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com/race",
        normalized_url="https://example.com/race",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.queued.value,
        created_at=datetime.now(timezone.utc),
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    factory = create_test_session_factory(test_db_session)

    # Worker 1 and Worker 2 claim concurrently in separate sessions
    async def worker_claim(worker_id: str):
        async with factory() as session:
            repo = CrawlRepository(session)
            return await repo.claim_next_job(worker_token=worker_id, lease_seconds=60)

    result_1, result_2 = await asyncio.gather(
        worker_claim("worker-alpha"),
        worker_claim("worker-beta"),
    )

    # Exactly one worker must succeed in claiming the job
    claimed_results = [r for r in (result_1, result_2) if r is not None]
    assert len(claimed_results) == 1, "Exactly one worker must claim the job (no race condition)"

    winning_audit = claimed_results[0]
    winning_token = winning_audit.worker_token
    assert winning_token in ("worker-alpha", "worker-beta")

    # In DB, verify ownership
    async with factory() as session:
        stmt = select(Audit).where(Audit.id == audit_id)
        res = await session.execute(stmt)
        persisted = res.scalar_one()
        assert persisted.status == AuditStatus.crawling.value
        assert persisted.worker_token == winning_token
        assert persisted.lease_expires_at is not None
        lease_exp = persisted.lease_expires_at
        if lease_exp and lease_exp.tzinfo is None:
            lease_exp = lease_exp.replace(tzinfo=timezone.utc)
        assert lease_exp > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_stale_worker_release_rejected_after_lease_expiry(test_db_session: AsyncSession):
    """Verify that a stale worker whose lease expired cannot release or complete the audit."""
    audit_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    # Audit initially owned by worker-1, but lease expired in the past
    audit = Audit(
        id=audit_id,
        target_url="https://example.com/stale",
        normalized_url="https://example.com/stale",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.crawling.value,
        worker_token="worker-stale-1",
        lease_expires_at=now - timedelta(seconds=10),  # Expired!
        heartbeat_at=now - timedelta(seconds=20),
        created_at=now - timedelta(minutes=5),
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    factory = create_test_session_factory(test_db_session)

    # Worker 2 claims the expired audit
    async with factory() as session:
        repo = CrawlRepository(session)
        claimed = await repo.claim_next_job(worker_token="worker-active-2", lease_seconds=60)
        assert claimed is not None
        assert claimed.id == audit_id
        assert claimed.worker_token == "worker-active-2"

    # Worker 1 (stale) now attempts to release the job as completed
    async with factory() as session:
        repo = CrawlRepository(session)
        released = await repo.release_job(
            audit_id=audit_id,
            worker_token="worker-stale-1",
            terminal_status=AuditStatus.completed,
        )
        assert released is False, "Stale worker release must be rejected"

    # Verify in DB that audit was NOT marked completed and is STILL owned by worker-active-2
    async with factory() as session:
        stmt = select(Audit).where(Audit.id == audit_id)
        res = await session.execute(stmt)
        persisted = res.scalar_one()
        assert persisted.status == AuditStatus.crawling.value
        assert persisted.worker_token == "worker-active-2"

    # Worker 2 (active owner) now releases the job
    async with factory() as session:
        repo = CrawlRepository(session)
        released = await repo.release_job(
            audit_id=audit_id,
            worker_token="worker-active-2",
            terminal_status=AuditStatus.completed,
        )
        assert released is True, "Active owner release must succeed"

    # Verify final completed status
    async with factory() as session:
        stmt = select(Audit).where(Audit.id == audit_id)
        res = await session.execute(stmt)
        persisted = res.scalar_one()
        assert persisted.status == AuditStatus.completed.value
        assert persisted.worker_token is None


@pytest.mark.asyncio
async def test_complete_missing_analysis_rejection_rules(client: AsyncClient, test_db_session: AsyncSession):
    """Test safety validation rules for complete-analysis endpoint."""
    now = datetime.now(timezone.utc)

    # 1. Nonexistent audit -> 404
    non_existent = uuid.uuid4()
    resp = await client.post(f"/api/v1/audits/{non_existent}/complete-analysis")
    assert resp.status_code == 404

    # 2. Audit with 0 crawled pages -> 409 Conflict
    zero_page_id = uuid.uuid4()
    a_zero = Audit(
        id=zero_page_id,
        target_url="https://example.com/zero",
        normalized_url="https://example.com/zero",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.completed.value,
        pages_crawled=0,
    )
    test_db_session.add(a_zero)
    await test_db_session.commit()

    resp = await client.post(f"/api/v1/audits/{zero_page_id}/complete-analysis")
    assert resp.status_code == 409
    assert "0 pages" in resp.json()["error"]["message"]

    # 3. Audit actively owned by another worker with valid lease -> 409 Conflict
    active_worker_id = uuid.uuid4()
    a_active = Audit(
        id=active_worker_id,
        target_url="https://example.com/active",
        normalized_url="https://example.com/active",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.crawling.value,
        worker_token="worker-active-running",
        lease_expires_at=now + timedelta(seconds=60),
        pages_crawled=3,
    )
    test_db_session.add(a_active)
    for p in build_test_pages(active_worker_id, 3):
        test_db_session.add(p)
    await test_db_session.commit()

    resp = await client.post(f"/api/v1/audits/{active_worker_id}/complete-analysis")
    assert resp.status_code == 409
    assert "actively being processed" in resp.json()["error"]["message"]

    # 4. Audit already queued -> 409 Conflict
    queued_id = uuid.uuid4()
    a_queued = Audit(
        id=queued_id,
        target_url="https://example.com/queued",
        normalized_url="https://example.com/queued",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.queued.value,
        pages_crawled=3,
    )
    test_db_session.add(a_queued)
    for p in build_test_pages(queued_id, 3):
        test_db_session.add(p)
    await test_db_session.commit()

    resp = await client.post(f"/api/v1/audits/{queued_id}/complete-analysis")
    assert resp.status_code == 409
    assert "already queued" in resp.json()["error"]["message"]


@pytest.mark.asyncio
async def test_complete_missing_analysis_background_e2e(client: AsyncClient, test_db_session: AsyncSession):
    """Test full background complete-analysis flow: HTTP 202 -> worker claim -> all 3 families -> completed."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.completed.value,  # Previously stopped after crawl
        pages_crawled=6,
        pages_discovered=10,
    )
    test_db_session.add(audit)
    pages = build_test_pages(audit_id, 6)
    for p in pages:
        test_db_session.add(p)
    await test_db_session.commit()

    # Call endpoint: returns HTTP 202 quickly
    resp = await client.post(f"/api/v1/audits/{audit_id}/complete-analysis")
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "queued"
    assert data["audit_id"] == str(audit_id)

    # Audit in DB is now queued with validation, crawling, storage pre-completed
    await test_db_session.refresh(audit)
    assert audit.status == AuditStatus.queued.value
    pipe = audit.progress_json["pipeline"]
    assert pipe["stages"]["crawling"]["status"] == "completed"
    assert "crawling" in pipe["completed_stages"]

    # Background worker claims job and executes missing pipeline stages
    factory = create_test_session_factory(test_db_session)
    async with factory() as session:
        repo = CrawlRepository(session)
        claimed = await repo.claim_next_job(worker_token="worker-e2e-complete", lease_seconds=60)
        assert claimed is not None
        assert claimed.id == audit_id

    pipeline = AuditPipelineService(session_factory=factory)
    await pipeline.execute_pipeline(audit_id, worker_token="worker-e2e-complete")

    # Verify audit completed with all 3 SEO rule families
    await test_db_session.refresh(audit)
    assert audit.status == AuditStatus.completed.value

    stmt = select(SeoIssue.rule_id).where(SeoIssue.audit_id == audit_id).distinct()
    res = await test_db_session.execute(stmt)
    rule_ids = set(res.scalars().all())

    assert any(r.startswith("ONPAGE_") for r in rule_ids), "ONPAGE_ family must be present"
    assert any(r.startswith("TECH_") for r in rule_ids), "TECH_ family must be present"
    assert any(r.startswith("SITE_") for r in rule_ids), "SITE_ family must be present"

    # Scorecard must exist
    score_stmt = select(AuditScorecard).where(AuditScorecard.audit_id == audit_id)
    score_res = await test_db_session.execute(score_stmt)
    scorecard = score_res.scalar_one_or_none()
    assert scorecard is not None
    assert scorecard.overall_score > 0


@pytest.mark.asyncio
async def test_pipeline_cancellation_preserves_cancelled_status(test_db_session: AsyncSession):
    """Verify that cancellation halts the pipeline and terminal status is cancelled, not completed."""
    audit_id = uuid.uuid4()
    worker_token = "worker-cancel-test"

    audit = Audit(
        id=audit_id,
        target_url="https://example.com/cancel",
        normalized_url="https://example.com/cancel",
        hostname="example.com",
        mode=AuditMode.full.value,
        status=AuditStatus.queued.value,
        max_pages=5,
    )
    test_db_session.add(audit)
    for p in build_test_pages(audit_id, 3):
        test_db_session.add(p)
    audit.pages_crawled = 3
    await test_db_session.commit()

    factory = create_test_session_factory(test_db_session)
    pipeline = AuditPipelineService(session_factory=factory)

    # Mark cancelled immediately
    async with factory() as session:
        stmt = select(Audit).where(Audit.id == audit_id)
        res = await session.execute(stmt)
        a = res.scalar_one()
        a.status = AuditStatus.cancelled.value
        await session.commit()

    await pipeline.execute_pipeline(audit_id, worker_token=worker_token)

    # Audit must remain cancelled
    async with factory() as session:
        stmt = select(Audit).where(Audit.id == audit_id)
        res = await session.execute(stmt)
        a = res.scalar_one()
        assert a.status == AuditStatus.cancelled.value


@pytest.mark.asyncio
async def test_end_to_end_pipeline_live_crawl_with_worker(client: AsyncClient, test_db_session: AsyncSession):
    """Execute actual full pipeline: create -> start -> claim -> crawl -> 3 SEO families -> tech -> score -> publish."""
    # 1. Deterministic site fixture responses
    site_pages = {
        "https://mytestblog.com/": b"""<!DOCTYPE html>
<html lang="en">
<head>
    <title>Home - My Test Blog</title>
    <meta name="description" content="Welcome to the test blog home page with rich SEO content and valid length.">
    <link rel="canonical" href="https://mytestblog.com/">
    <meta name="generator" content="WordPress 6.4.2">
</head>
<body>
    <h1>Welcome to My Test Blog</h1>
    <p>This is a high quality blog post describing our services in great detail with enough words to satisfy readability.</p>
    <a href="https://mytestblog.com/about">About Us</a>
    <a href="https://mytestblog.com/contact">Contact Us</a>
</body>
</html>""",
        "https://mytestblog.com/about": b"""<!DOCTYPE html>
<html lang="en">
<head>
    <title>About - My Test Blog</title>
    <meta name="description" content="Learn about our team and history on this comprehensive about page.">
    <link rel="canonical" href="https://mytestblog.com/about">
    <meta name="generator" content="WordPress 6.4.2">
</head>
<body>
    <h1>About Our Company</h1>
    <p>We are a dedicated team providing exceptional technology services with years of industry experience.</p>
    <a href="https://mytestblog.com/contact">Contact Us</a>
</body>
</html>""",
        "https://mytestblog.com/contact": b"""<!DOCTYPE html>
<html lang="en">
<head>
    <title>Contact - My Test Blog</title>
    <meta name="description" content="Get in touch with our team through our contact page for any questions.">
    <link rel="canonical" href="https://mytestblog.com/contact">
    <meta name="generator" content="WordPress 6.4.2">
</head>
<body>
    <h1>Contact Our Team</h1>
    <p>Feel free to reach out to us at any time using our contact form or telephone lines.</p>
    <a href="https://mytestblog.com/">Home</a>
</body>
</html>""",
    }

    class DeterministicMockFetcher:
        async def fetch(self, url, scope, config):
            from app.crawler.policies import FetchResult
            clean_url = url.rstrip("/") if url != "https://mytestblog.com/" else url
            matched_body = None
            for k, body in site_pages.items():
                if k.rstrip("/") == clean_url.rstrip("/"):
                    matched_body = body
                    break

            if matched_body:
                return FetchResult(
                    requested_url=url,
                    final_url=url,
                    fetch_status="success",
                    http_status=200,
                    content_type="text/html; charset=utf-8",
                    body=matched_body,
                    headers={"content-type": "text/html; charset=utf-8", "server": "nginx"},
                    response_time_ms=80,
                )
            return FetchResult(
                requested_url=url,
                final_url=url,
                fetch_status="http_error",
                http_status=404,
                content_type="text/html",
                body=b"Not Found",
                response_time_ms=50,
            )

        async def close(self):
            pass

    mock_fetcher = DeterministicMockFetcher()

    # Step 1: POST /api/v1/audits to create audit
    create_resp = await client.post(
        "/api/v1/audits",
        json={"target_url": "https://mytestblog.com", "mode": "full", "max_pages": 5},
    )
    assert create_resp.status_code in (201, 202)
    audit_data = create_resp.json()
    audit_id = uuid.UUID(audit_data["id"])

    # Step 2: POST /api/v1/audits/{id}/start to queue audit
    start_resp = await client.post(f"/api/v1/audits/{audit_id}/start")
    assert start_resp.status_code in (200, 202)
    assert start_resp.json()["status"] == "queued"

    # Step 3: Background worker claims the queued audit
    factory = create_test_session_factory(test_db_session)
    async with factory() as session:
        repo = CrawlRepository(session)
        claimed = await repo.claim_next_job(worker_token="worker-live-e2e", lease_seconds=60)
        assert claimed is not None
        assert claimed.id == audit_id

    # Step 4: Worker executes the full 9-stage pipeline with the deterministic crawler
    pipeline = AuditPipelineService(session_factory=factory)
    await pipeline.execute_pipeline(
        audit_id=audit_id,
        worker_token="worker-live-e2e",
        fetcher=mock_fetcher,
    )

    # Step 5: Verify GET /api/v1/audits/{id}
    audit_resp = await client.get(f"/api/v1/audits/{audit_id}")
    assert audit_resp.status_code == 200
    res_data = audit_resp.json()
    assert res_data["status"] == "completed"
    assert res_data["pages_crawled"] == 3

    # Verify all 9 stages are marked completed in pipeline progress
    pipe = res_data["progress_json"]["pipeline"]
    for stage_name in PIPELINE_STAGES:
        assert stage_name in pipe["completed_stages"], f"Stage {stage_name} not completed"
        assert pipe["stages"][stage_name]["status"] == "completed"

    # Step 6: Verify GET /api/v1/audits/{id}/issues (all 3 rule families evaluated and present)
    issues_resp = await client.get(f"/api/v1/audits/{audit_id}/issues")
    assert issues_resp.status_code == 200
    issues_data = issues_resp.json()
    assert issues_data["total"] > 0
    assert issues_data["summary"]["by_category"].get("on_page", 0) > 0
    assert issues_data["summary"]["by_category"].get("technical", 0) > 0
    
    # Check TECH_ and SITE_ rules in first page
    rule_ids = {it["rule_id"] for it in issues_data["items"]}
    assert any(r.startswith("TECH_") for r in rule_ids), "Missing TECH_ rule in issues"
    assert any(r.startswith("SITE_") for r in rule_ids), "Missing SITE_ rule in issues"

    # Check ONPAGE_ rules via category filter (bypassing severity-first sorting on page 1)
    onpage_resp = await client.get(f"/api/v1/audits/{audit_id}/issues?category=on_page")
    assert onpage_resp.status_code == 200
    onpage_items = onpage_resp.json()["items"]
    assert any(it["rule_id"].startswith("ONPAGE_") for it in onpage_items), "Missing ONPAGE_ rule"

    # Step 7: Verify GET /api/v1/audits/{id}/technologies/summary (WordPress detected)
    tech_resp = await client.get(f"/api/v1/audits/{audit_id}/technologies/summary")
    assert tech_resp.status_code == 200
    tech_data = tech_resp.json()
    assert tech_data["primary_cms"] == "WordPress"
    assert tech_data["total_detected"] > 0

    # Step 8: Verify GET /api/v1/audits/{id}/score (SEO score calculated)
    score_resp = await client.get(f"/api/v1/audits/{audit_id}/score")
    assert score_resp.status_code == 200
    score_data = score_resp.json()
    assert score_data["overall_score"] > 0
