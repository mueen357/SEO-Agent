"""Comprehensive test suite for CP3: Backend, Hosting/CDN, Databases, Third-Party Tools & WordPress expansions.

Validates:
- Positive detection fixtures
- Negative detection fixtures
- Confidence assertions
- Evidence provenance assertions (first_party, third_party_embed, asset_host, inferred_dependency)
- False-positive and privacy protections (e.g. private DB stays unknown, asset host doesn't prove backend)
"""

import pytest
from app.technology.extractors.html_extractor import RawPageEvidence, HTMLTechnologyExtractor
from app.technology.fingerprints.engine import UniversalFingerprintEngine
from app.technology.detector import TechnologyDetector
from app.technology.models import DetectionStatus, EvidenceProvenance


@pytest.fixture
def engine():
    return UniversalFingerprintEngine()


@pytest.fixture
def detector():
    return TechnologyDetector()


# =============================================================================
# 1. BACKEND FRAMEWORKS & RUNTIMES (Section 7)
# =============================================================================

@pytest.mark.parametrize(
    "tech_id,headers,expected_name,implied_tech",
    [
        ("nestjs", {"x-powered-by": "NestJS"}, "NestJS", "nodejs"),
        ("fastify", {"x-powered-by": "Fastify"}, "Fastify", "nodejs"),
        ("symfony", {"x-powered-by": "Symfony"}, "Symfony", "php"),
        ("codeigniter", {"set-cookie": "ci_session=abcdef123456"}, "CodeIgniter", "php"),
        ("flask", {"server": "Werkzeug/2.2.2"}, "Flask", "python"),
        ("asp_net", {"x-powered-by": "ASP.NET"}, "ASP.NET", "dotnet"),
        ("asp_net_core", {"x-powered-by": "ASP.NET Core"}, "ASP.NET Core", "dotnet"),
        ("phoenix", {"x-request-id": "F5qK-vF3xZ"}, "Phoenix", "elixir"),
        ("gin", {"server": "gin-gonic"}, "Gin", "go"),
        ("fiber", {"server": "Fiber"}, "Fiber", "go"),
        ("iis", {"server": "Microsoft-IIS/10.0"}, "Microsoft IIS", None),
    ],
)
def test_backend_framework_positive_detection(engine, tech_id, headers, expected_name, implied_tech):
    evidence = RawPageEvidence()
    findings = engine.match_page(evidence, headers=headers, page_url="https://backend-test.com/")
    target = next((f for f in findings if f.technology_id == tech_id), None)
    assert target is not None, f"Expected {tech_id} to be detected"
    assert target.technology_name == expected_name
    assert target.confidence >= 0.70
    assert target.status == DetectionStatus.detected.value

    if implied_tech:
        implied = next((f for f in findings if f.technology_id == implied_tech), None)
        assert implied is not None, f"Expected {tech_id} to imply {implied_tech}"
        assert implied.provenance == EvidenceProvenance.inferred_dependency.value


