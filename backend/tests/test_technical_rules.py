"""Unit tests for all 22 Technical SEO audit rules and Phase 2 Task 2.1 hardening."""

import uuid
import pytest
from app.audit_engine.context import PageAuditContext, SiteAuditContext
from app.audit_engine.rules.onpage.canonical import CanonicalValidRule
from app.audit_engine.rules.onpage.headings import H1PresenceRule
from app.audit_engine.rules.onpage.html_language import HtmlLanguageRule
from app.audit_engine.rules.technical import (
    HttpStatus4xxRule,
    HttpStatus5xxRule,
    HttpStatus429Rule,
    HttpUnsupportedContentRule,
    MetaRobotsDirectivesRule,
    XRobotsTagRule,
    RobotsFetchStatusRule,
    RobotsDisallowRule,
    RobotsSitemapDeclarationRule,
    SitemapAvailabilityRule,
    SitemapParseErrorRule,
    SitemapUrlStatusRule,
    SitemapNoindexConflictRule,
    SitemapCanonicalConflictRule,
    RedirectChainRule,
    RedirectLoopRule,
    RedirectFailureRule,
    CanonicalTargetStatusRule,
    CanonicalConflictRule,
    CanonicalMultipleRule,
    HttpsUsageRule,
    HttpsDowngradeRule,
)
from app.database.models import CrawlPage, CrawlSitemap


def make_context(
    url="https://example.com/page",
    requested_url=None,
    fetch_status="success",
    http_status=200,
    canonical_url=None,
    canonical_tag_count=1,
    meta_robots=None,
    html_lang=None,
    redirect_chain=None,
    content_type="text/html",
    headers_json=None,
    sitemaps=None,
    sitemap_urls=None,
    robots_txt_status=None,
    robots_txt_content=None,
    url_to_page=None,
) -> PageAuditContext:
    page = CrawlPage(
        id=uuid.uuid4(),
        audit_id=uuid.uuid4(),
        requested_url=requested_url or url,
        final_url=url,
        fetch_status=fetch_status,
        http_status=http_status,
        canonical_url=canonical_url,
        meta_robots=meta_robots,
        html_lang=html_lang,
        content_type=content_type,
        redirect_chain_json=redirect_chain or [],
        headings_json={"counts": {"h1": 1}},
    )
    setattr(page, "canonical_tag_count", canonical_tag_count)
    setattr(page, "headers_json", headers_json or {})

    return PageAuditContext(
        page=page,
        audit_target_url="https://example.com",
        audit_hostname="example.com",
        sitemaps=sitemaps or [],
        sitemap_urls=sitemap_urls or set(),
        robots_txt_status=robots_txt_status,
        robots_txt_content=robots_txt_content,
        url_to_page=url_to_page or {},
        response_headers=headers_json,
    )


# --- Step 2 Hardening Tests ---

def test_canonical_relative_url_handling():
    # Valid relative canonical resolving against base URL
    ctx_rel = make_context(url="https://example.com/products/item", canonical_url="/products/item")
    res_rel = CanonicalValidRule().evaluate(ctx_rel)
    assert res_rel.status == "pass"
    assert "Valid relative canonical" in res_rel.title

    # Malformed / unsupported scheme
    ctx_bad = make_context(url="https://example.com/page", canonical_url="mailto:info@example.com")
    res_bad = CanonicalValidRule().evaluate(ctx_bad)
    assert res_bad.status == "fail"


def test_bcp47_language_validation():
    rule = HtmlLanguageRule()
    # 2-letter, 3-letter, script, regional, variants
    for valid_tag in ("en", "es", "cmn", "ast", "zh-Hans", "zh-Hant-HK", "en-US", "pt-BR", "es-419"):
        ctx = make_context(html_lang=valid_tag)
        assert rule.evaluate(ctx).status == "pass", f"Failed for valid tag: {valid_tag}"

    # Invalid tag
    ctx_inv = make_context(html_lang="invalid_123_tag!")
    assert rule.evaluate(ctx_inv).status == "warning"


def test_h1_presence_structural_severity():
    rule = H1PresenceRule()
    ctx_missing = make_context()
    ctx_missing.page.headings_json = {"counts": {"h1": 0}}
    res = rule.evaluate(ctx_missing)
    assert res.status == "warning"
    assert res.severity == "low"
    assert "not a strict Google indexing requirement" in res.description


