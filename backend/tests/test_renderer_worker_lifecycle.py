"""Tests for worker lifecycle, independent lease heartbeats, and CrawlPageRender persistence."""

import asyncio
from datetime import datetime, timezone
import uuid
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.crawler.policies import CrawlConfig
from app.database.models import Audit, AuditStatus, CrawlPage
from app.repositories.audit_repository import AuditRepository
from app.repositories.crawl_repository import CrawlRepository
from app.services.crawl_service import CrawlService


@pytest.mark.asyncio
async def test_crawl_service_independent_heartbeat_and_persistence(test_db_session: AsyncSession):
    """Verify CrawlService executes crawl, persists pages and CrawlPageRender records."""
    audit_repo = AuditRepository(test_db_session)
    crawl_repo = CrawlRepository(test_db_session)
    crawl_service = CrawlService(test_db_session)

    # 1. Create audit
    audit_obj = Audit(
        target_url="https://example.com",
        normalized_url="https://example.com",
        hostname="example.com",
        mode="full",
        max_pages=2,
        configuration_json={"render_javascript": "never"},
    )
    audit = await audit_repo.create_audit(audit_obj)
    assert audit.status == "created"

    # 2. Start audit
    audit = await crawl_service.start_audit(audit.id)
    assert audit.status == "queued"

    # 3. Worker claims job
    worker_token = "test-worker-14b"
    claimed = await crawl_repo.claim_next_job(worker_token=worker_token, lease_seconds=60)
    assert claimed is not None
    assert claimed.worker_token == worker_token
    assert claimed.status == "crawling"

    # 4. Save a page with render record
    page_data = {
        "requested_url": "https://example.com",
        "final_url": "https://example.com",
        "depth": 0,
        "fetch_status": "success",
        "http_status": 200,
        "content_type": "text/html",
        "response_time_ms": 120,
        "title": "Example Domain",
        "headings_json": {"h1": ["Example Domain"]},
        "image_count": 0,
        "internal_link_count": 0,
        "external_link_count": 1,
    }
    saved_page = await crawl_repo.save_page(audit.id, page_data, [])
    assert saved_page.id is not None

    render_data = {
        "render_status": "skipped",
        "render_strategy": "HTTP_ONLY",
        "render_reason": "Policy set to never render JavaScript.",
        "evidence_json": {"render_mode": "never"},
        "rendered_at": datetime.now(timezone.utc),
    }
    saved_render = await crawl_repo.save_page_render(audit.id, saved_page.id, render_data)
    assert saved_render.id is not None
    assert saved_render.crawl_page_id == saved_page.id
    assert saved_render.render_status == "skipped"

    # 5. Query pages with eager render relation
    pages, total = await crawl_repo.get_pages(audit.id, page=1, page_size=10)
    assert total == 1
    assert len(pages) == 1
    assert pages[0].render is not None
    assert pages[0].render.render_status == "skipped"
    assert pages[0].render.render_strategy == "HTTP_ONLY"

    # 6. Test independent heartbeat
    beat_success = await crawl_repo.heartbeat(
        audit_id=audit.id,
        worker_token=worker_token,
        lease_seconds=60,
        pages_crawled=1,
        pages_discovered=1,
    )
    assert beat_success is True

    # 7. Worker release job to completed
    released = await crawl_repo.release_job(
        audit_id=audit.id,
        worker_token=worker_token,
        terminal_status=AuditStatus.completed,
    )
    assert released is True

    reloaded = await audit_repo.get_audit_by_id(audit.id)
    assert reloaded.status == "completed"
    assert reloaded.worker_token is None


@pytest.mark.asyncio
async def test_worker_cancellation_preservation(test_db_session: AsyncSession):
    """If audit is cancelled during crawl, worker release retains cancelled status."""
    audit_repo = AuditRepository(test_db_session)
    crawl_repo = CrawlRepository(test_db_session)

    audit_obj = Audit(
        target_url="https://example.com/cancel-test",
        normalized_url="https://example.com/cancel-test",
        hostname="example.com",
        mode="full",
    )
    audit = await audit_repo.create_audit(audit_obj)
    audit.status = AuditStatus.queued.value
    await test_db_session.commit()

    claimed = await crawl_repo.claim_next_job("worker-cancel", lease_seconds=60)
    assert claimed.status == AuditStatus.crawling.value

    # Simulate user cancelling audit
    claimed.status = AuditStatus.cancelled.value
    await test_db_session.commit()

    # Heartbeat returns False when cancelled
    heartbeat_ok = await crawl_repo.heartbeat(claimed.id, "worker-cancel")
    assert heartbeat_ok is False

    # Worker attempts release to completed, but status stays cancelled
    await crawl_repo.release_job(claimed.id, "worker-cancel", AuditStatus.completed)
    check = await audit_repo.get_audit_by_id(claimed.id)
    assert check.status == AuditStatus.cancelled.value
