"""Comprehensive CP2 test suite for CMS, languages, and frontend frameworks.

Verifies:
- All 37 traditional and headless CMS platforms.
- Client-side vs server-side language distinction and truthfulness.
- Frontend frameworks, UI libraries, and dependency inference.
- Rejection of hidden server languages and false inferences.
"""

import pytest
from app.technology.detector import TechnologyDetector
from app.technology.extractors.html_extractor import HTMLTechnologyExtractor, RawPageEvidence
from app.technology.fingerprints.catalog import TechnologyCatalog
from app.technology.fingerprints.engine import UniversalFingerprintEngine
from app.technology.models import (
    ConfidenceLevel,
    DetectionStatus,
    EvidenceProvenance,
    TechnologyCategory,
)


@pytest.fixture
def detector():
    return TechnologyDetector()


@pytest.fixture
def engine():
    return UniversalFingerprintEngine()


# =========================================================================
# 1. CMS & WEBSITE BUILDERS (TRADITIONAL & HEADLESS)
# =========================================================================

@pytest.mark.parametrize(
    "tech_id,tech_name,html_snippet,headers",
    [
        ("drupal", "Drupal", '<meta name="generator" content="Drupal 10 (https://www.drupal.org)" />', {"x-generator": "Drupal 10"}),
        ("joomla", "Joomla", '<meta name="generator" content="Joomla! - Open Source Content Management" />', {}),
        ("ghost", "Ghost", '<meta name="generator" content="Ghost 5.82" />', {"x-ghost-cache-status": "hit"}),
        ("magento", "Magento", '<script src="/static/version123/frontend/Magento/luma/en_US/requirejs/require.js"></script>', {}),
        ("woocommerce", "WooCommerce", '<body class="woocommerce woocommerce-page"></body>', {}),
        ("bigcommerce", "BigCommerce", '<script src="https://cdn11.bigcommerce.com/r-1234/stencil.js"></script>', {}),
        ("prestashop", "PrestaShop", '<meta name="generator" content="PrestaShop" />', {}),
        ("opencart", "OpenCart", '<link rel="stylesheet" href="catalog/view/javascript/bootstrap/css/bootstrap.min.css" />', {"set-cookie": "OCSESSID=12345; path=/"}),
        ("typo3", "TYPO3", '<meta name="generator" content="TYPO3 CMS" />', {}),
        ("hubspot_cms", "HubSpot CMS", '<script src="https://static.hsappstatic.net/cms/bundle.js"></script>', {}),
        ("duda", "Duda", '<meta name="generator" content="Duda" />', {}),
        ("tilda", "Tilda", '<script src="https://static.tildacdn.com/js/tilda-scripts-3.0.min.js"></script>', {}),
        ("carrd", "Carrd", '<script src="/assets/carrd.min.js"></script>', {}),
        ("bubble", "Bubble", '<script src="https://d1muf25xaso8hp.cloudfront.net/bubble.js"></script>', {}),
        ("weebly", "Weebly", '<meta name="generator" content="Weebly" />', {}),
        ("salesforce_commerce_cloud", "Salesforce Commerce Cloud", '<script src="/on/demandware.static/Sites-Site/client.js"></script>', {}),
        ("sitecore", "Sitecore", '<link rel="stylesheet" href="/sitecore/styles.css" />', {"set-cookie": "SC_ANALYTICS_GLOBAL_COOKIE=123"}),
        ("kentico", "Kentico", '<meta name="generator" content="Kentico CMS" />', {}),
        ("craft_cms", "Craft CMS", '<meta name="generator" content="Craft CMS" />', {"set-cookie": "CRAFT_CSRF_TOKEN=123"}),
        ("umbraco", "Umbraco", '<meta name="generator" content="Umbraco" />', {"set-cookie": "UMB_UCONTEXT=123"}),
        ("october_cms", "October CMS", '<meta name="generator" content="October CMS" />', {}),
        # Headless CMS platforms
        ("contentful", "Contentful", '<script src="https://images.ctfassets.net/space/asset.jpg"></script>', {}),
        ("strapi", "Strapi", '<script src="/uploads/strapi_media.png"></script>', {"x-powered-by": "Strapi"}),
        ("sanity", "Sanity", '<script src="https://cdn.sanity.io/images/project/dataset/image.png"></script>', {}),
        ("prismic", "Prismic", '<script src="https://static.cdn.prismic.io/prismic.js?new=true"></script>', {}),
        ("storyblok", "Storyblok", '<script src="https://a.storyblok.com/f/1234/bundle.js"></script>', {}),
        ("directus", "Directus", '<script src="/server/directus-client.js"></script>', {"x-powered-by": "Directus"}),
        ("payload_cms", "Payload CMS", '<script src="/payload-client.js"></script>', {"x-payload-version": "2.0.0"}),
        ("hygraph", "Hygraph", '<script src="https://media.graphassets.com/bundle.js"></script>', {}),
        ("datocms", "DatoCMS", '<script src="https://www.datocms-assets.com/123/bundle.js"></script>', {}),
    ],
)
def test_cms_catalog_detection(engine, tech_id, tech_name, html_snippet, headers):
    """Verify each traditional and headless CMS triggers deterministic detection when evidence exists."""
    evidence = HTMLTechnologyExtractor.extract(html_snippet)
    findings = engine.match_page(evidence, headers, page_url="https://example.com/")

    finding = next((f for f in findings if f.technology_id == tech_id), None)
    assert finding is not None, f"Expected {tech_name} ({tech_id}) to be detected from public evidence"
    assert finding.status in (DetectionStatus.detected.value, DetectionStatus.possible.value)
    assert finding.technology_category == TechnologyCategory.cms.value


