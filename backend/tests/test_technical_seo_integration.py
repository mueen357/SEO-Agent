"""Integration and E2E tests for Technical SEO rule execution, category isolation, and API endpoints."""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage, CrawlSitemap
from app.services.issue_service import IssueService


@pytest.mark.asyncio
async def test_category_safe_analysis_isolation(test_db_session: AsyncSession):
    audit = Audit(
        target_url="https://example.com",
        normalized_url="https://example.com",
        hostname="example.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
        robots_txt_status="found",
        robots_txt_content="User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml",
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    # 1. Page with good HTML
    page_1 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com",
        final_url="https://example.com",
        fetch_status="success",
        http_status=200,
        title="Valid Page Title for Example Domain",
        meta_description="A good description that explains the website clearly.",
        canonical_url="https://example.com",
        html_lang="en",
        headings_json={"h1": ["Example Home"], "counts": {"h1": 1}},
        headers_json={"content-type": "text/html; charset=utf-8"},
    )
    setattr(page_1, "canonical_tag_count", 1)

    # 2. Page with 404 client error
    page_2 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com/broken",
        final_url="https://example.com/broken",
        fetch_status="http_error",
        http_status=404,
        headers_json={"content-type": "text/html"},
    )
    setattr(page_2, "canonical_tag_count", 0)

    # 3. Page with redirect chain
    page_3 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com/old",
        final_url="https://example.com/new",
        fetch_status="success",
        http_status=200,
        redirect_chain_json=[{"url": "https://example.com/old"}, {"url": "https://example.com/mid"}, {"url": "https://example.com/new"}],
        title="Redirected Page",
        html_lang="en",
        headings_json={"h1": ["Redirected"], "counts": {"h1": 1}},
        headers_json={"content-type": "text/html"},
    )
    setattr(page_3, "canonical_tag_count", 1)

    # 4. Sitemap
    sitemap = CrawlSitemap(
        audit_id=audit.id,
        sitemap_url="https://example.com/sitemap.xml",
        status="valid",
        url_count=2,
    )
    setattr(sitemap, "urls_json", ["https://example.com", "https://example.com/broken"])

    test_db_session.add_all([page_1, page_2, page_3, sitemap])
    await test_db_session.commit()

    service = IssueService(test_db_session)

    # Step A: Run on-page analysis first
    onpage_res = await service.run_onpage_analysis(audit.id)
    assert onpage_res.pages_analyzed == 2  # page_1 and page_3 (HTTP 200)
    assert onpage_res.total_issues > 0

    onpage_summary = await service.get_summary(audit.id)
    onpage_count = onpage_summary.total_issues
    assert onpage_count > 0
    assert "technical" not in onpage_summary.by_category

    # Step B: Run technical analysis
    tech_res = await service.run_technical_analysis(audit.id)
    assert tech_res.pages_analyzed == 3  # All 3 pages evaluated for technical rules
    assert tech_res.total_issues > 0

    # Step C: Verify category isolation: on-page issues were NOT deleted!
    combined_summary = await service.get_summary(audit.id)
    assert "on_page" in combined_summary.by_category
    assert "technical" in combined_summary.by_category
    assert combined_summary.by_category["on_page"] == onpage_summary.by_category["on_page"]
    assert combined_summary.total_assessments > onpage_count
    assert combined_summary.actionable_findings > 0

    # Step D: Re-run technical analysis (idempotent rerun)
    tech_res_2 = await service.run_technical_analysis(audit.id)
    summary_after_rerun = await service.get_summary(audit.id)
    assert summary_after_rerun.total_assessments == combined_summary.total_assessments
    assert summary_after_rerun.by_category["technical"] == combined_summary.by_category["technical"]
    assert summary_after_rerun.by_category["on_page"] == combined_summary.by_category["on_page"]


@pytest.mark.asyncio
async def test_technical_seo_api_endpoints(test_db_session: AsyncSession, client: AsyncClient):
    audit = Audit(
        target_url="https://example.com",
        normalized_url="https://example.com",
        hostname="example.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
        robots_txt_status="found",
        robots_txt_content="User-agent: *\nDisallow: /private",
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com",
        final_url="https://example.com",
        fetch_status="success",
        http_status=200,
        title="Example Domain",
        meta_description="A good meta description.",
        canonical_url="https://example.com",
        html_lang="en",
        headings_json={"h1": ["Example Domain"], "counts": {"h1": 1}},
        headers_json={"content-type": "text/html"},
    )
    setattr(page, "canonical_tag_count", 1)
    test_db_session.add(page)
    await test_db_session.commit()

    # 1. Trigger POST /analyze/technical
    res_tech = await client.post(f"/api/v1/audits/{audit.id}/analyze/technical")
    assert res_tech.status_code == 200
    tech_data = res_tech.json()
    assert tech_data["audit_id"] == str(audit.id)
    assert tech_data["summary"]["total_assessments"] > 0

    # 2. Query GET /issues with category=technical filter
    res_issues = await client.get(f"/api/v1/audits/{audit.id}/issues?category=technical")
    assert res_issues.status_code == 200
    issues_data = res_issues.json()
    assert issues_data["total"] > 0
    for item in issues_data["items"]:
        assert item["category"] == "technical"

    # 3. Query GET /issues/summary
    res_sum = await client.get(f"/api/v1/audits/{audit.id}/issues/summary")
    assert res_sum.status_code == 200
    sum_data = res_sum.json()
    assert sum_data["total_assessments"] > 0
    assert sum_data["actionable_findings"] >= 0
    assert "technical" in sum_data["by_category"]