# --- HTTP Status Tests (Step 4) ---

def test_http_status_4xx_rule():
    rule = HttpStatus4xxRule()
    assert rule.evaluate(make_context(http_status=200)).status == "pass"
    assert rule.evaluate(make_context(http_status=404)).status == "fail"
    assert rule.evaluate(make_context(http_status=410)).status == "warning"
    assert rule.evaluate(make_context(http_status=403)).status == "warning"
    assert rule.evaluate(make_context(http_status=None)).status == "unknown"


def test_http_status_5xx_rule():
    rule = HttpStatus5xxRule()
    assert rule.evaluate(make_context(http_status=200)).status == "pass"
    res_500 = rule.evaluate(make_context(http_status=500))
    assert res_500.status == "fail"
    assert res_500.severity == "critical"


def test_http_status_429_rule():
    rule = HttpStatus429Rule()
    assert rule.evaluate(make_context(http_status=200)).status == "pass"
    res_429 = rule.evaluate(make_context(http_status=429))
    assert res_429.status == "fail"
    assert res_429.severity == "high"


def test_http_unsupported_content_rule():
    rule = HttpUnsupportedContentRule()
    assert rule.evaluate(make_context(content_type="text/html; charset=utf-8")).status == "pass"
    assert rule.evaluate(make_context(fetch_status="timeout")).status == "warning"
    assert rule.evaluate(make_context(content_type="application/pdf")).status == "pass"


# --- Meta Robots Directives (Step 5) ---

def test_meta_robots_directives_rule():
    rule = MetaRobotsDirectivesRule()
    assert rule.evaluate(make_context(meta_robots=None)).status == "pass"
    assert rule.evaluate(make_context(meta_robots="index, follow")).status == "pass"
    assert rule.evaluate(make_context(meta_robots="noindex, follow")).status == "warning"
    assert rule.evaluate(make_context(meta_robots="index, noindex")).status == "warning"


# --- X-Robots-Tag (Step 6) ---

def test_x_robots_tag_rule():
    rule = XRobotsTagRule()
    # Unknown when headers not collected
    ctx_no_hdr = make_context()
    setattr(ctx_no_hdr.page, "headers_json", None)
    ctx_no_hdr.response_headers = None
    assert rule.evaluate(ctx_no_hdr).status == "unknown"

    # Pass when no header present
    ctx_clean = make_context(headers_json={"content-type": "text/html"})
    assert rule.evaluate(ctx_clean).status == "pass"

    # Warning when noindex
    ctx_noindex = make_context(headers_json={"x-robots-tag": "noindex, nofollow"})
    assert rule.evaluate(ctx_noindex).status == "warning"


# --- Robots.txt (Step 7) ---

def test_robots_fetch_status_rule():
    rule = RobotsFetchStatusRule()
    assert rule.evaluate(make_context(robots_txt_status="found")).status == "pass"
    assert rule.evaluate(make_context(robots_txt_status="not_found")).status == "pass"
    assert rule.evaluate(make_context(robots_txt_status="forbidden")).status == "warning"
    assert rule.evaluate(make_context(robots_txt_status=None)).status == "unknown"


def test_robots_disallow_rule():
    rule = RobotsDisallowRule()
    assert rule.evaluate(make_context(fetch_status="success")).status == "pass"
    assert rule.evaluate(make_context(fetch_status="robots_blocked")).status == "warning"


def test_robots_sitemap_declaration_rule():
    rule = RobotsSitemapDeclarationRule()
    assert rule.evaluate(make_context(robots_txt_content="User-agent: *\nDisallow: /admin\nSitemap: https://example.com/sitemap.xml")).status == "pass"
    assert rule.evaluate(make_context(robots_txt_content="User-agent: *\nDisallow: /admin")).status == "warning"


# --- XML Sitemaps (Step 8) ---

def test_sitemap_availability_and_parse_rules():
    sm_valid = CrawlSitemap(id=uuid.uuid4(), audit_id=uuid.uuid4(), sitemap_url="https://example.com/sitemap.xml", status="valid")
    sm_error = CrawlSitemap(id=uuid.uuid4(), audit_id=uuid.uuid4(), sitemap_url="https://example.com/sitemap_bad.xml", status="parse_error", error_message="Malformed XML")

    ctx_ok = make_context(sitemaps=[sm_valid])
    assert SitemapAvailabilityRule().evaluate(ctx_ok).status == "pass"
    assert SitemapParseErrorRule().evaluate(ctx_ok).status == "pass"

    ctx_err = make_context(sitemaps=[sm_error])
    assert SitemapParseErrorRule().evaluate(ctx_err).status == "fail"


