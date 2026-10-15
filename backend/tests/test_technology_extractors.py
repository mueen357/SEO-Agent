"""Unit tests for passive technology extractors and registry (CP1)."""

import pytest
from app.technology.extractors import HeaderTechnologyExtractor, HTMLTechnologyExtractor
from app.technology.models import EvidenceType, TechnologyCategory
from app.technology.registry import TechnologyRegistry


def test_technology_registry_definitions():
    """Verify registry contains all required target technologies."""
    wordpress = TechnologyRegistry.get("wordpress")
    assert wordpress is not None
    assert wordpress.name == "WordPress"
    assert wordpress.category == TechnologyCategory.cms
    assert "php" in wordpress.implies

    nextjs = TechnologyRegistry.get("nextjs")
    assert nextjs is not None
    assert "react" in nextjs.implies

    nuxt = TechnologyRegistry.get("nuxt")
    assert nuxt is not None
    assert "vue" in nuxt.implies

    laravel = TechnologyRegistry.get("laravel")
    assert laravel is not None
    assert "php" in laravel.implies

    cms_list = TechnologyRegistry.get_by_category(TechnologyCategory.cms)
    cms_ids = {c.id for c in cms_list}
    assert {"wordpress", "shopify", "wix", "webflow", "squarespace"}.issubset(cms_ids)


def test_html_extractor_meta_generators():
    """Verify meta generator tags are parsed cleanly and bounded."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="WordPress 6.4.2" />
        <meta name="GENERATOR" content="WooCommerce 8.5.1" />
    </head>
    <body><h1>Hello</h1></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    assert len(evidence.meta_generators) == 2
    assert "WordPress 6.4.2" in evidence.meta_generators
    assert "WooCommerce 8.5.1" in evidence.meta_generators


def test_html_extractor_script_and_stylesheet_urls():
    """Verify script and stylesheet asset paths are extracted and bounded."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css?ver=1.0" />
        <link rel="stylesheet" href="/wp-content/plugins/elementor/assets/css/frontend.min.css" />
        <script src="/wp-content/plugins/contact-form-7/includes/js/index.js?ver=5.8.5"></script>
        <script src="/_next/static/chunks/main-app.js"></script>
    </head>
    <body></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    assert len(evidence.stylesheet_hrefs) == 2
    assert any("/wp-content/themes/twentytwentyfour/" in s for s in evidence.stylesheet_hrefs)
    assert any("/wp-content/plugins/elementor/" in s for s in evidence.stylesheet_hrefs)

    assert len(evidence.script_sources) == 2
    assert any("/wp-content/plugins/contact-form-7/" in s for s in evidence.script_sources)
    assert any("/_next/static/" in s for s in evidence.script_sources)


def test_html_extractor_dom_markers():
    """Verify DOM framework markers are detected."""
    html = """
    <!DOCTYPE html>
    <html data-wf-page="64a1b2c3d4" data-wf-site="64a1b2c3d0">
    <head></head>
    <body class="wp-custom-logo page-template-default">
        <div data-reactroot="">
            <span ng-version="16.2.0">Angular Component</span>
            <div data-v-3d2a1b>Vue Scoped Component</div>
        </div>
        <div id="__next">Next.js root</div>
    </body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    assert "data-reactroot" in evidence.dom_markers
    assert "ng-version:16.2.0" in evidence.dom_markers
    assert "vue:data-v" in evidence.dom_markers
    assert "id:__next" in evidence.dom_markers
    assert "webflow:data-wf" in evidence.dom_markers
    assert "wp-custom-logo" in evidence.body_classes


def test_html_extractor_inline_markers_and_comments():
    """Verify inline application markers and plugin comments."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <!-- This site is optimized with the Yoast SEO plugin v21.8 - https://yoast.com/wordpress/plugins/seo/ -->
        <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
        <script>
            window.Shopify = { shop: "demo.myshopify.com" };
            Shopify.theme = { name: "Dawn", id: 12345 };
        </script>
    </head>
    <body></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    assert any("script_id:__NEXT_DATA__" in m for m in evidence.inline_markers)
    assert any("shopify:Shopify.theme" in m for m in evidence.inline_markers)
    assert any("shopify:window.Shopify" in m for m in evidence.inline_markers)
    assert any("comment:wordpress:This site is optimized with the" in m for m in evidence.inline_markers)


def test_html_extractor_empty_and_malicious_input():
    """Verify robust defense against empty or malformed HTML."""
    empty_ev = HTMLTechnologyExtractor.extract("")
    assert empty_ev.meta_generators == []
    assert empty_ev.script_sources == []

    malicious = "<script>" + ("A" * 10000) + "</script><link rel='stylesheet' href='javascript:alert(1)'>"
    res = HTMLTechnologyExtractor.extract(malicious)
    assert isinstance(res.to_dict(), dict)


def test_header_extractor_security_and_signals():
    """Verify header extractor extracts technology signals without leaking secrets."""
    headers = {
        "Server": "nginx/1.24.0",
        "X-Powered-By": "PHP/8.2.14",
        "X-Generator": "WordPress 6.4",
        "X-Nextjs-Cache": "HIT",
        "Set-Cookie": "PHPSESSID=super_secret_session_token_12345; path=/; HttpOnly, secret_token=abc",
        "Authorization": "Bearer sensitive_token",
    }
    evidence = HeaderTechnologyExtractor.extract(headers, page_url="https://example.com")
    
    # Assert headers were extracted
    sources = {e.evidence_source for e in evidence}
    assert "header:x-powered-by" in sources
    assert "header:x-generator" in sources
    assert "header:server" in sources
    assert "header:x-nextjs-cache" in sources
    assert "header:set-cookie" in sources

    # Ensure sensitive cookie values or Authorization headers were NOT leaked
    for item in evidence:
        assert "super_secret_session_token_12345" not in item.evidence_summary
        assert "sensitive_token" not in item.evidence_summary
        assert "Authorization" not in item.evidence_source


def test_crawler_safe_cookie_name_capture():
    """Verify crawler safe cookie extraction extracts known names only and drops secret values."""
    import re
    raw_cookie = "laravel_session=eyJpdiI6Inh4eCIsInZhbHVlIjoieXl5In0%3D; expires=Thu, 15 Oct 2026; path=/; HttpOnly; api_token=SECRET123; connect.sid=s%3A12345678"
    cookie_names = [
        m.group(1).lower()
        for m in re.finditer(r"([a-zA-Z0-9_\-\.]+)\s*=", raw_cookie)
    ]
    safe_names = [c for c in set(cookie_names) if c in HeaderTechnologyExtractor.KNOWN_COOKIE_NAMES]
    
    assert "laravel_session" in safe_names
    assert "connect.sid" in safe_names
    assert "api_token" not in safe_names  # Untracked/sensitive cookie dropped

    sanitized_header = "; ".join(f"{c}=1" for c in sorted(safe_names))
    assert sanitized_header == "connect.sid=1; laravel_session=1"
    assert "SECRET123" not in sanitized_header
    assert "eyJpdiI" not in sanitized_header

