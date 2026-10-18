"""Comprehensive unit tests for technology classifiers and detector coordinator (CP2)."""

import pytest
from app.technology.classifiers import BackendClassifier, CMSClassifier, FrontendClassifier
from app.technology.detector import TechnologyDetector
from app.technology.extractors import HTMLTechnologyExtractor
from app.technology.models import (
    ConfidenceLevel,
    DetectionStatus,
    TechnologyCategory,
)


def test_wordpress_multiple_strong_signals():
    """Verify WordPress with meta generator, assets, and headers is detected with high confidence."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="WordPress 6.4.2" />
        <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css?ver=6.4.2" />
        <script src="/wp-includes/js/wp-emoji-release.min.js?ver=6.4.2"></script>
    </head>
    <body class="wp-embed-responsive home blog">
        <h1>WordPress Site</h1>
    </body>
    </html>
    """
    headers = {"X-Generator": "WordPress 6.4.2", "Server": "nginx"}
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, headers, page_url="https://example.com/")

    wp = next((f for f in findings if f.technology_id == "wordpress"), None)
    assert wp is not None
    assert wp.status == DetectionStatus.detected.value
    assert wp.confidence_level == ConfidenceLevel.high.value
    assert wp.confidence >= 0.85
    assert wp.version_or_null == "6.4.2"
    assert wp.technology_category == TechnologyCategory.cms.value

    # Check PHP is implied by WordPress
    php = next((f for f in findings if f.technology_id == "php"), None)
    assert php is not None
    assert php.status == DetectionStatus.detected.value
    assert php.confidence >= 0.80


def test_wordpress_one_weak_signal():
    """Verify single weak signal results in low confidence / not false detected."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>Some Page</title></head>
    <body class="wp-custom-background">
        <p>A personal blog.</p>
    </body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, {}, page_url="https://example.com/")

    wp = next((f for f in findings if f.technology_id == "wordpress"), None)
    assert wp is not None
    # Single body class is moderate/weak: should be 'possible', confidence <= 0.65
    assert wp.status == DetectionStatus.possible.value
    assert wp.confidence_level in (ConfidenceLevel.medium.value, ConfidenceLevel.low.value)
    assert wp.version_or_null is None


def test_shopify_detection():
    """Verify Shopify storefront detection."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="Shopify" />
        <script src="https://cdn.shopify.com/s/files/1/0000/shopify.js"></script>
        <script>window.Shopify = { shop: "demo.myshopify.com" };</script>
    </head>
    <body><h1>Shop</h1></body>
    </html>
    """
    headers = {"X-Shopify-Stage": "production", "Set-Cookie": "_shopify_s=12345; path=/"}
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, headers, page_url="https://shop.example.com/")

    shopify = next((f for f in findings if f.technology_id == "shopify"), None)
    assert shopify is not None
    assert shopify.status == DetectionStatus.detected.value
    assert shopify.confidence >= 0.85


def test_wix_detection():
    """Verify Wix platform detection."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="Wix.com Website Builder" />
        <script src="https://static.parastorage.com/services/wix-thunderbolt/app/main.js"></script>
    </head>
    <body><h1>Wix Site</h1></body>
    </html>
    """
    headers = {"X-Wix-Request-Id": "abc-123"}
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, headers, page_url="https://wixsite.example.com/")

    wix = next((f for f in findings if f.technology_id == "wix"), None)
    assert wix is not None
    assert wix.status == DetectionStatus.detected.value


def test_webflow_detection():
    """Verify Webflow visual builder detection."""
    html = """
    <!DOCTYPE html>
    <html data-wf-page="64a1b2c3" data-wf-site="64a1b2c0">
    <head>
        <meta name="generator" content="Webflow" />
        <script src="https://assets.website-files.com/64a1/js/webflow.js"></script>
    </head>
    <body><h1>Webflow Studio</h1></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, {}, page_url="https://agency.example.com/")

    wf = next((f for f in findings if f.technology_id == "webflow"), None)
    assert wf is not None
    assert wf.status == DetectionStatus.detected.value


