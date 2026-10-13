"""Integration, API, and End-to-End verification tests for Site-Wide SEO intelligence."""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Audit,
    AuditMode,
    AuditStatus,
    CrawlLink,
    CrawlPage,
    CrawlSitemap,
    SeoIssue,
    SiteFindingGroup,
)
from app.services.issue_service import IssueService


@pytest.mark.asyncio
async def test_rule_set_isolation_cross_family(test_db_session: AsyncSession):
    """Verify on-page, technical, and site-wide rule executions strictly preserve each other."""
    audit = Audit(
        target_url="https://example.com",
        normalized_url="https://example.com",
        hostname="example.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    # Create 2 pages
    p1 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com/p1",
        final_url="https://example.com/p1",
        fetch_status="success",
        http_status=200,
        title="Exact Same Title",
        meta_description="Exact same meta description across both pages.",
        canonical_url="https://example.com/p1",
        normalized_main_text_hash="samecontenthash",
        main_text_simhash="1234567890abcdef",
        main_text_word_count=120,
        content_quality_status="usable",
    )
    p2 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com/p2",
        final_url="https://example.com/p2",
        fetch_status="success",
        http_status=200,
        title="Exact Same Title",
        meta_description="Exact same meta description across both pages.",
        canonical_url="https://example.com/p2",
        normalized_main_text_hash="samecontenthash",
        main_text_simhash="1234567890abcdef",
        main_text_word_count=120,
        content_quality_status="usable",
    )
    test_db_session.add_all([p1, p2])
    await test_db_session.commit()

    service = IssueService(test_db_session)

    # 1. Run on-page analysis
    res_onpage = await service.run_onpage_analysis(audit.id)
    assert res_onpage.status == "completed"

    issues_after_onpage = (await test_db_session.execute(
        select(SeoIssue).where(SeoIssue.audit_id == audit.id)
    )).scalars().all()
    onpage_count = len(issues_after_onpage)
    assert onpage_count > 0
    assert all(iss.rule_id.startswith("ONPAGE_") for iss in issues_after_onpage)

    # 2. Run technical analysis
    res_tech = await service.run_technical_analysis(audit.id)
    assert res_tech.status == "completed"

    issues_after_tech = (await test_db_session.execute(
        select(SeoIssue).where(SeoIssue.audit_id == audit.id)
    )).scalars().all()
    tech_count = sum(1 for iss in issues_after_tech if iss.rule_id.startswith("TECH_"))
    onpage_count_after_tech = sum(1 for iss in issues_after_tech if iss.rule_id.startswith("ONPAGE_"))
    assert tech_count > 0
    # Crucial: On-page issues MUST be strictly preserved!
    assert onpage_count_after_tech == onpage_count

    # 3. Run site-wide analysis
    res_site = await service.run_sitewide_analysis(audit.id)
    assert res_site.status == "completed"

    issues_after_site = (await test_db_session.execute(
        select(SeoIssue).where(SeoIssue.audit_id == audit.id)
    )).scalars().all()
    site_count = sum(1 for iss in issues_after_site if iss.rule_id.startswith("SITE_"))
    tech_count_after_site = sum(1 for iss in issues_after_site if iss.rule_id.startswith("TECH_"))
    onpage_count_after_site = sum(1 for iss in issues_after_site if iss.rule_id.startswith("ONPAGE_"))
    assert site_count > 0
    # Crucial: On-page and technical issues MUST be strictly preserved!
    assert onpage_count_after_site == onpage_count
    assert tech_count_after_site == tech_count

    # 4. Re-running on-page again preserves technical and site-wide findings
    await service.run_onpage_analysis(audit.id)
    issues_after_rerun = (await test_db_session.execute(
        select(SeoIssue).where(SeoIssue.audit_id == audit.id)
    )).scalars().all()
    assert sum(1 for iss in issues_after_rerun if iss.rule_id.startswith("TECH_")) == tech_count
    assert sum(1 for iss in issues_after_rerun if iss.rule_id.startswith("SITE_")) == site_count


