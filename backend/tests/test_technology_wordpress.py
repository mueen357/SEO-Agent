"""Unit tests for WordPress theme and plugin detection (CP3)."""

import pytest
from app.technology.extractors import HTMLTechnologyExtractor
from app.technology.models import ConfidenceLevel
from app.technology.wordpress import WordPressAssetDetector


def test_wordpress_active_theme_style_css():
    """Verify active theme detection via primary style.css link."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css?ver=1.0.0" />
        <script src="/wp-content/themes/twentytwentyfour/assets/js/theme.js?ver=1.0.0"></script>
    </head>
    <body><h1>WordPress Site</h1></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    themes = WordPressAssetDetector.detect_themes(evidence, page_url="https://example.com/")

    assert len(themes) == 1
    t = themes[0]
    assert t.slug == "twentytwentyfour"
    assert t.name == "Twenty Twenty-Four"
    assert t.version == "1.0.0"
    assert t.status == "active"
    assert t.confidence >= 0.85
    assert t.confidence_level == ConfidenceLevel.high.value


def test_wordpress_referenced_theme_only():
    """Verify theme without style.css or body class is marked as referenced, not active."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <script src="/wp-content/themes/custom-framework/js/helpers.js"></script>
    </head>
    <body><h1>Site</h1></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    themes = WordPressAssetDetector.detect_themes(evidence, page_url="https://example.com/")

    assert len(themes) == 1
    t = themes[0]
    assert t.slug == "custom-framework"
    assert t.name is None  # Custom theme not in known map: never invent a name!
    assert t.version is None
    assert t.status == "referenced"
    assert t.confidence < 0.85


def test_wordpress_theme_via_body_class():
    """Verify active theme detection via standard WordPress theme body class."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" href="/wp-content/themes/astra/assets/css/minified/main.min.css" />
    </head>
    <body class="theme-astra ast-header-break-point">
        <h1>Astra Theme Page</h1>
    </body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    themes = WordPressAssetDetector.detect_themes(evidence, page_url="https://example.com/")

    assert len(themes) == 1
    t = themes[0]
    assert t.slug == "astra"
    assert t.name == "Astra"
    assert t.status == "active"
    assert t.confidence >= 0.85


def test_wordpress_plugins_detection_with_version():
    """Verify plugin detection with verified version from query parameter."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" href="/wp-content/plugins/elementor/assets/css/frontend.min.css?ver=3.18.3" />
        <script src="/wp-content/plugins/contact-form-7/includes/js/index.js?ver=5.8.5"></script>
    </head>
    <body></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    plugins = WordPressAssetDetector.detect_plugins(evidence, page_url="https://example.com/")

    assert len(plugins) == 2
    elementor = next((p for p in plugins if p.slug == "elementor"), None)
    cf7 = next((p for p in plugins if p.slug == "contact-form-7"), None)

    assert elementor is not None
    assert elementor.name == "Elementor"
    assert elementor.version == "3.18.3"
    assert elementor.confidence >= 0.80

    assert cf7 is not None
    assert cf7.name == "Contact Form 7"
    assert cf7.version == "5.8.5"
    assert cf7.confidence >= 0.80


def test_wordpress_plugin_name_known_version_unknown():
    """Verify plugin with verified name but missing version returns version=None."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css" />
    </head>
    <body></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    plugins = WordPressAssetDetector.detect_plugins(evidence, page_url="https://example.com/")

    assert len(plugins) == 1
    woo = plugins[0]
    assert woo.slug == "woocommerce"
    assert woo.name == "WooCommerce"
    assert woo.version is None  # MUST be None, never guessed
    assert woo.confidence >= 0.70


def test_wordpress_unknown_plugin_name_and_version():
    """Verify uncatalogued plugin reports slug, name=None, and version if present."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <script src="/wp-content/plugins/my-internal-custom-tools/app.js?ver=2.1.0"></script>
    </head>
    <body></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    plugins = WordPressAssetDetector.detect_plugins(evidence, page_url="https://example.com/")

    assert len(plugins) == 1
    p = plugins[0]
    assert p.slug == "my-internal-custom-tools"
    assert p.name is None  # Never invent a name!
    assert p.version == "2.1.0"


def test_wordpress_plugin_via_html_comment():
    """Verify plugin detection through HTML optimization comments."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <!-- This site is optimized with the Yoast SEO plugin v21.8 - https://yoast.com/wordpress/plugins/seo/ -->
        <!-- Performance optimized by W3 Total Cache -->
    </head>
    <body></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    plugins = WordPressAssetDetector.detect_plugins(evidence, page_url="https://example.com/")

    yoast = next((p for p in plugins if p.slug == "wordpress-seo"), None)
    w3tc = next((p for p in plugins if p.slug == "w3-total-cache"), None)

    assert yoast is not None
    assert yoast.name == "Yoast SEO"
    assert yoast.version == "21.8"

    assert w3tc is not None
    assert w3tc.name == "W3 Total Cache"


def test_wordpress_theme_and_plugin_multi_page_aggregation():
    """Verify themes and plugins are deduplicated and aggregated across pages."""
    page1_html = """
    <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css?ver=1.0.0" />
    <link rel="stylesheet" href="/wp-content/plugins/elementor/assets/css/common.css?ver=3.18.0" />
    """
    page2_html = """
    <script src="/wp-content/themes/twentytwentyfour/assets/js/nav.js?ver=1.0.0"></script>
    <script src="/wp-content/plugins/elementor/assets/js/frontend.js?ver=3.18.0"></script>
    <script src="/wp-content/plugins/contact-form-7/includes/js/index.js?ver=5.8.5"></script>
    """
    ev1 = HTMLTechnologyExtractor.extract(page1_html)
    ev2 = HTMLTechnologyExtractor.extract(page2_html)

    t1 = WordPressAssetDetector.detect_themes(ev1)
    t2 = WordPressAssetDetector.detect_themes(ev2)
    p1 = WordPressAssetDetector.detect_plugins(ev1)
    p2 = WordPressAssetDetector.detect_plugins(ev2)

    agg_themes = WordPressAssetDetector.aggregate_themes([t1, t2])
    agg_plugins = WordPressAssetDetector.aggregate_plugins([p1, p2])

    assert len(agg_themes) == 1
    assert agg_themes[0].slug == "twentytwentyfour"
    assert agg_themes[0].status == "active"
    assert agg_themes[0].confidence >= 0.90

    assert len(agg_plugins) == 2
    slugs = {p.slug for p in agg_plugins}
    assert slugs == {"elementor", "contact-form-7"}


def test_false_positive_resistance():
    """Verify non-plugin/non-theme paths like wp-content/uploads do not create candidates."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <img src="/wp-content/uploads/2024/01/logo.png" />
        <link rel="stylesheet" href="/assets/plugins/generic-slider/style.css" />
        <link rel="stylesheet" href="/wp-admin/css/forms.css" />
    </head>
    <body></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    themes = WordPressAssetDetector.detect_themes(evidence)
    plugins = WordPressAssetDetector.detect_plugins(evidence)

    assert len(themes) == 0
    assert len(plugins) == 0
