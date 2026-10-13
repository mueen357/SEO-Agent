"""Tests for Audits API: lifecycle, persistence, pagination, idempotency, and cancellation."""

import socket
import uuid
import pytest
from httpx import AsyncClient
from unittest.mock import patch

# Mock public DNS resolution for standard tests
MOCK_PUBLIC_DNS = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]


@pytest.mark.asyncio
async def test_create_audit_success(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        payload = {
            "target_url": "https://example.com",
            "mode": "quick",
            "configuration": {"check_ssl": True}
        }
        response = await client.post("/api/v1/audits", json=payload)
        assert response.status_code == 202
        data = response.json()

        assert "id" in data
        assert uuid.UUID(data["id"])  # Valid UUID
        assert data["target_url"] == "https://example.com"
        assert data["normalized_url"] == "https://example.com/"
        assert data["hostname"] == "example.com"
        assert data["mode"] == "quick"
        assert data["status"] == "created"
        assert data["max_pages"] == 1
        assert data["pages_discovered"] == 0
        assert data["pages_crawled"] == 0
        assert data["configuration_json"] == {"check_ssl": True}
        assert data["created_at"] is not None
        assert data["updated_at"] is not None


@pytest.mark.asyncio
async def test_create_audit_full_mode_defaults(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        payload = {
            "target_url": "https://example.com/blog",
            "mode": "full"
        }
        response = await client.post("/api/v1/audits", json=payload)
        assert response.status_code == 202
        data = response.json()
        assert data["mode"] == "full"
        assert data["max_pages"] == 50


@pytest.mark.asyncio
async def test_create_audit_custom_max_pages(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        payload = {
            "target_url": "https://example.com",
            "mode": "full",
            "max_pages": 15
        }
        response = await client.post("/api/v1/audits", json=payload)
        assert response.status_code == 202
        assert response.json()["max_pages"] == 15


@pytest.mark.asyncio
async def test_create_audit_rejects_ssrf_and_private_ips(client: AsyncClient):
    payload = {"target_url": "http://127.0.0.1:8000/secret"}
    response = await client.post("/api/v1/audits", json=payload)
    assert response.status_code == 400
    err = response.json()["error"]
    assert err["code"] == "DISALLOWED_URL"
    assert "private" in err["message"].lower() or "disallowed" in err["message"].lower()


@pytest.mark.asyncio
async def test_create_audit_dns_failure(client: AsyncClient):
    with patch("socket.getaddrinfo", side_effect=socket.gaierror(socket.EAI_NONAME, "Name or service not known")):
        payload = {"target_url": "https://this-domain-does-not-exist-999.org"}
        response = await client.post("/api/v1/audits", json=payload)
        assert response.status_code == 400
        err = response.json()["error"]
        assert err["code"] == "DNS_RESOLUTION_FAILED"


@pytest.mark.asyncio
async def test_get_audit_by_id(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        # 1. Create audit
        create_res = await client.post("/api/v1/audits", json={"target_url": "https://example.com"})
        audit_id = create_res.json()["id"]

        # 2. Get audit
        get_res = await client.get(f"/api/v1/audits/{audit_id}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == audit_id


@pytest.mark.asyncio
async def test_get_non_existent_audit(client: AsyncClient):
    random_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/audits/{random_id}")
    assert response.status_code == 404
    err = response.json()["error"]
    assert err["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_idempotency_replay_and_conflict(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        idempotency_key = "test-key-12345"
        payload = {"target_url": "https://example.com", "mode": "quick"}

        # First request creates the audit (202 Accepted)
        res1 = await client.post("/api/v1/audits", json=payload, headers={"Idempotency-Key": idempotency_key})
        assert res1.status_code == 202
        audit1 = res1.json()

        # Replay with identical payload returns existing audit (200 OK)
        res2 = await client.post("/api/v1/audits", json=payload, headers={"Idempotency-Key": idempotency_key})
        assert res2.status_code == 200
        audit2 = res2.json()
        assert audit1["id"] == audit2["id"]

        # Reusing same key with conflicting payload returns 409 Conflict
        conflicting_payload = {"target_url": "https://otherdomain.com", "mode": "quick"}
        res3 = await client.post("/api/v1/audits", json=conflicting_payload, headers={"Idempotency-Key": idempotency_key})
        assert res3.status_code == 409
        err = res3.json()["error"]
        assert err["code"] == "CONFLICT"
        assert "previously used with different request parameters" in err["message"]


@pytest.mark.asyncio
async def test_list_audits_pagination_and_filtering(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        # Create 3 audits
        await client.post("/api/v1/audits", json={"target_url": "https://site-a.com"})
        await client.post("/api/v1/audits", json={"target_url": "https://site-b.com"})
        await client.post("/api/v1/audits", json={"target_url": "https://site-a.com/sub"})

        # List all
        res_all = await client.get("/api/v1/audits?page=1&page_size=10")
        assert res_all.status_code == 200
        data_all = res_all.json()
        assert data_all["total"] >= 3
        assert len(data_all["audits"]) >= 3

        # Filter by hostname
        res_host = await client.get("/api/v1/audits?hostname=site-a.com")
        assert res_host.status_code == 200
        data_host = res_host.json()
        assert data_host["total"] == 2
        for a in data_host["audits"]:
            assert a["hostname"] == "site-a.com"

        # Filter by status
        res_status = await client.get("/api/v1/audits?status=created")
        assert res_status.status_code == 200
        assert res_status.json()["total"] >= 3


@pytest.mark.asyncio
async def test_cancel_audit_lifecycle(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        # 1. Create audit
        create_res = await client.post("/api/v1/audits", json={"target_url": "https://cancel-test.com"})
        audit_id = create_res.json()["id"]

        # 2. Cancel audit
        cancel_res = await client.post(f"/api/v1/audits/{audit_id}/cancel")
        assert cancel_res.status_code == 200
        cancel_data = cancel_res.json()
        assert cancel_data["audit"]["status"] == "cancelled"
        assert cancel_data["audit"]["completed_at"] is not None

        # 3. Cancelling again returns 409 Conflict (terminal state protection)
        cancel_again = await client.post(f"/api/v1/audits/{audit_id}/cancel")
        assert cancel_again.status_code == 409
        err = cancel_again.json()["error"]
        assert err["code"] == "CONFLICT"
        assert "terminal state 'cancelled'" in err["message"]


@pytest.mark.asyncio
async def test_pages_and_issues_empty_collections(client: AsyncClient):
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        create_res = await client.post("/api/v1/audits", json={"target_url": "https://collections-test.com"})
        audit_id = create_res.json()["id"]

        # GET pages
        pages_res = await client.get(f"/api/v1/audits/{audit_id}/pages")
        assert pages_res.status_code == 200
        pages_data = pages_res.json()
        assert pages_data["total"] == 0
        assert pages_data["pages"] == []
        assert "crawling pipeline is scheduled for Phase 1.4" in pages_data["message"]

        # GET issues
        issues_res = await client.get(f"/api/v1/audits/{audit_id}/issues")
        assert issues_res.status_code == 200
        issues_data = issues_res.json()
        assert issues_data["total"] == 0
        assert issues_data["issues"] == []
        assert "issue detection pipeline is scheduled for Phase 1.5" in issues_data["message"]