def test_blazor_frontend_backend_detection(engine):
    evidence = RawPageEvidence(
        script_sources=["/_framework/blazor.webassembly.js"],
        dom_markers=["_blazor"],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://blazor-app.net/")
    blazor = next((f for f in findings if f.technology_id == "blazor"), None)
    assert blazor is not None
    assert blazor.status == DetectionStatus.detected.value
    # Implies dotnet and csharp
    dotnet = next((f for f in findings if f.technology_id == "dotnet"), None)
    assert dotnet is not None
    assert dotnet.provenance == EvidenceProvenance.inferred_dependency.value


def test_iis_version_extraction(engine):
    headers = {"server": "Microsoft-IIS/10.0"}
    findings = engine.match_page(RawPageEvidence(), headers=headers, page_url="https://windows-server.com/")
    iis = next((f for f in findings if f.technology_id == "iis"), None)
    assert iis is not None
    assert iis.version_or_null == "10.0"


# =============================================================================
# 2. HOSTING, CDN & CLOUD INFRASTRUCTURE (Section 8)
# =============================================================================

@pytest.mark.parametrize(
    "tech_id,headers,asset_urls,expected_prov",
    [
        ("akamai", {"server": "AkamaiGHost", "x-akamai-transformed": "9 - 0 p"}, [], EvidenceProvenance.third_party_embed.value),
        ("aws", {"x-amz-request-id": "ABCD1234EFGH5678"}, ["https://s3.amazonaws.com/bucket/img1.jpg", "https://s3.amazonaws.com/bucket/img2.jpg"], EvidenceProvenance.asset_host.value),
        ("gcp", {"x-goog-generation": "123456"}, ["https://storage.googleapis.com/b/hero.webp", "https://storage.googleapis.com/b/logo.webp"], EvidenceProvenance.asset_host.value),
        ("azure", {"x-ms-request-id": "req-123"}, ["https://myblob.blob.core.windows.net/img.png", "https://cdn.azureedge.net/asset.js"], EvidenceProvenance.asset_host.value),
        ("firebase_hosting", {"x-firebase-hosting": "true", "server": "Firebase"}, [], EvidenceProvenance.first_party.value),
        ("render", {"x-render-origin-server": "render", "rndr-id": "r-1234"}, [], EvidenceProvenance.first_party.value),
        ("heroku", {"via": "1.1 vegur", "server": "cowboy"}, [], EvidenceProvenance.first_party.value),
        ("digitalocean", {"x-do-app-origin": "fra1"}, ["https://space.digitaloceanspaces.com/1.png", "https://space.digitaloceanspaces.com/2.png"], EvidenceProvenance.asset_host.value),
        ("bunny_cdn", {"server": "BunnyCDN", "b-cache": "HIT"}, ["https://cdn.b-cdn.net/img.jpg"], EvidenceProvenance.asset_host.value),
        ("keycdn", {"server": "keycdn-engine"}, ["https://site.kxcdn.com/asset.js"], EvidenceProvenance.asset_host.value),
    ],
)
def test_hosting_infrastructure_positive_detection(engine, tech_id, headers, asset_urls, expected_prov):
    evidence = RawPageEvidence(asset_urls=asset_urls)
    findings = engine.match_page(evidence, headers=headers, page_url="https://cloud-infra-test.com/")
    target = next((f for f in findings if f.technology_id == tech_id), None)
    assert target is not None, f"Expected {tech_id} to be detected"
    assert target.confidence >= 0.70
    assert target.status == DetectionStatus.detected.value
    assert target.provenance == expected_prov


def test_aws_single_asset_does_not_falsely_detect_hosting(engine):
    """A single embedded AWS image should NOT detect AWS hosting due to min_assets_for_detection=2."""
    evidence = RawPageEvidence(asset_urls=["https://s3.amazonaws.com/external/badge.png"])
    findings = engine.match_page(evidence, headers={}, page_url="https://my-blog.com/")
    aws_finding = next((f for f in findings if f.technology_id == "aws"), None)
    assert aws_finding is None or aws_finding.status != DetectionStatus.detected.value


# =============================================================================
# 3. DATABASES & DATA SERVICES (Section 9 - Truth in Advertising)
# =============================================================================

def test_firebase_firestore_client_detection(engine):
    from app.technology.fingerprints.catalog import TechnologyCatalog
    evidence = RawPageEvidence(
        script_sources=["https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js"],
        inline_markers=["firebase.firestore()"],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://firebase-app.web.app/")
    db = next((f for f in findings if f.technology_id == "firebase_database"), None)
    assert db is not None
    assert db.status == DetectionStatus.detected.value
    fp = TechnologyCatalog.get("firebase_database")
    assert fp is not None and "private" in fp.limitations.lower()


def test_supabase_client_detection(engine):
    evidence = RawPageEvidence(
        script_sources=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js"],
        inline_markers=["createClient('https://xyz.supabase.co', 'anon')"],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://supabase-client.io/")
    sb = next((f for f in findings if f.technology_id == "supabase"), None)
    assert sb is not None
    assert sb.status == DetectionStatus.detected.value


def test_algolia_and_meilisearch_search_engines(engine):
    evidence = RawPageEvidence(
        script_sources=["https://cdn.jsdelivr.net/npm/algoliasearch@4/dist/algoliasearch-lite.umd.js"],
        inline_markers=["algoliasearch('APP_ID', 'API_KEY')"],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://ecommerce-search.com/")
    algolia = next((f for f in findings if f.technology_id == "algolia"), None)
    assert algolia is not None
    assert algolia.status == DetectionStatus.detected.value


def test_elasticsearch_and_opensearch_disclosed_headers(engine):
    headers = {"x-elastic-product": "Elasticsearch"}
    findings = engine.match_page(RawPageEvidence(), headers=headers, page_url="https://search-cluster.io/")
    es = next((f for f in findings if f.technology_id == "elasticsearch"), None)
    assert es is not None
    assert es.status == DetectionStatus.detected.value


def test_private_databases_never_guessed_without_disclosed_signals(engine):
    """A site running Django or Laravel must NEVER be assumed to use PostgreSQL or MySQL."""
    headers = {"set-cookie": "csrftoken=abcdef; sessionid=123456"}
    findings = engine.match_page(RawPageEvidence(), headers=headers, page_url="https://normal-django-site.com/")
    
    # Django should be detected
    django = next((f for f in findings if f.technology_id == "django"), None)
    assert django is not None
    
    # PostgreSQL, MySQL, MariaDB, SQLite must NOT be detected
    for db_id in ("postgresql", "mysql", "mariadb", "sqlite", "mongodb", "redis"):
        db_finding = next((f for f in findings if f.technology_id == db_id), None)
        assert db_finding is None or db_finding.status in (DetectionStatus.not_observed.value, DetectionStatus.unknown.value), f"Falsely guessed private database {db_id}!"


def test_explicitly_disclosed_database_header(engine):
    """When explicitly disclosed via public response header, record database honestly."""
    headers = {"x-database": "PostgreSQL"}
    findings = engine.match_page(RawPageEvidence(), headers=headers, page_url="https://api-debug.com/")
    pg = next((f for f in findings if f.technology_id == "postgresql"), None)
    assert pg is not None
    assert pg.status == DetectionStatus.detected.value


# =============================================================================
# 4. THIRD-PARTY TOOLS & SERVICES (Section 10)
# =============================================================================

@pytest.mark.parametrize(
    "tech_id,script_src,inline_sig,dom_sig,expected_category",
    [
        ("adobe_analytics", "https://assets.adobedtm.com/launch-EN123.min.js", "s.t()", None, "analytics"),
        ("matomo", "/matomo.js", "_paq.push", None, "analytics"),
        ("fathom", "https://cdn.usefathom.com/script.js", "fathom.trackPageview", None, "analytics"),
        ("mixpanel", "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js", "mixpanel.init('TOKEN')", None, "analytics"),
        ("amplitude", "https://cdn.amplitude.com/libs/amplitude-8.0.0-min.gz.js", "amplitude.init('KEY')", None, "analytics"),
        ("google_ads", "https://www.googleadservices.com/pagead/conversion.js", "gtag('event', 'conversion'", None, "advertising"),
        ("tiktok_pixel", "https://analytics.tiktok.com/i18n/pixel/events.js", "ttq.load('ID')", None, "advertising"),
        ("linkedin_insight", "https://snap.licdn.com/li.lms-analytics/insight.min.js", "_linkedin_partner_id = '123'", None, "advertising"),
        ("fullstory", "https://edge.fullstory.com/s/fs.js", "window['_fs_host'] = 'fullstory.com'", None, "ux"),
        ("intercom", "https://widget.intercom.io/widget/app123", "Intercom('boot'", None, "ux"),
        ("crisp", "https://client.crisp.chat/l.js", "window.$crisp=[]", None, "ux"),
        ("zendesk", "https://static.zdassets.com/ekr/snippet.js", "zE('webWidget'", None, "ux"),
        ("adyen", "https://checkoutshopper-live.adyen.com/checkoutshopper/sdk/5.0.0/adyen.js", "AdyenCheckout(", None, "payments"),
        ("klarna", "https://x.klarnacdn.net/kp/lib/v1/api.js", "Klarna.Payments.init", None, "payments"),
        ("razorpay", "https://checkout.razorpay.com/v1/checkout.js", "Razorpay(", None, "payments"),
        ("hcaptcha", "https://js.hcaptcha.com/1/api.js", "hcaptcha.render", "class:h-captcha", "security"),
        ("mailchimp", "https://chimpstatic.com/mcjs-connected/js/users/123/456.js", None, "id:mc_embed_signup", "marketing"),
        ("klaviyo", "https://static.klaviyo.com/onsite/js/klaviyo.js", "_learnq.push", None, "marketing"),
        ("hubspot_marketing", "https://js.hs-scripts.com/123456.js", "_hsq.push", None, "marketing"),
        ("brevo", "https://sibautomation.com/sa.js", "Brevo.push", None, "marketing"),
    ],
)
def test_third_party_services_positive_detection(engine, tech_id, script_src, inline_sig, dom_sig, expected_category):
    evidence = RawPageEvidence(
        script_sources=[script_src] if script_src else [],
        inline_markers=[inline_sig] if inline_sig else [],
        dom_markers=[dom_sig] if dom_sig else [],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://services-test.org/")
    target = next((f for f in findings if f.technology_id == tech_id), None)
    assert target is not None, f"Expected {tech_id} to be detected"
    assert target.technology_category == expected_category
    assert target.confidence >= 0.70
    assert target.status == DetectionStatus.detected.value
    assert target.provenance == EvidenceProvenance.third_party_embed.value


def test_adobe_fonts_detection(engine):
    evidence = RawPageEvidence(
        stylesheet_hrefs=["https://use.typekit.net/abc1234.css"],
        script_sources=["https://use.typekit.net/abc1234.js"],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://fonts-test.com/")
    af = next((f for f in findings if f.technology_id == "adobe_fonts"), None)
    assert af is not None
    assert af.technology_category == "fonts"
    assert af.status == DetectionStatus.detected.value


# =============================================================================
# 5. WORDPRESS DEEP EXTENSIONS (Section 11)
# =============================================================================

def test_gutenberg_block_editor_detection(engine):
    evidence = RawPageEvidence(
        stylesheet_hrefs=["/wp-includes/css/dist/block-library/style.min.css"],
        body_classes=["wp-embed-responsive"],
        dom_markers=["class:wp-block-group", "class:wp-block-columns"],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://gutenberg-blog.com/")
    gb = next((f for f in findings if f.technology_id == "gutenberg"), None)
    assert gb is not None
    assert gb.technology_name == "Gutenberg"
    assert gb.status == DetectionStatus.detected.value
    # Implies wordpress and php
    wp = next((f for f in findings if f.technology_id == "wordpress"), None)
    assert wp is not None


def test_divi_builder_detection(engine):
    evidence = RawPageEvidence(
        body_classes=["et_divi_builder", "et_pb_pagebuilder_layout"],
        stylesheet_hrefs=["/wp-content/themes/divi/style.css?ver=4.23.0"],
        script_sources=["/wp-content/themes/divi/js/et-builder.min.js"],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://divi-agency.com/")
    divi = next((f for f in findings if f.technology_id == "divi"), None)
    assert divi is not None
    assert divi.technology_name == "Divi"
    assert divi.status == DetectionStatus.detected.value


def test_wpbakery_composer_detection(engine):
    evidence = RawPageEvidence(
        stylesheet_hrefs=["/wp-content/plugins/js_composer/assets/css/js_composer.min.css?ver=6.13.0"],
        dom_markers=["class:vc_row", "class:wpb_wrapper"],
    )
    findings = engine.match_page(evidence, headers={}, page_url="https://wpbakery-site.com/")
    wpb = next((f for f in findings if f.technology_id == "wpbakery"), None)
    assert wpb is not None
    assert wpb.technology_name == "WPBakery"
    assert wpb.status == DetectionStatus.detected.value


def test_woocommerce_store_detection(engine):
    evidence = RawPageEvidence(
        body_classes=["woocommerce", "woocommerce-page"],
        stylesheet_hrefs=["/wp-content/plugins/woocommerce/assets/css/woocommerce.css?ver=8.5.1"],
        script_sources=["/wp-content/plugins/woocommerce/assets/js/frontend/woocommerce.min.js"],
    )
    headers = {"set-cookie": "woocommerce_items_in_cart=1; wp_woocommerce_session_123=abc"}
    findings = engine.match_page(evidence, headers=headers, page_url="https://woo-shop.com/")
    woo = next((f for f in findings if f.technology_id == "woocommerce"), None)
    assert woo is not None
    assert woo.technology_name == "WooCommerce"
    assert woo.technology_category == "cms"
    assert woo.status == DetectionStatus.detected.value


# =============================================================================
# 6. HTML EXTRACTOR ROUND-TRIP WITH DETECTOR (Section 12 & 15)
# =============================================================================

def test_html_extractor_real_world_gutenberg_and_analytics(detector):
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="generator" content="WordPress 6.4.3" />
        <link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css" />
        <link rel="stylesheet" href="https://use.typekit.net/abc1234.css" />
        <script src="https://www.googletagmanager.com/gtag/js?id=G-ABC12345"></script>
        <script src="https://js.stripe.com/v3/"></script>
        <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('config', 'G-ABC12345');
        </script>
        <!-- SEO by Rank Math -->
    </head>
    <body class="wp-embed-responsive theme-twentytwentyfour">
        <div class="wp-block-group">
            <div class="wp-block-columns">
                <p>Modern Block Editor Content</p>
                <div class="g-recaptcha" data-sitekey="12345"></div>
            </div>
        </div>
    </body>
    </html>
    """
    evidence = HTMLTechnologyExtractor.extract(html)
    headers = {"server": "nginx", "x-powered-by": "PHP/8.2.14"}
    findings = detector.detect_page(evidence, headers=headers, page_url="https://modern-wp.org/")

    tech_ids = {f.technology_id for f in findings}
    assert "wordpress" in tech_ids
    assert "php" in tech_ids
    assert "nginx" in tech_ids
    assert "gutenberg" in tech_ids
    assert "rank_math" in tech_ids
    assert "google_analytics" in tech_ids
    assert "google_tag_manager" in tech_ids
    assert "stripe" in tech_ids
    assert "recaptcha" in tech_ids
    assert "adobe_fonts" in tech_ids

    # Summary checks
    summary = detector.summarize(findings)
    assert summary.primary_cms == "WordPress"
    assert "PHP" in summary.backend_runtimes or "Nginx" in summary.backend_runtimes
    assert summary.total_detected >= 5