def test_headless_cms_not_inferred_without_signals(engine):
    """Verify headless CMS is NEVER inferred without direct public signals."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>Modern Blog</title></head>
    <body><h1>Articles</h1><p>Welcome to our modern decoupled blog.</p></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    findings = engine.match_page(evidence, {}, page_url="https://example.com/")

    headless_ids = {"contentful", "strapi", "sanity", "prismic", "storyblok", "directus", "payload_cms", "hygraph", "datocms"}
    detected_ids = {f.technology_id for f in findings}
    assert headless_ids.isdisjoint(detected_ids), "Headless CMS must not be guessed without evidence"


# =========================================================================
# 2. PROGRAMMING LANGUAGES (CLIENT-SIDE VS SERVER-SIDE TRUTHFULNESS)
# =========================================================================

def test_javascript_and_css_detected_from_assets(engine):
    """Verify CSS and JavaScript are recognized from asset references."""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="stylesheet" href="/styles/main.css" />
        <script src="/scripts/app.js"></script>
    </head>
    <body><h1>Hello</h1></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    findings = engine.match_page(evidence, {}, page_url="https://example.com/")

    detected = {f.technology_id: f for f in findings}
    assert "css" in detected
    assert "javascript" in detected


def test_javascript_does_not_imply_nodejs_backend(engine):
    """Verify frontend JS does not manufacture a Node.js backend finding."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><script src="/scripts/bundle.js"></script></head>
    <body><h1>App</h1></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    findings = engine.match_page(evidence, {}, page_url="https://example.com/")

    detected_ids = {f.technology_id for f in findings}
    assert "nodejs" not in detected_ids, "Client-side JS does NOT prove backend Node.js"


