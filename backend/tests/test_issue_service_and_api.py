"""Integration tests for IssueService and audits issues API endpoints."""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage
from app.services.issue_service import IssueService


@pytest.mark.asyncio
async def test_issue_service_run_and_idempotency(test_db_session: AsyncSession):
    audit = Audit(
        target_url="https://example.com",
        normalized_url="https://example.com",
        hostname="example.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com",
        final_url="https://example.com",
        fetch_status="success",
        http_status=200,
        title="Test Page Title",
        meta_description="A valid test meta description that provides concise information.",
        html_lang="en",
        headings_json={"counts": {"h1": 1}, "h1": ["Test Page Heading"]},
        image_count=2,
        missing_alt_count=0,
        empty_alt_count=0,
        internal_link_count=3,
        external_link_count=1,
    )
    test_db_session.add(page)
    await test_db_session.commit()

    service = IssueService(test_db_session)
    res1 = await service.run_onpage_analysis(audit.id)
    assert res1.pages_analyzed == 1
    assert res1.issues_found > 0
    first_issues_count = res1.issues_found

    # Idempotent re-run
    res2 = await service.run_onpage_analysis(audit.id)
    assert res2.pages_analyzed == 1
    assert res2.issues_found == first_issues_count, "Re-run must not duplicate issues"

    summary = await service.get_summary(audit.id)
    assert summary.total_issues == first_issues_count
    assert "on_page" in summary.by_category


@pytest.mark.asyncio
async def test_api_analyze_and_issues_endpoints(client: AsyncClient, test_db_session: AsyncSession):
    audit = Audit(
        target_url="https://example.com",
        normalized_url="https://example.com",
        hostname="example.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com",
        final_url="https://example.com",
        fetch_status="success",
        http_status=200,
        title=None,  # Missing title triggers high severity fail
        meta_description=None,
        html_lang=None,
    )
    test_db_session.add(page)
    await test_db_session.commit()

    # 1. Trigger POST /api/v1/audits/{id}/analyze
    analyze_resp = await client.post(f"/api/v1/audits/{audit.id}/analyze")
    assert analyze_resp.status_code == 200
    data = analyze_resp.json()
    assert data["status"] == "completed"
    assert data["pages_analyzed"] == 1
    assert data["issues_found"] > 0

    # 2. Query GET /api/v1/audits/{id}/issues
    issues_resp = await client.get(f"/api/v1/audits/{audit.id}/issues")
    assert issues_resp.status_code == 200
    issues_data = issues_resp.json()
    assert issues_data["total"] > 0
    assert len(issues_data["issues"]) > 0

    # 3. Filter by severity=high
    filter_resp = await client.get(f"/api/v1/audits/{audit.id}/issues?severity=high")
    assert filter_resp.status_code == 200
    high_issues = filter_resp.json()["issues"]
    assert all(i["severity"] == "high" for i in high_issues)
    assert any(i["rule_id"] == "ONPAGE_TITLE_PRESENT" for i in high_issues)

    # 4. Summary endpoint GET /api/v1/audits/{id}/issues/summary
    summary_resp = await client.get(f"/api/v1/audits/{audit.id}/issues/summary")
    assert summary_resp.status_code == 200
    summary_data = summary_resp.json()
    assert summary_data["total_issues"] > 0
    assert summary_data["by_severity"]["high"] >= 1
