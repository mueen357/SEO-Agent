"""Comprehensive end-to-end audit lifecycle verification with synthetic crawl fixtures."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, AuditMode, AuditStatus, CrawlLink, CrawlPage


@pytest.mark.asyncio
async def test_end_to_end_onpage_rule_analysis(client: AsyncClient, test_db_session: AsyncSession):
    # 1. Create Audit
    audit = Audit(
        target_url="https://acme-ecommerce.com",
        normalized_url="https://acme-ecommerce.com",
        hostname="acme-ecommerce.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()
    audit_id = audit.id

    # 2. Page A: Well-optimized Homepage
    page_a = CrawlPage(
        audit_id=audit_id,
        requested_url="https://acme-ecommerce.com",
        final_url="https://acme-ecommerce.com",
        depth=0,
        fetch_status="success",
        http_status=200,
        title="ACME Ecommerce - Premium Industrial Tools & Hardware",
        meta_description="Browse our comprehensive inventory of heavy-duty industrial tools and hardware accessories with same-day shipping.",
        canonical_url="https://acme-ecommerce.com",
        meta_robots="index, follow",
        html_lang="en-US",
        headings_json={"counts": {"h1": 1, "h2": 4, "h3": 2}, "h1": ["ACME Industrial Hardware Store"]},
        image_count=5,
        missing_alt_count=0,
        empty_alt_count=0,
        internal_link_count=12,
        external_link_count=2,
    )

    # 3. Page B: Flawed Catalog Page
    page_b = CrawlPage(
        audit_id=audit_id,
        requested_url="https://acme-ecommerce.com/catalog/defective",
        final_url="https://acme-ecommerce.com/catalog/defective",
        depth=1,
        fetch_status="success",
        http_status=200,
        title=None,  # Missing title -> High Fail
        meta_description="",  # Empty meta description -> Medium Fail
        canonical_url="ftp://invalid-canonical-url",  # Malformed canonical -> High Fail
        meta_robots=None,
        html_lang=None,  # Missing lang -> Low Warning
        headings_json={"counts": {"h1": 1, "h2": 0}, "h1": ["   "]},  # Empty H1 text -> Medium Fail
        image_count=6,
        missing_alt_count=4,  # Missing alt -> Medium Fail
        empty_alt_count=2,    # Empty alt -> Low Warning
        internal_link_count=0,  # Dead end -> Low Warning
        external_link_count=1,
    )

    # 4. Page C: Edge Case Blog Post
    page_c = CrawlPage(
        audit_id=audit_id,
        requested_url="https://acme-ecommerce.com/blog/tool-guide",
        final_url="https://acme-ecommerce.com/blog/tool-guide",
        depth=1,
        fetch_status="success",
        http_status=200,
        title="A" * 85,  # Long title -> Low Warning
        meta_description="Short summary",  # Short meta desc -> Low Warning
        canonical_url="https://partner-syndication.org/tool-guide",  # Cross-domain -> Low Warning
        meta_robots="noindex, follow",
        html_lang="en",
        headings_json={
            "counts": {"h1": 3, "h2": 2, "h3": 0, "h4": 1, "h5": 0, "h6": 0},
            "h1": ["Guide Title", "Secondary H1", "Tertiary H1"]
        },  # Multiple H1s + Heading Jump (H2 to H4) -> Warnings
        image_count=3,
        missing_alt_count=0,
        empty_alt_count=0,
        internal_link_count=4,
        external_link_count=1,
    )

    test_db_session.add_all([page_a, page_b, page_c])
    await test_db_session.commit()

    # Link with empty anchor on Page C
    link_c = CrawlLink(
        audit_id=audit_id,
        source_page_id=page_c.id,
        destination_url="https://acme-ecommerce.com/contact",
        link_text="   ",  # Empty anchor text
        internal=True,
    )
    test_db_session.add(link_c)
    await test_db_session.commit()

    # 5. Execute Analysis: POST /api/v1/audits/{id}/analyze
    analyze_res = await client.post(f"/api/v1/audits/{audit_id}/analyze")
    assert analyze_res.status_code == 200
    analyze_data = analyze_res.json()
    assert analyze_data["status"] == "completed"
    assert analyze_data["pages_analyzed"] == 3
    assert analyze_data["issues_found"] > 0
    initial_total = analyze_data["issues_found"]

    # 6. Verify Summary: GET /api/v1/audits/{id}/issues/summary
    summary_res = await client.get(f"/api/v1/audits/{audit_id}/issues/summary")
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["total_issues"] == initial_total
    assert summary["by_status"]["fail"] >= 4  # Missing title, empty meta desc, malformed canonical, missing alt, empty H1
    assert summary["by_status"]["warning"] >= 5
    assert summary["by_status"]["pass"] >= 5
    assert summary["by_category"]["on_page"] >= 10
    assert summary["by_category"]["images"] >= 4
    assert summary["by_category"]["links"] >= 4

    # 7. Query All Issues with Pagination
    all_issues_res = await client.get(f"/api/v1/audits/{audit_id}/issues?page=1&page_size=50")
    assert all_issues_res.status_code == 200
    all_issues = all_issues_res.json()
    assert all_issues["total"] == initial_total
    assert len(all_issues["issues"]) == initial_total

    # 8. Query Filtered by Severity: severity=high
    high_res = await client.get(f"/api/v1/audits/{audit_id}/issues?severity=high")
    assert high_res.status_code == 200
    high_issues = high_res.json()["issues"]
    assert len(high_issues) >= 2
    high_rule_ids = [i["rule_id"] for i in high_issues]
    assert "ONPAGE_TITLE_PRESENT" in high_rule_ids
    assert "ONPAGE_CANONICAL_VALID" in high_rule_ids

    # 9. Query Filtered by Status: status=fail
    fail_res = await client.get(f"/api/v1/audits/{audit_id}/issues?status=fail")
    assert fail_res.status_code == 200
    fail_issues = fail_res.json()["issues"]
    assert all(i["status"] == "fail" for i in fail_issues)

    # 10. Query Filtered by Category: category=images
    images_res = await client.get(f"/api/v1/audits/{audit_id}/issues?category=images")
    assert images_res.status_code == 200
    image_issues = images_res.json()["issues"]
    assert all(i["category"] == "images" for i in image_issues)

    # 11. Idempotency Check: Re-run analysis must not create duplicates
    rerun_res = await client.post(f"/api/v1/audits/{audit_id}/analyze")
    assert rerun_res.status_code == 200
    rerun_data = rerun_res.json()
    assert rerun_data["issues_found"] == initial_total

    summary_after_rerun = (await client.get(f"/api/v1/audits/{audit_id}/issues/summary")).json()
    assert summary_after_rerun["total_issues"] == initial_total, "Idempotent rerun must not duplicate findings"