@pytest.mark.asyncio
async def test_sitewide_api_endpoints(test_db_session: AsyncSession, client: AsyncClient):
    """Test REST API endpoints for site-wide intelligence execution and reporting."""
    audit = Audit(
        target_url="https://example.com",
        normalized_url="https://example.com",
        hostname="example.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    p1 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com/p1",
        final_url="https://example.com/p1",
        depth=0,
        fetch_status="success",
        http_status=200,
        title="Title A",
        canonical_url="https://example.com/p1",
        normalized_main_text_hash="hash_same",
        main_text_simhash="aaaa1111bbbb2222",
        main_text_word_count=100,
        content_quality_status="usable",
    )
    p2 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://example.com/p2",
        final_url="https://example.com/p2",
        depth=1,
        fetch_status="success",
        http_status=200,
        title="Title A",
        canonical_url="https://example.com/p2",
        normalized_main_text_hash="hash_same",
        main_text_simhash="aaaa1111bbbb2222",
        main_text_word_count=100,
        content_quality_status="usable",
    )
    test_db_session.add_all([p1, p2])
    await test_db_session.commit()

    link = CrawlLink(
        audit_id=audit.id,
        source_page_id=p1.id,
        destination_url="https://example.com/p2",
        internal=True,
    )
    test_db_session.add(link)
    await test_db_session.commit()

    # 1. POST /api/v1/audits/{id}/analyze/sitewide
    post_res = await client.post(f"/api/v1/audits/{audit.id}/analyze/sitewide")
    assert post_res.status_code == 200
    post_data = post_res.json()
    assert post_data["status"] == "completed"
    assert post_data["pages_analyzed"] == 2

    # 2. GET /api/v1/audits/{id}/sitewide/summary
    sum_res = await client.get(f"/api/v1/audits/{audit.id}/sitewide/summary")
    assert sum_res.status_code == 200
    sum_data = sum_res.json()
    assert sum_data["exact_duplicate_groups_count"] == 1
    assert sum_data["pages_analyzed"] == 2
    assert sum_data["rules_executed_count"] == 13

    # 3. GET /api/v1/audits/{id}/sitewide/duplicate-groups
    dup_res = await client.get(f"/api/v1/audits/{audit.id}/sitewide/duplicate-groups")
    assert dup_res.status_code == 200
    dup_data = dup_res.json()
    assert dup_data["total"] >= 1
    group = dup_data["items"][0]
    assert group["group_type"] in ("exact_duplicate_content", "duplicate_title")
    assert len(group["affected_urls"]) == 2

    # 4. GET /api/v1/audits/{id}/sitewide/link-graph
    graph_res = await client.get(f"/api/v1/audits/{audit.id}/sitewide/link-graph")
    assert graph_res.status_code == 200
    graph_data = graph_res.json()
    assert graph_data["total_nodes"] == 2
    assert graph_data["total_internal_edges"] == 1
    assert len(graph_data["nodes"]) == 2