def test_compiled_js_does_not_imply_typescript(engine):
    """Verify compiled JS does not manufacture a TypeScript finding without source maps."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><script src="/static/app.min.js"></script></head>
    <body><h1>Clean JS</h1></body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    findings = engine.match_page(evidence, {}, page_url="https://example.com/")

    detected_ids = {f.technology_id for f in findings}
    assert "typescript" not in detected_ids, "Compiled JS does NOT prove TypeScript in source"


@pytest.mark.parametrize(
    "lang_id,lang_name,headers",
    [
        ("python", "Python", {"server": "gunicorn", "x-powered-by": "FastAPI"}),
        ("ruby", "Ruby", {"x-powered-by": "Phusion Passenger", "server": "Puma"}),
        ("java", "Java", {"server": "Apache-Coyote/1.1", "x-powered-by": "Servlet/3.1"}),
        ("kotlin", "Kotlin", {"server": "Ktor/2.3.0"}),
        ("go", "Go", {"server": "gin"}),
        ("rust", "Rust", {"server": "actix"}),
        ("elixir", "Elixir", {"server": "cowboy", "x-powered-by": "phoenix"}),
        ("erlang", "Erlang", {"server": "Yaws/2.1"}),
        ("perl", "Perl", {"server": "mod_perl/2.0.12"}),
        ("scala", "Scala", {"server": "akka-http/10.2.9"}),
        ("csharp", "C#", {"x-powered-by": "ASP.NET"}),
    ],
)
def test_server_language_detection_requires_public_evidence(engine, lang_id, lang_name, headers):
    """Verify backend languages are detected only when credible public disclosures exist."""
    evidence = RawPageEvidence()
    findings = engine.match_page(evidence, headers, page_url="https://example.com/")

    finding = next((f for f in findings if f.technology_id == lang_id), None)
    assert finding is not None, f"Expected {lang_name} to be detected from explicit header disclosure"
    assert finding.technology_category == TechnologyCategory.language.value


def test_hidden_server_language_remains_unknown(engine):
    """Verify backend language with zero observable signals remains completely unobserved."""
    html = "<html><body><h1>Hidden Server</h1></body></html>"
    evidence = HTMLTechnologyExtractor.extract(html)
    findings = engine.match_page(evidence, {"server": "nginx"}, page_url="https://example.com/")

    server_langs = {"python", "ruby", "java", "kotlin", "go", "rust", "elixir", "erlang", "perl", "scala", "csharp"}
    detected_ids = {f.technology_id for f in findings}
    assert server_langs.isdisjoint(detected_ids), "Zero-signal backend languages must remain UNKNOWN"


# =========================================================================
# 3. FRONTEND FRAMEWORKS & LIBRARIES
# =========================================================================

@pytest.mark.parametrize(
    "tech_id,tech_name,html_snippet,headers",
    [
        ("svelte", "Svelte", '<script src="/bundle.svelte.js"></script>', {}),
        ("astro", "Astro", '<meta name="generator" content="Astro v4.0.0" />', {}),
        ("gatsby", "Gatsby", '<meta name="generator" content="Gatsby 5.12.0" />', {}),
        ("remix", "Remix", '<script>window.__remixContext = {};</script>', {}),
        ("qwik", "Qwik", '<div q:container="paused" q:version="1.4.0"><h1>Qwik</h1></div>', {}),
        ("solidjs", "SolidJS", '<div data-hk="0-0-1">Solid UI</div>', {}),
        ("preact", "Preact", '<script src="https://cdn.jsdelivr.net/npm/preact/dist/preact.min.js"></script>', {}),
        ("jquery", "jQuery", '<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>', {}),
        ("alpinejs", "Alpine.js", '<div x-data="{ open: false }"><button x-show="open">Toggle</button></div>', {}),
        ("htmx", "HTMX", '<button hx-get="/clicked" hx-swap="outerHTML">Click</button>', {}),
        ("tailwind", "Tailwind CSS", '<link rel="stylesheet" href="/css/tailwind.min.css" />', {}),
        ("bootstrap", "Bootstrap", '<link rel="stylesheet" href="/css/bootstrap.min.css" />', {}),
        ("bulma", "Bulma", '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css" />', {}),
        ("foundation", "Foundation", '<link rel="stylesheet" href="/foundation.min.css" />', {}),
        ("material_ui", "Material UI", '<button class="MuiButton-root MuiButton-contained">MUI</button>', {}),
        ("chakra_ui", "Chakra UI", '<button class="chakra-button css-12345">Chakra</button>', {}),
        ("ant_design", "Ant Design", '<button class="ant-btn ant-btn-primary">Antd</button>', {}),
        ("gsap", "GSAP", '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>', {}),
        ("threejs", "Three.js", '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>', {}),
        ("d3", "D3.js", '<script src="https://d3js.org/d3.v7.min.js"></script>', {}),
        ("swiper", "Swiper", '<div class="swiper-container"><div class="swiper-wrapper"><div class="swiper-slide">Slide 1</div></div></div>', {}),
        ("lodash", "Lodash", '<script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>', {}),
    ],
)
def test_frontend_framework_catalog_detection(engine, tech_id, tech_name, html_snippet, headers):
    """Verify each frontend framework/library is detected from its technical fingerprint."""
    evidence = HTMLTechnologyExtractor.extract(html_snippet)
    findings = engine.match_page(evidence, headers, page_url="https://example.com/")

    finding = next((f for f in findings if f.technology_id == tech_id), None)
    assert finding is not None, f"Expected {tech_name} ({tech_id}) to be detected"
    assert finding.technology_category == TechnologyCategory.frontend.value


def test_dependency_inference_provenance_and_confidence(engine):
    """Verify implied dependencies have inferred status and inferred_dependency provenance."""
    # Remix implies React
    html = '<script>window.__remixContext = {};</script>'
    evidence = HTMLTechnologyExtractor.extract(html)
    findings = engine.match_page(evidence, {}, page_url="https://example.com/")

    remix = next((f for f in findings if f.technology_id == "remix"), None)
    assert remix is not None
    assert remix.status == DetectionStatus.detected.value

    react = next((f for f in findings if f.technology_id == "react"), None)
    assert react is not None
    assert react.status == DetectionStatus.inferred.value
    assert react.provenance == EvidenceProvenance.inferred_dependency.value
    assert react.confidence <= 0.65
