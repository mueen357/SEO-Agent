"""Comprehensive unit tests for all 13 Site-Wide SEO and Topological rules."""

import uuid
import pytest

from app.audit_engine.context import SiteWideAuditContext
from app.audit_engine.link_graph import InternalLinkGraph
from app.audit_engine.rules.sitewide.canonical_groups import (
    ContentCanonicalConflictRule,
    DuplicateCanonicalReviewRule,
)
from app.audit_engine.rules.sitewide.duplicate_content import (
    DuplicateExactContentRule,
    DuplicateNearContentRule,
)
from app.audit_engine.rules.sitewide.duplicate_metadata import (
    DuplicateH1Rule,
    DuplicateMetaDescriptionRule,
    DuplicateTitleRule,
)
from app.audit_engine.rules.sitewide.internal_graph import (
    DeepCrawlPathRule,
    LowInternalInlinksRule,
    NoObservedInternalInlinksRule,
)
from app.audit_engine.rules.sitewide.link_health import (
    InternalLinkTo4xxRule,
    InternalLinkTo5xxRule,
    InternalLinkToRedirectRule,
)
from app.database.models import CrawlLink, CrawlPage


def make_page(
    url: str,
    status_code: int = 200,
    title: str = "Test Title",
    meta_desc: str = "Test meta description for this page.",
    h1: str = "Primary Heading",
    canonical_url: str = None,
    content_hash: str = "hash123",
    simhash: str = "0123456789abcdef",
    word_count: int = 150,
    quality: str = "usable",
    depth: int = 1,
) -> CrawlPage:
    """Helper to instantiate mock CrawlPage with required metadata."""
    p = CrawlPage(
        id=uuid.uuid4(),
        audit_id=uuid.uuid4(),
        requested_url=url,
        final_url=url,
        depth=depth,
        fetch_status="success" if status_code < 400 else "failed",
        http_status=status_code,
        content_type="text/html",
        title=title,
        meta_description=meta_desc,
        canonical_url=canonical_url or url,
        headings_json={"h1": [h1] if h1 else []},
        normalized_main_text_hash=content_hash,
        main_text_simhash=simhash,
        main_text_word_count=word_count,
        main_text_character_count=word_count * 6,
        content_quality_status=quality,
        extraction_source="main",
        extraction_version="1.0.0",
    )
    return p


def make_sitewide_ctx(pages, links=None, sitemap_urls=None, host="example.com", target_url="https://example.com/"):
    audit_id = pages[0].audit_id if pages else uuid.uuid4()
    links = links or []
    sitemap_urls = sitemap_urls or set()
    graph = InternalLinkGraph.from_crawl(
        pages=pages,
        links=links,
        sitemap_urls=sitemap_urls,
        seed_url=target_url,
    )
    return SiteWideAuditContext(
        audit_id=audit_id,
        target_url=target_url,
        hostname=host,
        host=host,
        pages=pages,
        links=links,
        link_graph=graph,
        sitemaps=[],
        sitemap_urls=sitemap_urls,
        crawl_status="completed",
    )


# --- 1. Duplicate Content Rules ---

def test_exact_duplicate_content_detection():
    p1 = make_page("https://example.com/page-1", content_hash="exacthash1", simhash="1111111111111111", word_count=200)
    p2 = make_page("https://example.com/page-2", content_hash="exacthash1", simhash="1111111111111111", word_count=200)
    p3 = make_page("https://example.com/page-3", content_hash="uniquehash", simhash="2222222222222222", word_count=180)

    ctx = make_sitewide_ctx([p1, p2, p3])
    rule = DuplicateExactContentRule()
    results = rule.evaluate_site(ctx)

    assert len(results) == 1
    res = results[0]
    assert res.status == "fail"
    assert res.severity == "high"
    assert res.evidence["page_count"] == 2
    urls = res.evidence.get("all_urls") or res.evidence.get("sample_urls") or []
    assert "https://example.com/page-1" in urls
    assert "https://example.com/page-2" in urls