def test_squarespace_detection():
    """Verify Squarespace detection."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="Squarespace" />
        <script src="//assets.squarespace.com/universal/scripts-compressed/common.js"></script>
    </head>
    <body class="sqs-layout"><h1>Squarespace Portfolio</h1></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, {}, page_url="https://sqs.example.com/")

    sqs = next((f for f in findings if f.technology_id == "squarespace"), None)
    assert sqs is not None
    assert sqs.status == DetectionStatus.detected.value


def test_nextjs_and_react_coexistence():
    """Verify Next.js detection correctly identifies Next.js and implies React."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>
        <script src="/_next/static/chunks/main.js"></script>
        <link rel="stylesheet" href="/_next/static/css/app.css" />
    </head>
    <body>
        <div id="__next">
            <div data-reactroot=""><h1>Next.js + React App</h1></div>
        </div>
    </body>
    </html>
    """
    headers = {"X-Powered-By": "Next.js"}
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, headers, page_url="https://app.example.com/")

    nextjs = next((f for f in findings if f.technology_id == "nextjs"), None)
    react = next((f for f in findings if f.technology_id == "react"), None)

    assert nextjs is not None
    assert nextjs.status == DetectionStatus.detected.value
    assert nextjs.confidence >= 0.85

    assert react is not None
    assert react.status == DetectionStatus.detected.value
    assert react.confidence >= 0.80


def test_nuxt_and_vue_coexistence():
    """Verify Nuxt.js detection identifies Nuxt and implies Vue."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <script id="__NUXT_DATA__" type="application/json">[1,2,3]</script>
        <script src="/_nuxt/entry.js"></script>
    </head>
    <body>
        <div id="__nuxt">
            <div data-v-4f2a1b="">Nuxt + Vue App</div>
        </div>
    </body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, {}, page_url="https://vue-app.example.com/")

    nuxt = next((f for f in findings if f.technology_id == "nuxt"), None)
    vue = next((f for f in findings if f.technology_id == "vue"), None)

    assert nuxt is not None
    assert nuxt.status == DetectionStatus.detected.value
    assert vue is not None
    assert vue.status == DetectionStatus.detected.value


def test_angular_detection_with_version():
    """Verify Angular detection extracts version from ng-version."""
    html = """
    <!DOCTYPE html>
    <html>
    <head></head>
    <body>
        <app-root ng-version="17.1.2">
            <h1>Angular Enterprise App</h1>
        </app-root>
    </body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, {}, page_url="https://ng.example.com/")

    angular = next((f for f in findings if f.technology_id == "angular"), None)
    assert angular is not None
    assert angular.status == DetectionStatus.detected.value
    assert angular.version_or_null == "17.1.2"


def test_php_header_and_cookie_evidence():
    """Verify PHP runtime is detected from X-Powered-By, Server, or session cookie."""
    headers = {
        "X-Powered-By": "PHP/8.2.14",
        "Set-Cookie": "PHPSESSID=test_session_id; path=/",
    }
    detector = TechnologyDetector()
    findings = detector.detect_page(HTMLTechnologyExtractor.extract(""), headers, page_url="https://php.example.com/index.php")

    php = next((f for f in findings if f.technology_id == "php"), None)
    assert php is not None
    assert php.status == DetectionStatus.detected.value
    assert php.version_or_null == "8.2.14"


def test_nodejs_express_and_ambiguous_evidence():
    """Verify Node.js with strong vs ambiguous evidence."""
    detector = TechnologyDetector()

    # 1. Strong evidence (X-Powered-By: Express + connect.sid)
    strong_headers = {
        "X-Powered-By": "Express",
        "Set-Cookie": "connect.sid=s%3A12345; Path=/",
    }
    strong_findings = detector.detect_page(HTMLTechnologyExtractor.extract(""), strong_headers)
    node_strong = next((f for f in strong_findings if f.technology_id == "nodejs"), None)
    assert node_strong is not None
    assert node_strong.status == DetectionStatus.detected.value
    assert node_strong.confidence >= 0.85

    # 2. Ambiguous evidence (Only Server header mentions node)
    ambiguous_headers = {"Server": "NodeJS/18.0.0"}
    ambig_findings = detector.detect_page(HTMLTechnologyExtractor.extract(""), ambiguous_headers)
    node_ambig = next((f for f in ambig_findings if f.technology_id == "nodejs"), None)
    assert node_ambig is not None
    assert node_ambig.status == DetectionStatus.possible.value
    assert node_ambig.confidence < 0.70


def test_laravel_detection():
    """Verify Laravel detection from header and session cookie, implying PHP."""
    headers = {
        "X-Powered-By": "Laravel",
        "Set-Cookie": "laravel_session=eyJpdiI6...; path=/",
    }
    detector = TechnologyDetector()
    findings = detector.detect_page(HTMLTechnologyExtractor.extract(""), headers, page_url="https://laravel.example.com/")

    laravel = next((f for f in findings if f.technology_id == "laravel"), None)
    php = next((f for f in findings if f.technology_id == "php"), None)

    assert laravel is not None
    assert laravel.status == DetectionStatus.detected.value
    assert php is not None
    assert php.status == DetectionStatus.detected.value


def test_django_detection():
    """Verify Django detection from CSRF and language cookies."""
    headers = {
        "Set-Cookie": "csrftoken=xyz789; django_language=en; Path=/",
    }
    detector = TechnologyDetector()
    findings = detector.detect_page(HTMLTechnologyExtractor.extract(""), headers, page_url="https://django.example.com/")

    django = next((f for f in findings if f.technology_id == "django"), None)
    assert django is not None
    assert django.status == DetectionStatus.detected.value
    assert django.technology_category == TechnologyCategory.backend.value


def test_unknown_custom_website_resistance():
    """Verify standard bespoke HTML with no signatures produces zero detections."""
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8" />
        <title>Plain Custom HTML Site</title>
        <link rel="stylesheet" href="/assets/css/style.css" />
        <script src="/assets/js/main.js"></script>
    </head>
    <body>
        <h1>Welcome to our custom site</h1>
        <p>Built with plain HTML, CSS, and JS.</p>
    </body>
    </html>
    """
    headers = {"Server": "cloudflare", "Content-Type": "text/html"}
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, headers, page_url="https://plain.example.com/")

    # Bespoke HTML site with no platform signatures produces zero CMS, frontend framework, or backend runtime detections
    cms_and_frameworks = [
        f for f in findings
        if f.technology_category in (TechnologyCategory.cms.value, TechnologyCategory.frontend.value, TechnologyCategory.backend.value)
    ]
    assert len(cms_and_frameworks) == 0
    summary = detector.summarize(findings)
    assert summary.primary_cms is None
    assert summary.frontend_frameworks == []
    assert summary.backend_runtimes == []