def test_sitemap_url_conflicts():
    url = "https://example.com/landing"
    ctx_in_sm = make_context(url=url, sitemap_urls={url}, http_status=200)
    assert SitemapUrlStatusRule().evaluate(ctx_in_sm).status == "pass"

    # Listed in sitemap but 404
    ctx_404_sm = make_context(url=url, sitemap_urls={url}, http_status=404)
    assert SitemapUrlStatusRule().evaluate(ctx_404_sm).status == "fail"

    # Listed in sitemap but noindex
    ctx_noindex_sm = make_context(url=url, sitemap_urls={url}, meta_robots="noindex")
    assert SitemapNoindexConflictRule().evaluate(ctx_noindex_sm).status == "fail"

    # Listed in sitemap with non-self canonical
    ctx_can_sm = make_context(url=url, sitemap_urls={url}, canonical_url="https://example.com/authoritative")
    assert SitemapCanonicalConflictRule().evaluate(ctx_can_sm).status == "warning"


# --- Redirects (Step 9) ---

def test_redirect_rules():
    ctx_direct = make_context(redirect_chain=[])
    assert RedirectChainRule().evaluate(ctx_direct).status == "pass"
    assert RedirectLoopRule().evaluate(ctx_direct).status == "pass"

    # Chain (>1 hop)
    chain = [{"url": "https://example.com/a"}, {"url": "https://example.com/b"}]
    ctx_chain = make_context(redirect_chain=chain)
    assert RedirectChainRule().evaluate(ctx_chain).status == "warning"

    # Loop
    loop_chain = [{"url": "https://example.com/a"}, {"url": "https://example.com/b"}, {"url": "https://example.com/a"}]
    ctx_loop = make_context(redirect_chain=loop_chain)
    assert RedirectLoopRule().evaluate(ctx_loop).status == "fail"


# --- Canonical Cross-Signal (Step 10) ---

def test_canonical_cross_signal_rules():
    target_404 = CrawlPage(id=uuid.uuid4(), audit_id=uuid.uuid4(), requested_url="https://example.com/missing", final_url="https://example.com/missing", http_status=404, fetch_status="http_error")
    target_noindex = CrawlPage(id=uuid.uuid4(), audit_id=uuid.uuid4(), requested_url="https://example.com/noindex", final_url="https://example.com/noindex", http_status=200, fetch_status="success", meta_robots="noindex")

    url_to_page = {
        "https://example.com/missing": target_404,
        "https://example.com/noindex": target_noindex,
    }

    # Points to 404
    ctx_to_404 = make_context(canonical_url="https://example.com/missing", url_to_page=url_to_page)
    assert CanonicalTargetStatusRule().evaluate(ctx_to_404).status == "fail"

    # Points to unvisited
    ctx_unvisited = make_context(canonical_url="https://example.com/unvisited", url_to_page={})
    assert CanonicalTargetStatusRule().evaluate(ctx_unvisited).status == "unknown"

    # Points to noindexed target
    ctx_to_noindex = make_context(canonical_url="https://example.com/noindex", url_to_page=url_to_page)
    assert CanonicalConflictRule().evaluate(ctx_to_noindex).status == "fail"

    # Multiple canonical tags
    ctx_multiple = make_context(canonical_tag_count=2)
    assert CanonicalMultipleRule().evaluate(ctx_multiple).status == "fail"


# --- HTTPS & Security (Step 11) ---

def test_https_rules():
    ctx_https = make_context(url="https://example.com/page")
    assert HttpsUsageRule().evaluate(ctx_https).status == "pass"
    assert HttpsDowngradeRule().evaluate(ctx_https).status == "pass"

    ctx_http = make_context(url="http://example.com/page")
    assert HttpsUsageRule().evaluate(ctx_http).status == "warning"

    # Downgrade redirect
    chain_down = [{"url": "https://example.com/in"}, {"url": "http://example.com/out"}]
    ctx_down = make_context(url="http://example.com/out", requested_url="https://example.com/in", redirect_chain=chain_down)
    assert HttpsDowngradeRule().evaluate(ctx_down).status == "fail"