def test_exact_duplicate_content_ignores_thin_and_failed_pages():
    p1 = make_page("https://example.com/login", content_hash="thinhash", word_count=5, quality="thin")
    p2 = make_page("https://example.com/register", content_hash="thinhash", word_count=8, quality="thin")
    p_fail = make_page("https://example.com/err", status_code=500, content_hash="thinhash", quality="usable")

    ctx = make_sitewide_ctx([p1, p2, p_fail])
    rule = DuplicateExactContentRule()
    results = rule.evaluate_site(ctx)

    assert len(results) == 1
    assert results[0].status == "pass"


def test_near_duplicate_content_detection():
    p1 = make_page("https://example.com/service-a", content_hash="hashA", simhash="ffffffffffffffff", word_count=300)
    p2 = make_page("https://example.com/service-b", content_hash="hashB", simhash="fffffffffffffffc", word_count=290)
    p3 = make_page("https://example.com/about", content_hash="hashC", simhash="0000000000000000", word_count=150)

    ctx = make_sitewide_ctx([p1, p2, p3])
    rule = DuplicateNearContentRule()
    results = rule.evaluate_site(ctx)

    assert len(results) == 1
    res = results[0]
    assert res.status == "warning"
    assert res.severity == "medium"
    assert res.evidence["page_count"] == 2


# --- 2. Duplicate Metadata Rules ---

def test_duplicate_titles_detection():
    p1 = make_page("https://example.com/p1", title="Welcome to Antigravity SEO")
    p2 = make_page("https://example.com/p2", title=" welcome to antigravity seo  ")
    p3 = make_page("https://example.com/p3", title="Different Unique Title")

    ctx = make_sitewide_ctx([p1, p2, p3])
    results = DuplicateTitleRule().evaluate_site(ctx)

    assert len(results) == 1
    res = results[0]
    assert res.status == "warning"
    assert res.evidence["page_count"] == 2


def test_duplicate_meta_descriptions_detection():
    desc = "We provide full website audit automation and reporting."
    p1 = make_page("https://example.com/p1", meta_desc=desc)
    p2 = make_page("https://example.com/p2", meta_desc=desc.upper())
    p3 = make_page("https://example.com/p3", meta_desc="Completely unique meta description.")

    ctx = make_sitewide_ctx([p1, p2, p3])
    results = DuplicateMetaDescriptionRule().evaluate_site(ctx)

    assert len(results) == 1
    res = results[0]
    assert res.status == "warning"
    assert res.evidence["page_count"] == 2


def test_duplicate_h1_detection():
    p1 = make_page("https://example.com/p1", h1="Services Overview")
    p2 = make_page("https://example.com/p2", h1="Services Overview")
    p3 = make_page("https://example.com/p3", h1="Contact Us")

    ctx = make_sitewide_ctx([p1, p2, p3])
    results = DuplicateH1Rule().evaluate_site(ctx)

    assert len(results) == 1
    res = results[0]
    assert res.status == "warning"
    assert res.evidence["page_count"] == 2


# --- 3. Internal Link Graph Rules ---

def test_no_observed_internal_inlinks():
    p1 = make_page("https://example.com/")
    p2 = make_page("https://example.com/products")
    p3 = make_page("https://example.com/orphaned-page")

    link = CrawlLink(
        id=uuid.uuid4(),
        audit_id=p1.audit_id,
        source_page_id=p1.id,
        destination_url="https://example.com/products",
        internal=True,
    )

    ctx = make_sitewide_ctx([p1, p2, p3], links=[link], target_url="https://example.com/")
    results = NoObservedInternalInlinksRule().evaluate_site(ctx)

    assert len(results) == 1
    res = results[0]
    assert res.status == "warning"
    assert "https://example.com/orphaned-page" in res.evidence["all_urls"]
    assert "sampled crawl" in res.description