def test_misleading_technology_keywords():
    """Verify blog text mentioning technologies does not trigger false positive detections."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>Comparison Blog Post</title></head>
    <body>
        <h1>Why WordPress vs Shopify is a great debate</h1>
        <p>We migrated from Webflow and Wix to custom Next.js and React on Node.js and Django.</p>
        <p>Also Laravel and PHP are great for some projects.</p>
    </body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, {}, page_url="https://blog.example.com/tech-stack-comparison")

    # Body paragraphs must NEVER trigger detections
    assert len(findings) == 0


def test_multi_page_aggregation_and_corroboration():
    """Verify aggregation across pages deduplicates and boosts corroborated confidence."""
    detector = TechnologyDetector()

    page1_html = """
    <!DOCTYPE html>
    <html>
    <head><link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css?ver=6.4.2" /></head>
    <body>Page 1</body>
    </html>
    """
    page2_html = """
    <!DOCTYPE html>
    <html>
    <head><script src="/wp-includes/js/wp-embed.min.js?ver=6.4.2"></script></head>
    <body>Page 2</body>
    </html>
    """
    ev1 = HTMLTechnologyExtractor.extract(page1_html)
    ev2 = HTMLTechnologyExtractor.extract(page2_html)

    p1_findings = detector.detect_page(ev1, {}, "https://example.com/")
    p2_findings = detector.detect_page(ev2, {}, "https://example.com/about")

    aggregated = detector.aggregate_findings([p1_findings, p2_findings])
    wp = next((f for f in aggregated if f.technology_id == "wordpress"), None)

    assert wp is not None
    assert wp.page_count == 2
    assert "https://example.com/" in wp.affected_urls
    assert "https://example.com/about" in wp.affected_urls
    assert wp.status == DetectionStatus.detected.value

    # Verify summary
    summary = detector.summarize(aggregated)
    assert summary.primary_cms == "WordPress"
    assert summary.total_detected >= 1


def test_framer_multiple_strong_signals():
    """Verify Framer with meta generator, server header, structural DOM, and scripts is detected with high confidence."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="Framer 7788242" />
        <script src="https://events.framer.com/script?v=2"></script>
        <script src="https://framerusercontent.com/sites/5fO5hB3jMuqzCsiRWNoNXy/script_main.0FIUGeB-.mjs"></script>
    </head>
    <body>
        <div data-framer-name="Desktop Hero" data-framer-hydrate-v2="hydrated">
            <h1>SendRoq Modern Courier</h1>
            <img src="https://framerusercontent.com/images/logo.png" alt="SendRoq" />
        </div>
    </body>
    </html>
    """
    headers = {"server": "Framer/24ab00f", "content-type": "text/html"}
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, headers, page_url="https://www.sendroq.com/")

    framer = next((f for f in findings if f.technology_id == "framer"), None)
    assert framer is not None
    assert framer.status == DetectionStatus.detected.value
    assert framer.confidence_level == ConfidenceLevel.high.value
    assert framer.confidence >= 0.85
    assert framer.version_or_null in ("7788242", "24ab00f")
    assert framer.technology_category == TechnologyCategory.cms.value

    summary = detector.summarize(findings)
    assert summary.primary_cms == "Framer"
    assert summary.total_detected >= 1


def test_framer_single_weak_asset_false_positive_prevention():
    """Verify a non-Framer website embedding an isolated Framer image does NOT trigger Framer detection."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Independent Blog</title>
    </head>
    <body>
        <h1>My Personal Blog</h1>
        <p>Check out this graphic designed in Framer:</p>
        <img src="https://framerusercontent.com/images/embedded-illustration.png" alt="Illustration" />
    </body>
    </html>
    """
    headers = {"server": "Apache/2.4.41 (Ubuntu)"}
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, headers, page_url="https://independent-blog.com/post-1")

    framer = next((f for f in findings if f.technology_id == "framer"), None)
    # Must NOT report Framer as detected or possible CMS
    assert framer is None or framer.status == DetectionStatus.unknown.value

    summary = detector.summarize(findings)
    assert summary.primary_cms != "Framer"


def test_framer_two_weak_assets_lower_confidence():
    """Verify multiple weaker Framer assets without strong corroboration yield lower confidence / possible status."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" href="https://framercdn.com/styles/theme.css" />
    </head>
    <body>
        <img src="https://framerusercontent.com/images/asset1.webp" />
    </body>
    </html>
    """
    headers = {"server": "cloudflare"}
    evidence = HTMLTechnologyExtractor.extract(html)
    detector = TechnologyDetector()
    findings = detector.detect_page(evidence, headers, page_url="https://example.com/")

    framer = next((f for f in findings if f.technology_id == "framer"), None)
    assert framer is not None
    assert framer.status == DetectionStatus.possible.value
    assert framer.confidence_level == ConfidenceLevel.low.value
    assert framer.confidence < 0.65


def test_framer_exact_host_matching_prevents_subdomain_spoofing():
    """Verify exact host matching rejects attacker domains mimicking Framer hostnames."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <script src="https://evil-framerusercontent.com/payload.js"></script>
        <script src="https://framerstatic.com.attacker.net/script.js"></script>
        <link rel="stylesheet" href="https://notframerusercontent.com/style.css" />
    </head>
    <body>
        <img src="https://spoofed-framercdn.com/image.png" />
    </body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    classifier = CMSClassifier()
    finding = classifier._detect_framer(evidence, {}, "https://spoofed-test.com/")
    assert finding is None


def test_existing_cms_detection_unchanged():
    """Verify existing WordPress, Shopify, Wix, Webflow, Squarespace classifiers remain unchanged."""
    classifier = CMSClassifier()

    # Webflow test
    wf_html = "<html data-wf-page='123' data-wf-site='456'><head><meta name='generator' content='Webflow' /></head></html>"
    wf_ev = HTMLTechnologyExtractor.extract(wf_html)
    wf_findings = classifier.classify(wf_ev, {}, "https://webflow-site.com/")
    wf = next((f for f in wf_findings if f.technology_id == "webflow"), None)
    assert wf is not None
    assert wf.status == DetectionStatus.detected.value

    # Squarespace test
    sqs_html = "<html><head><meta name='generator' content='Squarespace' /><script src='https://assets.squarespace.com/universal/scripts/common.js'></script></head></html>"
    sqs_ev = HTMLTechnologyExtractor.extract(sqs_html)
    sqs_findings = classifier.classify(sqs_ev, {}, "https://squarespace-site.com/")
    sqs = next((f for f in sqs_findings if f.technology_id == "squarespace"), None)
    assert sqs is not None
    assert sqs.status == DetectionStatus.detected.value

