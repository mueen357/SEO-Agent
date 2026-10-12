import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data == {
            "status": "ok",
            "service": "website-audit-api"
        }

@pytest.mark.asyncio
async def test_openapi_docs():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/openapi.json")
        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data
        assert "/health" in data["paths"]

        docs_response = await client.get("/docs")
        assert docs_response.status_code == 200


@pytest.mark.asyncio
async def test_cors_headers():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        # Preflight options request with Chrome extension Origin
        headers = {'Origin': 'chrome-extension://abcdefghijklmnop', 'Access-Control-Request-Method': 'GET'}
        response = await client.options('/health', headers=headers)
        assert response.status_code == 200
        assert response.headers.get('access-control-allow-origin') == 'chrome-extension://abcdefghijklmnop'

        # Direct GET with Chrome extension Origin
        get_res = await client.get('/health', headers={'Origin': 'chrome-extension://abcdefghijklmnop'})
        assert get_res.status_code == 200
        assert get_res.headers.get('access-control-allow-origin') == 'chrome-extension://abcdefghijklmnop'
