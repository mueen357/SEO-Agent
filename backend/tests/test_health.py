"""Tests for health check endpoints, OpenAPI documentation, and CORS."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_health_endpoint(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "website-audit-api"
    }


@pytest.mark.asyncio
async def test_v1_health_endpoint(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "website-audit-api"
    }


@pytest.mark.asyncio
async def test_openapi_docs(client: AsyncClient):
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "/health" in data["paths"]
    assert "/api/v1/audits" in data["paths"]
    assert "/api/v1/audits/{audit_id}" in data["paths"]
    assert "/api/v1/audits/{audit_id}/cancel" in data["paths"]

    docs_response = await client.get("/docs")
    assert docs_response.status_code == 200


@pytest.mark.asyncio
async def test_cors_headers_chrome_extension(client: AsyncClient):
    origin = "chrome-extension://abcdefghijklmnop"
    # Preflight OPTIONS request
    headers = {
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type,Idempotency-Key"
    }
    response = await client.options("/api/v1/audits", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin

    # Direct GET with Origin
    get_res = await client.get("/health", headers={"Origin": origin})
    assert get_res.status_code == 200
    assert get_res.headers.get("access-control-allow-origin") == origin
