"""Permanent regression test suite for CrawlPage primary-key collision, idempotency,
session concurrency, error sanitization, and lifecycle recovery in One-Click Full Audit.

Validates:
1. Exact duplicate page ID persistence
2. Duplicate page callbacks (re-deliveries)
3. Same URL encountered twice (normalization / trailing slash)
4. Retry / re-crawl after already persisted page (mutable updates & link merging)
5. Interrupted crawl and restart (seen URLs pre-population & counters)
6. Concurrent workers / sessions attempting simultaneous page insert
7. Cross-audit URL isolation (same URL on different audits gets distinct deterministic IDs)
8. Page render relationships (idempotent save_page_render)
9. Link foreign keys & deduplication
10. Accurate counters after retry / resumption
11. Failure state propagation & error sanitization (no SQL/token leaks)
12. Deterministic synthetic fetcher integration through CrawlService callback
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.crawler.fetcher import SecureHTTPFetcher
from app.crawler.policies import CrawlConfig, FetchResult
from app.database.base import Base
from app.database.models import (
    Audit,
    AuditMode,
    AuditStatus,
    CrawlLink,
    CrawlPage,
    CrawlPageRender,
    CrawlSitemap,
)
from app.repositories.audit_repository import AuditRepository
from app.repositories.crawl_repository import CrawlRepository
from app.services.audit_pipeline_service import AuditPipelineService, sanitize_pipeline_error
from app.services.crawl_service import CrawlService


def _create_test_session_factory(session: AsyncSession) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


async def _create_test_audit(
    session: AsyncSession,
    target_url: str = "https://example.com/",
    status: AuditStatus = AuditStatus.crawling,
    worker_token: str = "test-worker-token",
) -> Audit:
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url=target_url,
        normalized_url=target_url,
        hostname="example.com",
        mode=AuditMode.full.value,
        status=status.value if isinstance(status, AuditStatus) else status,
        max_pages=20,
        worker_token=worker_token,
        heartbeat_at=datetime.now(timezone.utc),
        lease_expires_at=datetime.now(timezone.utc),
        configuration_json={},
        progress_json={},
    )
    session.add(audit)
    await session.commit()
    await session.refresh(audit)
    return audit


@pytest.mark.asyncio
async def test_exact_duplicate_page_id(test_db_session: AsyncSession):
    """Test calling save_page twice with the exact same primary key ID.
    Must not crash with IntegrityError; must update mutable fields and preserve row.
    """
    audit = await _create_test_audit(test_db_session)
    repo = CrawlRepository(test_db_session)
    fixed_id = uuid.uuid4()

    page_data_1 = {
        "id": fixed_id,
        "requested_url": "https://example.com/p1",
        "final_url": "https://example.com/p1",
        "depth": 0,
        "fetch_status": "success",
        "http_status": 200,
        "content_type": "text/html",
        "title": "Initial Title",
        "response_time_ms": 100,
    }

    # First insert
    page1 = await repo.save_page(audit.id, page_data_1, [])
    assert page1.id == fixed_id
    assert page1.title == "Initial Title"

    # Second insert with identical ID, updated title and response time
    page_data_2 = {
        "id": fixed_id,
        "requested_url": "https://example.com/p1",
        "final_url": "https://example.com/p1",
        "depth": 0,
        "fetch_status": "success",
        "http_status": 200,
        "content_type": "text/html",
        "title": "Updated Title After Replay",
        "response_time_ms": 250,
    }

    page2 = await repo.save_page(audit.id, page_data_2, [])
    assert page2.id == fixed_id
    assert page2.title == "Updated Title After Replay"
    assert page2.response_time_ms == 250

    # Ensure only 1 row exists
    count_stmt = select(func.count(CrawlPage.id)).where(CrawlPage.audit_id == audit.id)
    count = (await test_db_session.execute(count_stmt)).scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_duplicate_callbacks(test_db_session: AsyncSession):
    """Test when the crawler callback receives the same page twice without explicit ID.
    Deterministic page identity must ensure single record with no unique constraint error.
    """
    audit = await _create_test_audit(test_db_session)
    repo = CrawlRepository(test_db_session)

    callback_data = {
        "requested_url": "https://example.com/duplicate-callback",
        "final_url": "https://example.com/duplicate-callback",
        "depth": 1,
        "fetch_status": "success",
        "http_status": 200,
        "content_type": "text/html",
        "title": "Callback Page",
        "response_time_ms": 110,
    }

    p1 = await repo.save_page(audit.id, callback_data, [])
    p2 = await repo.save_page(audit.id, callback_data, [])

    assert p1.id == p2.id
    count_stmt = select(func.count(CrawlPage.id)).where(CrawlPage.audit_id == audit.id)
    count = (await test_db_session.execute(count_stmt)).scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_same_url_encountered_twice(test_db_session: AsyncSession):
    """Test same URL with trailing slash difference or slight variance normalizes cleanly."""
    audit = await _create_test_audit(test_db_session)
    repo = CrawlRepository(test_db_session)

    data_1 = {
        "requested_url": "https://example.com/products",
        "final_url": "https://example.com/products",
        "depth": 1,
        "http_status": 200,
        "title": "Products Lower",
    }
    data_2 = {
        "requested_url": "https://EXAMPLE.COM/products#details",
        "final_url": "https://example.com/products",
        "depth": 1,
        "http_status": 200,
        "title": "Products Upper With Fragment",
    }

    p1 = await repo.save_page(audit.id, data_1, [])
    p2 = await repo.save_page(audit.id, data_2, [])

    # Deterministic normalization routes both to the same canonical identity
    assert p1.id == p2.id
    assert p2.title == "Products Upper With Fragment"
    count_stmt = select(func.count(CrawlPage.id)).where(CrawlPage.audit_id == audit.id)
    count = (await test_db_session.execute(count_stmt)).scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_retry_after_already_persisted_page(test_db_session: AsyncSession):
    """Test retry update on a previously failed or partial page."""
    audit = await _create_test_audit(test_db_session)
    repo = CrawlRepository(test_db_session)

    initial_data = {
        "requested_url": "https://example.com/flaky",
        "final_url": "https://example.com/flaky",
        "fetch_status": "error",
        "http_status": 500,
        "title": "Server Error",
    }
    p_initial = await repo.save_page(audit.id, initial_data, [])
    assert p_initial.http_status == 500

    retry_data = {
        "requested_url": "https://example.com/flaky",
        "final_url": "https://example.com/flaky",
        "fetch_status": "success",
        "http_status": 200,
        "title": "Recovered Page",
    }
    p_retry = await repo.save_page(audit.id, retry_data, [])
    assert p_retry.id == p_initial.id
    assert p_retry.http_status == 200
    assert p_retry.title == "Recovered Page"


@pytest.mark.asyncio
async def test_interrupted_crawl_and_restart(test_db_session: AsyncSession):
    """Verify that restarting an interrupted crawl pre-populates seen URLs and does not re-fetch."""
    audit = await _create_test_audit(test_db_session, target_url="https://example.com/")
    repo = CrawlRepository(test_db_session)
    session_factory = _create_test_session_factory(test_db_session)

    # 1. Pre-seed 2 already crawled pages
    await repo.save_page(audit.id, {
        "requested_url": "https://example.com/",
        "final_url": "https://example.com/",
        "http_status": 200,
    }, [])
    await repo.save_page(audit.id, {
        "requested_url": "https://example.com/already-crawled",
        "final_url": "https://example.com/already-crawled",
        "http_status": 200,
    }, [])

    # 2. Setup mock fetcher that should only fetch NEW urls, not the 2 existing ones
    fetcher = MagicMock(spec=SecureHTTPFetcher)
    fetched_urls = []

    async def mock_fetch(url: str, *args, **kwargs):
        fetched_urls.append(url)
        return FetchResult(
            requested_url=url,
            final_url=url,
            fetch_status="success",
            http_status=200,
            content_type="text/html",
            body=b"<html><head><title>New</title></head><body>No links</body></html>",
        )

    fetcher.fetch = AsyncMock(side_effect=mock_fetch)
    fetcher.close = AsyncMock()

    service = CrawlService(test_db_session, session_factory=session_factory)
    await service.execute_crawl(
        audit_id=audit.id,
        worker_token="test-worker-token",
        config=CrawlConfig(max_pages=5, parse_sitemaps=False, respect_robots_txt=False),
        fetcher=fetcher,
    )

    # The crawl should not fetch https://example.com/ or https://example.com/already-crawled
    assert "https://example.com/" not in fetched_urls
    assert "https://example.com/already-crawled" not in fetched_urls


@pytest.mark.asyncio
async def test_concurrent_workers_page_insert(test_db_session: AsyncSession):
    """Test race condition where two concurrent operations attempt to insert the same page ID.
    Both must safely complete without unhandled IntegrityError and return persisted record.
    """
    audit = await _create_test_audit(test_db_session)
    session_factory = _create_test_session_factory(test_db_session)
    fixed_id = uuid.uuid4()

    page_payload = {
        "id": fixed_id,
        "requested_url": "https://example.com/concurrent-race",
        "final_url": "https://example.com/concurrent-race",
        "fetch_status": "success",
        "http_status": 200,
        "title": "Concurrent Page",
    }

    async def insert_worker():
        async with session_factory() as s:
            r = CrawlRepository(s)
            return await r.save_page(audit.id, page_payload, [])

    # Run two inserts concurrently in parallel tasks
    res1, res2 = await asyncio.gather(insert_worker(), insert_worker())

    assert res1.id == fixed_id
    assert res2.id == fixed_id

    # Exactly 1 row in database
    count_stmt = select(func.count(CrawlPage.id)).where(CrawlPage.audit_id == audit.id)
    count = (await test_db_session.execute(count_stmt)).scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_audit_isolation(test_db_session: AsyncSession):
    """Test that two different audits crawling the exact same URL receive distinct IDs and do not collide."""
    audit1 = await _create_test_audit(test_db_session, target_url="https://site1.com")
    audit2 = await _create_test_audit(test_db_session, target_url="https://site2.com")
    repo = CrawlRepository(test_db_session)

    shared_page_data = {
        "requested_url": "https://shared.com/resource",
        "final_url": "https://shared.com/resource",
        "http_status": 200,
        "title": "Shared Resource",
    }

    p1 = await repo.save_page(audit1.id, shared_page_data, [])
    p2 = await repo.save_page(audit2.id, shared_page_data, [])

    assert p1.id != p2.id
    assert p1.audit_id == audit1.id
    assert p2.audit_id == audit2.id

    # Each audit has exactly 1 row
    c1 = (await test_db_session.execute(
        select(func.count(CrawlPage.id)).where(CrawlPage.audit_id == audit1.id)
    )).scalar()
    c2 = (await test_db_session.execute(
        select(func.count(CrawlPage.id)).where(CrawlPage.audit_id == audit2.id)
    )).scalar()
    assert c1 == 1
    assert c2 == 1


@pytest.mark.asyncio
async def test_page_render_relationships(test_db_session: AsyncSession):
    """Test idempotent save_page_render ensuring duplicate calls update instead of colliding."""
    audit = await _create_test_audit(test_db_session)
    repo = CrawlRepository(test_db_session)

    page = await repo.save_page(audit.id, {
        "requested_url": "https://example.com/render-test",
        "final_url": "https://example.com/render-test",
        "http_status": 200,
    }, [])

    render_data_1 = {
        "render_status": "success",
        "render_strategy": "render_required",
        "rendered_title": "Initial Rendered Title",
        "rendered_image_count": 5,
    }
    r1 = await repo.save_page_render(audit.id, page.id, render_data_1)
    assert r1.rendered_title == "Initial Rendered Title"
    assert r1.crawl_page_id == page.id

    # Second render update (e.g. re-render or retry)
    render_data_2 = {
        "render_status": "success",
        "render_strategy": "render_required",
        "rendered_title": "Second Pass Rendered Title",
        "rendered_image_count": 8,
    }
    r2 = await repo.save_page_render(audit.id, page.id, render_data_2)
    assert r2.id == r1.id
    assert r2.rendered_title == "Second Pass Rendered Title"
    assert r2.rendered_image_count == 8

    # Exactly 1 render record exists
    count = (await test_db_session.execute(
        select(func.count(CrawlPageRender.id)).where(CrawlPageRender.crawl_page_id == page.id)
    )).scalar()
    assert count == 1


@pytest.mark.asyncio
async def test_link_foreign_keys_and_deduplication(test_db_session: AsyncSession):
    """Test that discovered links are merged idempotently without duplicate rows or broken FKs."""
    audit = await _create_test_audit(test_db_session)
    repo = CrawlRepository(test_db_session)

    links_pass_1 = [
        {"destination_url": "https://example.com/link-a", "link_type": "internal", "anchor_text": "A"},
        {"destination_url": "https://example.com/link-b", "link_type": "internal", "anchor_text": "B"},
    ]
    page = await repo.save_page(audit.id, {
        "requested_url": "https://example.com/links-hub",
        "final_url": "https://example.com/links-hub",
        "http_status": 200,
    }, links_pass_1)

    # Verify 2 links created
    stmt = select(func.count(CrawlLink.id)).where(CrawlLink.source_page_id == page.id)
    assert (await test_db_session.execute(stmt)).scalar() == 2

    # Second pass with overlapping link-b and new link-c
    links_pass_2 = [
        {"destination_url": "https://example.com/link-b", "link_type": "internal", "anchor_text": "B Updated"},
        {"destination_url": "https://example.com/link-c", "link_type": "internal", "anchor_text": "C"},
    ]
    await repo.save_page(audit.id, {
        "requested_url": "https://example.com/links-hub",
        "final_url": "https://example.com/links-hub",
        "http_status": 200,
    }, links_pass_2)

    # Total unique destination links should now be 3 (link-a, link-b, link-c)
    assert (await test_db_session.execute(stmt)).scalar() == 3

    # All links must have valid FK to page.id
    all_links = (await test_db_session.execute(
        select(CrawlLink).where(CrawlLink.source_page_id == page.id)
    )).scalars().all()
    assert len(all_links) == 3
    for lk in all_links:
        assert lk.source_page_id == page.id


@pytest.mark.asyncio
async def test_accurate_counters_after_retry(test_db_session: AsyncSession):
    """Verify that pages_crawled counter does not inflate on re-crawled/retried pages."""
    audit = await _create_test_audit(test_db_session)
    repo = CrawlRepository(test_db_session)

    # Initial 2 pages
    await repo.save_page(audit.id, {"requested_url": "https://example.com/1", "http_status": 200}, [])
    await repo.save_page(audit.id, {"requested_url": "https://example.com/2", "http_status": 200}, [])

    # Update crawl stats
    await repo.heartbeat(audit.id, "test-worker-token", 60, pages_crawled=2, pages_discovered=2)
    await test_db_session.refresh(audit)
    assert audit.pages_crawled == 2

    # Retry page 1
    await repo.save_page(audit.id, {"requested_url": "https://example.com/1", "http_status": 200}, [])

    # Database count remains 2
    count = (await test_db_session.execute(
        select(func.count(CrawlPage.id)).where(CrawlPage.audit_id == audit.id)
    )).scalar()
    assert count == 2


def test_sanitized_error_messages():
    """Verify that sanitize_pipeline_error strips all SQL statements, parameters, tables, and secrets."""
    # 1. SQL with parameters and table
    raw_sql_err = IntegrityError(
        statement="INSERT INTO crawl_pages (id, audit_id, html_content) VALUES ('f0d250f3', '39cdaee9', '<html>sensitive</html>')",
        params={"id": "f0d250f3", "audit_id": "39cdaee9"},
        orig=Exception("UNIQUE constraint failed: crawl_pages.id"),
    )
    sanitized = sanitize_pipeline_error(raw_sql_err, stage="crawling")
    assert "PAGE_PERSISTENCE_CONFLICT" in sanitized
    assert "crawl_pages" not in sanitized
    assert "INSERT" not in sanitized
    assert "sensitive" not in sanitized
    assert "39cdaee9" not in sanitized

    # 2. Storage stage error
    generic_db_err = Exception("sqlite3.OperationalError: disk I/O error on D:/siteaudit.db")
    sanitized_storage = sanitize_pipeline_error(generic_db_err, stage="storage")
    assert "CRAWL_STORAGE_ERROR" in sanitized_storage
    assert "siteaudit.db" not in sanitized_storage

    # 3. Network / Timeout error
    timeout_err = TimeoutError("Connection to https://www.pukkajuice.co.uk/ timed out after 30s")
    sanitized_timeout = sanitize_pipeline_error(timeout_err, stage="crawling")
    assert "TIMEOUT_ERROR" in sanitized_timeout
    assert "pukkajuice" not in sanitized_timeout


@pytest.mark.asyncio
async def test_deterministic_synthetic_fetcher_crawl_callback(test_db_session: AsyncSession):
    """Integration test running actual CrawlService with synthetic fetcher producing loops.
    Verifies on_page_persisted callback executes without duplicate primary-key crashes.
    """
    audit = await _create_test_audit(test_db_session, target_url="https://synth.test/")
    session_factory = _create_test_session_factory(test_db_session)

    # 3 pages in a cyclic loop:
    # / -> links to /about
    # /about -> links to /contact
    # /contact -> links back to / and /about
    pages_html = {
        "https://synth.test/": (
            b'<html><head><title>Home</title></head><body>'
            b'<a href="/about">About</a>'
            b'</body></html>'
        ),
        "https://synth.test/about": (
            b'<html><head><title>About</title></head><body>'
            b'<a href="/contact">Contact</a>'
            b'</body></html>'
        ),
        "https://synth.test/contact": (
            b'<html><head><title>Contact</title></head><body>'
            b'<a href="/">Home</a><a href="/about">About</a>'
            b'</body></html>'
        ),
    }

    fetcher = MagicMock(spec=SecureHTTPFetcher)

    async def mock_fetch(url: str, *args, **kwargs):
        norm = url.rstrip("/") if url != "https://synth.test/" else "https://synth.test/"
        body = pages_html.get(url) or pages_html.get(norm) or b"<html><body>Unknown</body></html>"
        return FetchResult(
            requested_url=url,
            final_url=url,
            fetch_status="success",
            http_status=200,
            content_type="text/html",
            body=body,
        )

    fetcher.fetch = AsyncMock(side_effect=mock_fetch)
    fetcher.close = AsyncMock()

    service = CrawlService(test_db_session, session_factory=session_factory)
    summary = await service.execute_crawl(
        audit_id=audit.id,
        worker_token="test-worker-token",
        config=CrawlConfig(max_pages=10, parse_sitemaps=False, respect_robots_txt=False),
        fetcher=fetcher,
    )

    assert summary["pages_crawled"] == 3
    assert summary["pages_failed"] == 0

    # Verify all 3 pages are in the test database with renders
    pages = (await test_db_session.execute(
        select(CrawlPage).where(CrawlPage.audit_id == audit.id)
    )).scalars().all()
    assert len(pages) == 3

    renders = (await test_db_session.execute(
        select(CrawlPageRender).where(CrawlPageRender.audit_id == audit.id)
    )).scalars().all()
    assert len(renders) == 3
