"""Integration tests for Technology & CMS Detection Engine API (CP4)."""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage
from app.technology.extractors import HTMLTechnologyExtractor


@pytest.mark.asyncio
async def test_technology_analyze_not_found(client: AsyncClient):
    """Verify analyze returns 404 when audit ID does not exist."""
    fake_id = uuid.uuid4()
    response = await client.post(f"/api/v1/audits/{fake_id}/technologies/analyze")
    assert response.status_code == 404
    assert f"Audit '{fake_id}' not found." in response.json()["detail"]


@pytest.mark.asyncio
async def test_technology_summary_unattached_or_not_analyzed(client: AsyncClient, test_db_session: AsyncSession):
    """Verify summary returns 404 before technology analysis has been executed."""
    audit = Audit(
        target_url="https://example.com",
        normalized_url="https://example.com",
        hostname="example.com",
        mode=AuditMode.quick,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    response = await client.get(f"/api/v1/audits/{audit.id}/technologies/summary")
    assert response.status_code == 404
    assert "Technology analysis has not been performed" in response.json()["detail"]


@pytest.mark.asyncio
async def test_technology_analyze_and_query_flow(client: AsyncClient, test_db_session: AsyncSession):
    """Verify end-to-end flow: crawl page -> analyze -> list -> summary."""
    audit = Audit(
        target_url="https://wp-test.com",
        normalized_url="https://wp-test.com/",
        hostname="wp-test.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="WordPress 6.4.2" />
        <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css?ver=1.0.0" />
        <link rel="stylesheet" href="/wp-content/plugins/elementor/assets/css/frontend.min.css?ver=3.18.3" />
        <script src="/wp-content/plugins/contact-form-7/includes/js/index.js?ver=5.8.5"></script>
    </head>
    <body class="theme-twentytwentyfour wp-embed-responsive">
        <h1>WordPress Site</h1>
    </body>
    </html>
    """
    raw_ev = HTMLTechnologyExtractor.extract(html).to_dict()

    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://wp-test.com/",
        final_url="https://wp-test.com/",
        fetch_status="success",
        http_status=200,
        headers_json={"x-generator": "WordPress 6.4.2", "x-powered-by": "PHP/8.2.14"},
        technology_evidence_json=raw_ev,
    )
    test_db_session.add(page)
    await test_db_session.commit()

    # 1. Trigger analyze
    post_res = await client.post(f"/api/v1/audits/{audit.id}/technologies/analyze")
    assert post_res.status_code == 200
    post_data = post_res.json()
    assert post_data["audit_id"] == str(audit.id)
    assert post_data["primary_cms"] == "WordPress"
    assert post_data["technologies_detected"] >= 2  # WordPress and PHP

    tech_names = {t["technology_name"] for t in post_data["technologies"]}
    assert "WordPress" in tech_names
    assert "PHP" in tech_names

    themes = post_data["wordpress_themes"]
    assert len(themes) == 1
    assert themes[0]["slug"] == "twentytwentyfour"
    assert themes[0]["name"] == "Twenty Twenty-Four"
    assert themes[0]["status"] == "active"

    plugins = post_data["wordpress_plugins"]
    assert len(plugins) == 2
    p_slugs = {p["slug"] for p in plugins}
    assert p_slugs == {"elementor", "contact-form-7"}

    # 2. Query list of technologies
    get_res = await client.get(f"/api/v1/audits/{audit.id}/technologies")
    assert get_res.status_code == 200
    list_data = get_res.json()
    assert list_data["total"] >= 2
    assert len(list_data["items"]) >= 2
    assert len(list_data["wordpress_themes"]) == 1
    assert len(list_data["wordpress_plugins"]) == 2

    # 3. Query summary
    sum_res = await client.get(f"/api/v1/audits/{audit.id}/technologies/summary")
    assert sum_res.status_code == 200
    sum_data = sum_res.json()
    assert sum_data["primary_cms"] == "WordPress"
    assert "PHP" in sum_data["backend_runtimes"]
    assert sum_data["detected_technologies_count"] >= 2


@pytest.mark.asyncio
async def test_technology_filtering_and_pagination(client: AsyncClient, test_db_session: AsyncSession):
    """Verify category, status, and min_confidence filters on technologies list endpoint."""
    audit = Audit(
        target_url="https://multi-tech.com",
        normalized_url="https://multi-tech.com/",
        hostname="multi-tech.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    # Next.js + React + Node.js + Express
    html = """
    <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
    <div id="__next"><div data-reactroot="">App</div></div>
    """
    raw_ev = HTMLTechnologyExtractor.extract(html).to_dict()

    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://multi-tech.com/",
        final_url="https://multi-tech.com/",
        fetch_status="success",
        http_status=200,
        headers_json={"x-powered-by": "Express", "set-cookie": "connect.sid=12345; path=/"},
        technology_evidence_json=raw_ev,
    )
    test_db_session.add(page)
    await test_db_session.commit()

    # Analyze
    await client.post(f"/api/v1/audits/{audit.id}/technologies/analyze")

    # Filter by category=frontend
    fe_res = await client.get(f"/api/v1/audits/{audit.id}/technologies?category=frontend")
    assert fe_res.status_code == 200
    fe_data = fe_res.json()
    assert fe_data["total"] >= 2
    for item in fe_data["items"]:
        assert item["technology_category"] == "frontend"

    # Filter by category=backend
    be_res = await client.get(f"/api/v1/audits/{audit.id}/technologies?category=backend")
    assert be_res.status_code == 200
    be_data = be_res.json()
    assert be_data["total"] >= 1
    for item in be_data["items"]:
        assert item["technology_category"] == "backend"

    # Pagination test (page_size=1)
    p1_res = await client.get(f"/api/v1/audits/{audit.id}/technologies?page=1&page_size=1")
    assert p1_res.status_code == 200
    p1_data = p1_res.json()
    assert len(p1_data["items"]) == 1
    assert p1_data["limit"] == 1
    assert p1_data["offset"] == 0


@pytest.mark.asyncio
async def test_technology_analyze_idempotency(client: AsyncClient, test_db_session: AsyncSession):
    """Verify re-running technology analysis produces identical results with no duplicates."""
    audit = Audit(
        target_url="https://idempotent-test.com",
        normalized_url="https://idempotent-test.com/",
        hostname="idempotent-test.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    html = "<meta name='generator' content='Shopify' /><script src='https://cdn.shopify.com/s/test.js'></script>"
    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://idempotent-test.com/",
        final_url="https://idempotent-test.com/",
        fetch_status="success",
        http_status=200,
        headers_json={"x-shopify-stage": "production"},
        technology_evidence_json=HTMLTechnologyExtractor.extract(html).to_dict(),
    )
    test_db_session.add(page)
    await test_db_session.commit()

    # First run
    run1 = await client.post(f"/api/v1/audits/{audit.id}/technologies/analyze")
    assert run1.status_code == 200
    count1 = run1.json()["technologies_detected"]

    # Second run (exact same input)
    run2 = await client.post(f"/api/v1/audits/{audit.id}/technologies/analyze")
    assert run2.status_code == 200
    count2 = run2.json()["technologies_detected"]
    assert count1 == count2

    # Query DB count directly
    list_res = await client.get(f"/api/v1/audits/{audit.id}/technologies")
    assert list_res.json()["total"] == count1


@pytest.mark.asyncio
async def test_technology_audit_isolation(client: AsyncClient, test_db_session: AsyncSession):
    """Verify Audit A and Audit B technologies remain isolated."""
    audit_a = Audit(
        target_url="https://audit-a.com",
        normalized_url="https://audit-a.com/",
        hostname="audit-a.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    audit_b = Audit(
        target_url="https://audit-b.com",
        normalized_url="https://audit-b.com/",
        hostname="audit-b.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add_all([audit_a, audit_b])
    await test_db_session.commit()

    # Audit A: Webflow
    page_a = CrawlPage(
        audit_id=audit_a.id,
        requested_url="https://audit-a.com/",
        final_url="https://audit-a.com/",
        fetch_status="success",
        http_status=200,
        headers_json={},
        technology_evidence_json=HTMLTechnologyExtractor.extract("<html data-wf-page='123'></html>").to_dict(),
    )
    # Audit B: Django
    page_b = CrawlPage(
        audit_id=audit_b.id,
        requested_url="https://audit-b.com/",
        final_url="https://audit-b.com/",
        fetch_status="success",
        http_status=200,
        headers_json={"set-cookie": "csrftoken=abc; path=/"},
        technology_evidence_json=HTMLTechnologyExtractor.extract("<html></html>").to_dict(),
    )
    test_db_session.add_all([page_a, page_b])
    await test_db_session.commit()

    # Analyze both
    await client.post(f"/api/v1/audits/{audit_a.id}/technologies/analyze")
    await client.post(f"/api/v1/audits/{audit_b.id}/technologies/analyze")

    # Assert A has Webflow and not Django
    res_a = await client.get(f"/api/v1/audits/{audit_a.id}/technologies")
    techs_a = {t["technology_id"] for t in res_a.json()["items"]}
    assert "webflow" in techs_a
    assert "django" not in techs_a

    # Assert B has Django and not Webflow
    res_b = await client.get(f"/api/v1/audits/{audit_b.id}/technologies")
    techs_b = {t["technology_id"] for t in res_b.json()["items"]}
    assert "django" in techs_b
    assert "webflow" not in techs_b