@pytest.mark.asyncio
async def test_synthetic_8_page_end_to_end_audit(test_db_session: AsyncSession):
    """End-to-End audit verification on an 8-page synthetic website fixture (Step 18).
    
    Includes:
    - 2 exact duplicate articles with different navigation HTML
    - 2 near-duplicate service pages (Hamming dist <= 3)
    - Repeated title tags and meta descriptions
    - 1 unique page
    - 1 sitemap-only page
    - 1 link to an observed 404
    - 1 valid redirect link (301)
    - Different canonical preferences
    """
    audit = Audit(
        target_url="https://fixture.local/",
        normalized_url="https://fixture.local",
        hostname="fixture.local",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    # 1 & 2: Two exact duplicate articles
    p1 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://fixture.local/blog/article-1",
        final_url="https://fixture.local/blog/article-1",
        depth=1,
        fetch_status="success",
        http_status=200,
        title="SEO Optimization Guide",
        meta_description="A complete guide to technical search engine optimization.",
        canonical_url="https://fixture.local/blog/article-1",
        normalized_main_text_hash="article_exact_hash_999",
        main_text_simhash="1122334455667788",
        main_text_word_count=350,
        content_quality_status="usable",
    )
    p2 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://fixture.local/news/article-repost",
        final_url="https://fixture.local/news/article-repost",
        depth=1,
        fetch_status="success",
        http_status=200,
        title="SEO Optimization Guide",
        meta_description="A complete guide to technical search engine optimization.",
        canonical_url="https://fixture.local/news/article-repost",
        normalized_main_text_hash="article_exact_hash_999",
        main_text_simhash="1122334455667788",
        main_text_word_count=350,
        content_quality_status="usable",
    )

    # 3 & 4: Two near-duplicate service pages (SimHash differ by 2 bits)
    p3 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://fixture.local/services/chicago-seo",
        final_url="https://fixture.local/services/chicago-seo",
        depth=2,
        fetch_status="success",
        http_status=200,
        title="Local SEO Services in Chicago",
        meta_description="Best agency for search engine optimization.",
        canonical_url="https://fixture.local/services/chicago-seo",
        normalized_main_text_hash="chicago_hash",
        main_text_simhash="ffffffffffffffff",
        main_text_word_count=280,
        content_quality_status="usable",
    )
    p4 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://fixture.local/services/boston-seo",
        final_url="https://fixture.local/services/boston-seo",
        depth=2,
        fetch_status="success",
        http_status=200,
        title="Local SEO Services in Boston",
        meta_description="Best agency for search engine optimization.",
        canonical_url="https://fixture.local/services/boston-seo",
        normalized_main_text_hash="boston_hash",
        main_text_simhash="fffffffffffffffc",  # 2 bits difference
        main_text_word_count=275,
        content_quality_status="usable",
    )

    # 5: Unique home page (seed)
    p5 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://fixture.local/",
        final_url="https://fixture.local/",
        depth=0,
        fetch_status="success",
        http_status=200,
        title="Fixture Agency Home",
        meta_description="Welcome to our agency.",
        canonical_url="https://fixture.local/",
        normalized_main_text_hash="unique_home_hash",
        main_text_simhash="0000111100001111",
        main_text_word_count=150,
        content_quality_status="usable",
    )

    # 6: Sitemap-only page (no inlinks in crawl graph)
    p6 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://fixture.local/sitemap-only-terms",
        final_url="https://fixture.local/sitemap-only-terms",
        depth=2,
        fetch_status="success",
        http_status=200,
        title="Terms of Service",
        meta_description="Legal terms and conditions.",
        canonical_url="https://fixture.local/sitemap-only-terms",
        normalized_main_text_hash="legal_terms_hash",
        main_text_simhash="9999888877776666",
        main_text_word_count=500,
        content_quality_status="usable",
    )

    # 7: Observed broken 404 destination
    p7 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://fixture.local/broken-link-target",
        final_url="https://fixture.local/broken-link-target",
        depth=1,
        fetch_status="failed",
        http_status=404,
        title=None,
    )

    # 8: Observed redirect destination (301)
    p8 = CrawlPage(
        audit_id=audit.id,
        requested_url="https://fixture.local/old-contact",
        final_url="https://fixture.local/old-contact",
        depth=1,
        fetch_status="success",
        http_status=301,
        title=None,
    )

    test_db_session.add_all([p1, p2, p3, p4, p5, p6, p7, p8])
    await test_db_session.commit()

    # Create links:
    # Home links to article-1, chicago-seo, broken-link-target, and old-contact
    l1 = CrawlLink(audit_id=audit.id, source_page_id=p5.id, destination_url="https://fixture.local/blog/article-1", internal=True)
    l2 = CrawlLink(audit_id=audit.id, source_page_id=p5.id, destination_url="https://fixture.local/services/chicago-seo", internal=True)
    l3 = CrawlLink(audit_id=audit.id, source_page_id=p5.id, destination_url="https://fixture.local/broken-link-target", internal=True)
    l4 = CrawlLink(audit_id=audit.id, source_page_id=p5.id, destination_url="https://fixture.local/old-contact", internal=True)
    # Article-1 links to Boston SEO
    l5 = CrawlLink(audit_id=audit.id, source_page_id=p1.id, destination_url="https://fixture.local/services/boston-seo", internal=True)

    test_db_session.add_all([l1, l2, l3, l4, l5])

    # Record Sitemap containing terms of service
    sitemap = CrawlSitemap(
        audit_id=audit.id,
        sitemap_url="https://fixture.local/sitemap.xml",
        urls_json=["https://fixture.local/sitemap-only-terms", "https://fixture.local/"],
    )
    test_db_session.add(sitemap)
    await test_db_session.commit()

    service = IssueService(test_db_session)
    res = await service.run_sitewide_analysis(audit.id)
    assert res.status == "completed"

    # Verify site finding groups persisted
    groups, total_groups = await service.repo.get_finding_groups(audit.id, page=1, page_size=100)
    assert total_groups >= 2

    group_types = {g.group_type for g in groups}
    # Exact duplicate group detected
    assert "exact_duplicate_content" in group_types
    # Near duplicate group detected
    assert "near_duplicate_content" in group_types
    # Duplicate titles detected
    assert "duplicate_title" in group_types

    # Verify link graph
    graph_summary = await service.get_sitewide_link_graph(audit.id)
    assert graph_summary.total_nodes == 8
    assert graph_summary.broken_link_destinations >= 1
    assert graph_summary.redirect_destinations >= 1

    # Verify sitemap-only terms page identified
    terms_node = next((n for n in graph_summary.nodes if "sitemap-only-terms" in n.url), None)
    assert terms_node is not None
    assert terms_node.is_sitemap_only is True
    assert terms_node.inbound_internal_count == 0

    # Idempotent re-run check: verify running analysis again does not duplicate groups or findings
    await service.run_sitewide_analysis(audit.id)
    groups_after, total_after = await service.repo.get_finding_groups(audit.id, page=1, page_size=100)
    assert total_after == total_groups
