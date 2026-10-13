"""Tests for background worker job leasing, start transitions, cancellation, and crawl API endpoints."""

from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, AuditMode, AuditStatus
from app.repositories.crawl_repository import CrawlRepository
from app.services.crawl_service import CrawlService

MOCK_PUBLIC_DNS = [(2, 1, 6, "", ("93.184.216.34", 443))]


@pytest.mark.asyncio
async def test_start_audit_endpoint_lifecycle(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        # 1. Create audit (status 'created')
        res = await client.post("/api/v1/audits", json={"target_url": "https://example.com", "mode": "full"})
        assert res.status_code == 202
        audit_id = res.json()["id"]
        assert res.json()["status"] == "created"

        # 2. Start audit (status 'queued')
        start_res = await client.post(f"/api/v1/audits/{audit_id}/start")
        assert start_res.status_code == 202
        data = start_res.json()
        assert data["status"] == "queued"
        assert f"Audit '{audit_id}' has been queued" in data["message"]

        # 3. Duplicate start rejected (409 Conflict)
        dup_res = await client.post(f"/api/v1/audits/{audit_id}/start")
        assert dup_res.status_code == 409
        assert "must be 'created'" in dup_res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_start_verified_owner_audit_rejected(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        res = await client.post("/api/v1/audits", json={"target_url": "https://example.com", "mode": "verified_owner"})
        assert res.status_code == 202
        audit_id = res.json()["id"]

        start_res = await client.post(f"/api/v1/audits/{audit_id}/start")
        assert start_res.status_code == 409
        assert "Verified owner audits require domain ownership verification" in start_res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_atomic_worker_job_claiming(test_db_session: AsyncSession):
    repo = CrawlRepository(test_db_session)

    audit = Audit(
        target_url="https://claim-test.com",
        normalized_url="https://claim-test.com/",
        hostname="claim-test.com",
        mode=AuditMode.full.value,
        status=AuditStatus.queued.value,
        max_pages=10,
        configuration_json={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    test_db_session.add(audit)
    await test_db_session.commit()
    await test_db_session.refresh(audit)

    # Worker 1 claims job
    claimed1 = await repo.claim_next_job(worker_token="worker-1", lease_seconds=60)
    assert claimed1 is not None
    assert claimed1.id == audit.id
    assert claimed1.status == AuditStatus.crawling.value
    assert claimed1.worker_token == "worker-1"

    # Worker 2 tries to claim while lease is active: returns None
    claimed2 = await repo.claim_next_job(worker_token="worker-2", lease_seconds=60)
    assert claimed2 is None


@pytest.mark.asyncio
async def test_job_cancellation_preservation(test_db_session: AsyncSession):
    repo = CrawlRepository(test_db_session)

    audit = Audit(
        target_url="https://cancel-test.com",
        normalized_url="https://cancel-test.com/",
        hostname="cancel-test.com",
        mode=AuditMode.full.value,
        status=AuditStatus.crawling.value,
        worker_token="worker-1",
        max_pages=10,
        configuration_json={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    test_db_session.add(audit)
    await test_db_session.commit()
    await test_db_session.refresh(audit)

    # User cancels audit
    audit.status = AuditStatus.cancelled.value
    await test_db_session.commit()

    # Worker tries to release job as completed
    await repo.release_job(
        audit_id=audit.id,
        worker_token="worker-1",
        terminal_status=AuditStatus.completed,
    )

    await test_db_session.refresh(audit)
    # Must preserve cancelled state, never overwrite as completed!
    assert audit.status == AuditStatus.cancelled.value


@pytest.mark.asyncio
async def test_pages_and_sitemaps_api_persistence(client: AsyncClient, test_db_session: AsyncSession):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        res = await client.post("/api/v1/audits", json={"target_url": "https://api-data-test.com"})
        audit_id = res.json()["id"]

        repo = CrawlRepository(test_db_session)
        await repo.save_page(
            audit_id=audit_id,
            page_data={
                "requested_url": "https://api-data-test.com/",
                "final_url": "https://api-data-test.com/",
                "depth": 0,
                "fetch_status": "success",
                "http_status": 200,
                "content_type": "text/html",
                "title": "Home Page",
                "meta_description": "Home Description",
                "image_count": 2,
                "missing_alt_count": 1,
                "internal_link_count": 5,
                "external_link_count": 2,
            },
            links_data=[
                {"destination_url": "https://api-data-test.com/about", "link_text": "About", "internal": True}
            ],
        )

        await repo.save_sitemap(
            audit_id=audit_id,
            sitemap_data={
                "sitemap_url": "https://api-data-test.com/sitemap.xml",
                "status": "success",
                "url_count": 10,
            },
        )

        # GET /api/v1/audits/{id}/pages
        pages_res = await client.get(f"/api/v1/audits/{audit_id}/pages")
        assert pages_res.status_code == 200
        pages_data = pages_res.json()
        assert pages_data["total"] == 1
        assert len(pages_data["pages"]) == 1
        assert pages_data["pages"][0]["title"] == "Home Page"
        assert pages_data["pages"][0]["missing_alt_count"] == 1

        # GET /api/v1/audits/{id}/sitemaps
        sm_res = await client.get(f"/api/v1/audits/{audit_id}/sitemaps")
        assert sm_res.status_code == 200
        sm_data = sm_res.json()
        assert sm_data["total"] == 1
        assert sm_data["sitemaps"][0]["sitemap_url"] == "https://api-data-test.com/sitemap.xml"
        assert sm_data["sitemaps"][0]["url_count"] == 10