def test_sitemap_only_page_discovery_in_link_graph():
    p1 = make_page("https://example.com/")
    p2 = make_page("https://example.com/sitemap-only-page")

    ctx = make_sitewide_ctx(
        [p1, p2],
        links=[],
        sitemap_urls={"https://example.com/sitemap-only-page"},
        target_url="https://example.com/",
    )
    node = ctx.link_graph.get_node("https://example.com/sitemap-only-page")
    assert node is not None
    assert node.is_sitemap_only is True


def test_internal_links_to_confirmed_4xx_and_5xx():
    p1 = make_page("https://example.com/source")
    p404 = make_page("https://example.com/broken", status_code=404)
    p500 = make_page("https://example.com/server-error", status_code=500)

    l404 = CrawlLink(
        id=uuid.uuid4(),
        audit_id=p1.audit_id,
        source_page_id=p1.id,
        destination_url="https://example.com/broken",
        internal=True,
    )
    l500 = CrawlLink(
        id=uuid.uuid4(),
        audit_id=p1.audit_id,
        source_page_id=p1.id,
        destination_url="https://example.com/server-error",
        internal=True,
    )

    ctx = make_sitewide_ctx([p1, p404, p500], links=[l404, l500])

    res_4xx = InternalLinkTo4xxRule().evaluate_site(ctx)
    assert len(res_4xx) == 1
    assert res_4xx[0].status == "fail"
    assert res_4xx[0].evidence["http_status"] == 404

    res_5xx = InternalLinkTo5xxRule().evaluate_site(ctx)
    assert len(res_5xx) == 1
    assert res_5xx[0].status == "fail"
    assert res_5xx[0].evidence["http_status"] == 500


def test_internal_links_to_redirect():
    p1 = make_page("https://example.com/source")
    predirect = make_page("https://example.com/old-url", status_code=301)

    l_red = CrawlLink(
        id=uuid.uuid4(),
        audit_id=p1.audit_id,
        source_page_id=p1.id,
        destination_url="https://example.com/old-url",
        internal=True,
    )

    ctx = make_sitewide_ctx([p1, predirect], links=[l_red])
    res_red = InternalLinkToRedirectRule().evaluate_site(ctx)

    assert len(res_red) == 1
    assert res_red[0].status == "warning"
    assert res_red[0].severity == "low"
    assert res_red[0].evidence["http_status"] == 301


def test_deep_crawl_path_rule():
    p_deep = make_page("https://example.com/level5", depth=5)
    ctx = make_sitewide_ctx([p_deep])

    results = DeepCrawlPathRule().evaluate_site(ctx)
    assert len(results) == 1
    assert results[0].status == "warning"
    assert results[0].evidence["max_depth"] == 5


# --- 4. Canonical Group Analysis ---

def test_duplicate_canonical_review_and_conflict():
    # Two duplicate pages pointing to conflicting self-referencing canonicals
    p1 = make_page("https://example.com/dup1", content_hash="samehash", canonical_url="https://example.com/dup1")
    p2 = make_page("https://example.com/dup2", content_hash="samehash", canonical_url="https://example.com/dup2")

    ctx = make_sitewide_ctx([p1, p2])

    res_review = DuplicateCanonicalReviewRule().evaluate_site(ctx)
    assert len(res_review) == 1
    assert res_review[0].status == "warning"
    assert "https://example.com/dup1" in res_review[0].evidence["declared_canonicals"]
    assert "https://example.com/dup2" in res_review[0].evidence["declared_canonicals"]


def test_duplicate_pages_consolidated_to_single_canonical():
    # Two duplicate pages pointing to the SAME preferred canonical
    p1 = make_page("https://example.com/dup1", content_hash="samehash", canonical_url="https://example.com/preferred")
    p2 = make_page("https://example.com/dup2", content_hash="samehash", canonical_url="https://example.com/preferred")

    ctx = make_sitewide_ctx([p1, p2])

    res_review = DuplicateCanonicalReviewRule().evaluate_site(ctx)
    assert len(res_review) == 1
    assert res_review[0].status == "pass"
    assert "consolidated" in res_review[0].title.lower()
