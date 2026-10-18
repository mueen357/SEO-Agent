"""Authoritative, extensible technology fingerprint catalog (v2.0.0).

Defines ~160+ web technologies across CMS, frontend, backend, hosting,
languages, databases, analytics, advertising, UX, payments, and security.
"""

from typing import Dict, List, Optional
from app.technology.fingerprints.schema import (
    FingerprintSignatures,
    TechnologyFingerprint,
    VersionExtractionRule,
)
from app.technology.models import EvidenceProvenance, TechnologyCategory, VersionType

CATALOG_VERSION = "2.0.0"
ENGINE_VERSION = "2.0.0"


def _build_catalog() -> Dict[str, TechnologyFingerprint]:
    catalog: Dict[str, TechnologyFingerprint] = {}

    def add(fp: TechnologyFingerprint) -> None:
        catalog[fp.id] = fp

    # =========================================================================
    # 1. CMS & WEBSITE BUILDERS (Traditional & Coupled)
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="wordpress",
            name="WordPress",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="Automattic / Open Source",
            website="https://wordpress.org",
            description="Open-source Content Management System powering web publishing.",
            implies=["php"],
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                meta_generators=[r"WordPress\s*([0-9\.]+)?"],
                headers={"x-generator": r"WordPress", "x-powered-by": r"WordPress"},
                cookies=["wordpress_logged_in_", "wp-settings-"],
                script_sources=[r"/wp-includes/", r"/wp-content/"],
                stylesheet_hrefs=[r"/wp-content/", r"/wp-includes/"],
                dom_markers=["class:wp-embed-responsive", "body[class*=wp-]"],
                inline_markers=["wp.apiFetch", "wp-json", "_wpnonce"],
                html_comments=["<!-- This site is optimized with the Yoast SEO", "<!-- Performance optimized by W3 Total Cache"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"WordPress\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                ),
                VersionExtractionRule(
                    source_type="script_url",
                    regex=r"wp-includes/js/.*?ver=([0-9\.]+)",
                    version_type=VersionType.asset_hint_unverified,
                ),
            ],
            limitations="Passive inspection of public assets and generator tags.",
        )
    )

    add(
        TechnologyFingerprint(
            id="wordpress_com",
            name="WordPress.com",
            category=TechnologyCategory.cms,
            subcategory="hosted_cms",
            vendor_or_type="Automattic",
            website="https://wordpress.com",
            description="Managed cloud hosting platform for WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-hacker": r".*automattic.*", "x-ac": r".*", "server": r"wpcom"},
                script_sources=[r"s0\.wp\.com", r"s1\.wp\.com", r"s2\.wp\.com", r"widgets\.wp\.com"],
                stylesheet_hrefs=[r"s0\.wp\.com", r"s1\.wp\.com"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="shopify",
            name="Shopify",
            category=TechnologyCategory.cms,
            subcategory="ecommerce",
            vendor_or_type="Shopify Inc.",
            website="https://www.shopify.com",
            description="Hosted multi-channel e-commerce and checkout platform.",
            implies=["ecommerce"],
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                meta_generators=[r"Shopify"],
                headers={"x-shopify-stage": r".*", "x-shopid": r".*"},
                cookies=["_shopify_y", "_shopify_s", "_shopify_sa_p"],
                script_sources=[r"cdn\.shopify\.com", r"shopify-cloud"],
                stylesheet_hrefs=[r"cdn\.shopify\.com"],
                inline_markers=["Shopify.theme", "window.Shopify", "ShopifyBuy"],
                dom_markers=["id:shopify-section", "class:shopify-payment-button"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="framer",
            name="Framer",
            category=TechnologyCategory.cms,
            subcategory="website_builder",
            vendor_or_type="Framer B.V.",
            website="https://www.framer.com",
            description="Interactive website builder and CMS platform for designers and teams.",
            confidence_weight=0.99,
            signatures=FingerprintSignatures(
                meta_generators=[r"Framer\s*([a-zA-Z0-9\.\-]+)?"],
                headers={"server": r"Framer/([a-zA-Z0-9]+)", "x-generator": r"Framer"},
                script_sources=[r"events\.framer\.com", r"framerusercontent\.com", r"framerstatic\.com"],
                stylesheet_hrefs=[r"framercdn\.com", r"framerstatic\.com"],
                dom_markers=["data-framer-name", "data-framer-hydrate-v2", "data-framer-component", "id:__framer-badge-container"],
                inline_markers=["__framer__", "framer.site", "data-framer-hydrate-v2"],
                asset_urls=[r"framerusercontent\.com", r"framerstatic\.com", r"framercdn\.com"],
                min_assets_for_detection=2,
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"Framer\s*([a-zA-Z0-9\.\-]+)",
                    version_type=VersionType.explicit_version,
                ),
                VersionExtractionRule(
                    source_type="header",
                    regex=r"Framer/([a-zA-Z0-9\.\-]+)",
                    version_type=VersionType.explicit_version,
                ),
            ],
            known_false_positives=["A non-Framer site embedding a single external Framer image."],
        )
    )

    add(
        TechnologyFingerprint(
            id="webflow",
            name="Webflow",
            category=TechnologyCategory.cms,
            subcategory="website_builder",
            vendor_or_type="Webflow Inc.",
            website="https://webflow.com",
            description="Visual web design and CMS hosting platform.",
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                meta_generators=[r"Webflow"],
                script_sources=[r"assets\.website-files\.com", r"d3e54v103j8qbb\.cloudfront\.net"],
                stylesheet_hrefs=[r"assets\.website-files\.com", r"assets-global\.website-files\.com"],
                dom_markers=["html[data-wf-page]", "html[data-wf-site]", "webflow:data-wf"],
                html_attributes={"data-wf-page": r".*", "data-wf-site": r".*"},
                inline_markers=["Webflow.require", "Webflow.push"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="wix",
            name="Wix",
            category=TechnologyCategory.cms,
            subcategory="website_builder",
            vendor_or_type="Wix.com Ltd.",
            website="https://www.wix.com",
            description="Cloud-based website builder and hosting service.",
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                meta_generators=[r"Wix\.com Website Builder"],
                headers={"x-wix-request-id": r".*", "x-wix-renderer-server": r".*"},
                script_sources=[r"static\.parastorage\.com", r"static\.wixstatic\.com"],
                stylesheet_hrefs=[r"static\.parastorage\.com"],
                dom_markers=["id:SITE_CONTAINER", "class:wix-site"],
                inline_markers=["wixBiSession", "wixPerformanceMeasurements", "wixDeveloperAnalytics"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="squarespace",
            name="Squarespace",
            category=TechnologyCategory.cms,
            subcategory="website_builder",
            vendor_or_type="Squarespace Inc.",
            website="https://www.squarespace.com",
            description="Hosted all-in-one website building and e-commerce platform.",
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                headers={"x-served-by": r"Squarespace"},
                cookies=["SS_MID", "SS_MATTR"],
                script_sources=[r"static1\.squarespace\.com", r"assets\.squarespace\.com"],
                stylesheet_hrefs=[r"static1\.squarespace\.com"],
                dom_markers=["id:siteWrapper", "body[class*=squarespace]"],
                inline_markers=["Static.SQUARESPACE_CONTEXT", "SQUARESPACE_CACHE_CONTEXT"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="drupal",
            name="Drupal",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="Open Source",
            website="https://www.drupal.org",
            description="Modular open-source content management framework.",
            implies=["php"],
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                meta_generators=[r"Drupal\s*([0-9\.]+)?"],
                headers={"x-drupal-cache": r".*", "x-generator": r"Drupal\s*([0-9\.]+)?"},
                script_sources=[r"/sites/default/files/", r"/core/misc/drupal\.js"],
                stylesheet_hrefs=[r"/sites/default/files/", r"/core/themes/"],
                dom_markers=["class:drupal-tabs", "class:block-drupal"],
                inline_markers=["drupalSettings", "Drupal.behaviors"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"Drupal\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                ),
                VersionExtractionRule(
                    source_type="header",
                    regex=r"Drupal\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                ),
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="joomla",
            name="Joomla",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="Open Source",
            website="https://www.joomla.org",
            description="Open-source CMS for publishing web content.",
            implies=["php"],
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                meta_generators=[r"Joomla!\s*-\s*Open Source Content Management"],
                headers={"x-content-encoded-by": r"Joomla"},
                script_sources=[r"/media/jui/js/", r"/media/system/js/core\.js"],
                stylesheet_hrefs=[r"/templates/system/css/", r"/media/jui/css/"],
                inline_markers=["Joomla.JText", "joomla.javascript"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="ghost",
            name="Ghost",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="Ghost Foundation",
            website="https://ghost.org",
            description="Modern open-source publishing platform built on Node.js.",
            implies=["nodejs"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"Ghost\s*([0-9\.]+)?"],
                headers={"x-ghost-cache-status": r".*"},
                stylesheet_hrefs=[r"/assets/built/screen\.css"],
                script_sources=[r"ghost-search\.min\.js"],
                dom_markers=["class:ghost-portal-root"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"Ghost\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="magento",
            name="Magento / Adobe Commerce",
            category=TechnologyCategory.cms,
            subcategory="ecommerce",
            vendor_or_type="Adobe Inc.",
            website="https://business.adobe.com/products/magento/magento-commerce.html",
            description="Enterprise e-commerce platform.",
            implies=["php", "ecommerce"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                cookies=["frontend_cid", "form_key"],
                script_sources=[r"/static/version[0-9]+/frontend/", r"mage/cookies\.js"],
                stylesheet_hrefs=[r"/static/version[0-9]+/frontend/"],
                inline_markers=["Mage.Cookies", "require(['mage/apply/main']"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="woocommerce",
            name="WooCommerce",
            category=TechnologyCategory.cms,
            subcategory="ecommerce",
            vendor_or_type="Automattic",
            website="https://woocommerce.com",
            description="Open-source customizable ecommerce platform built on WordPress.",
            implies=["wordpress", "php", "ecommerce"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"WooCommerce\s*([0-9\.]+)?"],
                script_sources=[r"/wp-content/plugins/woocommerce/"],
                stylesheet_hrefs=[r"/wp-content/plugins/woocommerce/"],
                body_classes=["woocommerce", "woocommerce-page"],
                inline_markers=["wc_add_to_cart_params", "woocommerce_params"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"WooCommerce\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="bigcommerce",
            name="BigCommerce",
            category=TechnologyCategory.cms,
            subcategory="ecommerce",
            vendor_or_type="BigCommerce Pty. Ltd.",
            website="https://www.bigcommerce.com",
            description="SaaS e-commerce platform for fast-growing and enterprise businesses.",
            implies=["ecommerce"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-bc-store-id": r".*", "x-bc-theme": r".*"},
                script_sources=[r"cdn\d+\.bigcommerce\.com", r"storefront\.bigcommerce\.com"],
                stylesheet_hrefs=[r"cdn\d+\.bigcommerce\.com"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="prestashop",
            name="PrestaShop",
            category=TechnologyCategory.cms,
            subcategory="ecommerce",
            vendor_or_type="PrestaShop SA",
            website="https://prestashop.com",
            description="Open source e-commerce solution.",
            implies=["php", "ecommerce"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"PrestaShop"],
                script_sources=[r"/themes/[^/]+/assets/js/theme\.js", r"/modules/ps_"],
                inline_markers=["prestashop.customer", "prestashop.cart"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="opencart",
            name="OpenCart",
            category=TechnologyCategory.cms,
            subcategory="ecommerce",
            vendor_or_type="OpenCart",
            website="https://www.opencart.com",
            description="Open-source online store management system.",
            implies=["php", "ecommerce"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                script_sources=[r"catalog/view/javascript/common\.js"],
                stylesheet_hrefs=[r"catalog/view/theme/default/stylesheet/stylesheet\.css"],
                cookies=["OCSESSID"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="typo3",
            name="TYPO3",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="TYPO3 Association",
            website="https://typo3.org",
            description="Open source enterprise content management system.",
            implies=["php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"TYPO3\s*(CMS)?"],
                script_sources=[r"typo3temp/", r"typo3conf/"],
                stylesheet_hrefs=[r"typo3temp/"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="hubspot_cms",
            name="HubSpot CMS",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="HubSpot Inc.",
            website="https://www.hubspot.com/products/cms",
            description="Cloud CMS connected with HubSpot CRM and marketing automation.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"HubSpot"],
                script_sources=[r"js\.hs-scripts\.com", r"static\.hsappstatic\.net"],
                stylesheet_hrefs=[r"static\.hsappstatic\.net"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="duda",
            name="Duda",
            category=TechnologyCategory.cms,
            subcategory="website_builder",
            vendor_or_type="Duda Inc.",
            website="https://www.duda.co",
            description="Responsive website builder platform designed for digital agencies.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"Duda"],
                script_sources=[r"static\.duda\.co", r"irp\.cdn-website\.com"],
                stylesheet_hrefs=[r"static\.duda\.co", r"irp\.cdn-website\.com"],
                dom_markers=["id:dmRoot"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="tilda",
            name="Tilda",
            category=TechnologyCategory.cms,
            subcategory="website_builder",
            vendor_or_type="Tilda Publishing",
            website="https://tilda.cc",
            description="Block-based visual website builder.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"static\.tildacdn\.com"],
                stylesheet_hrefs=[r"static\.tildacdn\.com"],
                dom_markers=["id:allrecords", "class:t-records"],
                inline_markers=["t_records__init", "window.tildaMembersId"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="carrd",
            name="Carrd",
            category=TechnologyCategory.cms,
            subcategory="website_builder",
            vendor_or_type="Carrd Inc.",
            website="https://carrd.co",
            description="Simple, fully responsive one-page site builder.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"Carrd"],
                script_sources=[r"carrd(\.min)?\.js"],
                dom_markers=["id:wrapper", "class:is-carrd"],
                stylesheet_hrefs=[r"assets/main\.css"],
                html_comments=["<!-- Carrd site -->"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="bubble",
            name="Bubble",
            category=TechnologyCategory.cms,
            subcategory="no_code_platform",
            vendor_or_type="Bubble Group Inc.",
            website="https://bubble.io",
            description="No-code visual web application development platform.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"d1muf25xaso8hp\.cloudfront\.net", r"app\.bubble\.io"],
                inline_markers=["window.bubble_debug", "bubble_version"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="weebly",
            name="Weebly",
            category=TechnologyCategory.cms,
            subcategory="website_builder",
            vendor_or_type="Square Inc.",
            website="https://www.weebly.com",
            description="E-commerce and visual website builder platform.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"Weebly"],
                script_sources=[r"cdn2\.editmysite\.com"],
                stylesheet_hrefs=[r"cdn2\.editmysite\.com"],
                dom_markers=["body[class*=weebly]"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="salesforce_commerce_cloud",
            name="Salesforce Commerce Cloud",
            category=TechnologyCategory.cms,
            subcategory="ecommerce",
            vendor_or_type="Salesforce Inc.",
            website="https://www.salesforce.com/commerce/",
            description="Enterprise cloud commerce platform formerly known as Demandware.",
            implies=["ecommerce"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"/on/demandware\.store/", r"/on/demandware\.static/"],
                stylesheet_hrefs=[r"/on/demandware\.static/"],
                cookies=["dwsid", "dwsecuretoken"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="sitecore",
            name="Sitecore",
            category=TechnologyCategory.cms,
            subcategory="enterprise_cms",
            vendor_or_type="Sitecore",
            website="https://www.sitecore.com",
            description="Enterprise digital experience platform and CMS.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                script_sources=[r"/sitecore/"],
                stylesheet_hrefs=[r"/sitecore/"],
                cookies=["SC_ANALYTICS_GLOBAL_COOKIE"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="kentico",
            name="Kentico",
            category=TechnologyCategory.cms,
            subcategory="enterprise_cms",
            vendor_or_type="Kentico Software",
            website="https://www.kentico.com",
            description="Web content management system and digital experience platform.",
            implies=["dotnet"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                meta_generators=[r"Kentico\s*CMS\s*([0-9\.]+)?"],
                script_sources=[r"/CMSPages/", r"/CMSModules/"],
                cookies=["CMSPreferredCulture", "CMSCurrentTheme"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"Kentico\s*CMS\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="craft_cms",
            name="Craft CMS",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="Pixel & Tonic Inc.",
            website="https://craftcms.com",
            description="Flexible, user-friendly CMS for creating custom digital experiences.",
            implies=["php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Craft\s*CMS"},
                cookies=["CRAFT_CSRF_TOKEN"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="umbraco",
            name="Umbraco",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="Umbraco HQ",
            website="https://umbraco.com",
            description="Flexible open-source .NET CMS platform.",
            implies=["dotnet"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                headers={"x-umbraco-version": r"([0-9\.]+)"},
                cookies=["UMB_UCONTEXT", "UMB-XSRF-TOKEN"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="header",
                    regex=r"x-umbraco-version.*?([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="october_cms",
            name="October CMS",
            category=TechnologyCategory.cms,
            subcategory="cms",
            vendor_or_type="October CMS",
            website="https://octobercms.com",
            description="Self-hosted content management platform based on the Laravel PHP Framework.",
            implies=["laravel", "php"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                meta_generators=[r"October\s*CMS"],
                cookies=["october_session"],
                script_sources=[r"/modules/system/assets/js/framework\.js"],
            ),
        )
    )

    # -------------------------------------------------------------------------
    # Headless CMS (Strictly observable public markers only)
    # -------------------------------------------------------------------------
    add(
        TechnologyFingerprint(
            id="contentful",
            name="Contentful",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="Contentful GmbH",
            website="https://www.contentful.com",
            description="Composable content platform for enterprise digital products.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                script_sources=[r"ctfassets\.net"],
                asset_urls=[r"images\.ctfassets\.net", r"downloads\.ctfassets\.net", r"assets\.ctfassets\.net"],
                min_assets_for_detection=2,
            ),
            limitations="Headless backend; detected only when public assets are served via Contentful CDN.",
        )
    )

    add(
        TechnologyFingerprint(
            id="sanity",
            name="Sanity",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="Sanity.io",
            website="https://www.sanity.io",
            description="Platform for structured content and real-time collaboration.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                asset_urls=[r"cdn\.sanity\.io"],
                script_sources=[r"@sanity/client", r"cdn\.sanity\.io"],
                min_assets_for_detection=2,
            ),
            limitations="Headless backend; detected only when public assets or client SDK are observable.",
        )
    )

    add(
        TechnologyFingerprint(
            id="prismic",
            name="Prismic",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="Prismic",
            website="https://prismic.io",
            description="Headless CMS with visual slice building for developers and marketers.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                asset_urls=[r"images\.prismic\.io", r"prismic-io\.s3\.amazonaws\.com"],
                script_sources=[r"static\.cdn\.prismic\.io/prismic\.js", r"images\.prismic\.io"],
                min_assets_for_detection=2,
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="storyblok",
            name="Storyblok",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="Storyblok GmbH",
            website="https://www.storyblok.com",
            description="Pioneer headless CMS with visual editor.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                asset_urls=[r"a\.storyblok\.com"],
                script_sources=[r"storyblok-js-client", r"app\.storyblok\.com", r"a\.storyblok\.com"],
                min_assets_for_detection=2,
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="strapi",
            name="Strapi",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="Strapi SAS",
            website="https://strapi.io",
            description="Open-source Node.js Headless CMS.",
            implies=["nodejs"],
            confidence_weight=0.80,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Strapi"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="directus",
            name="Directus",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="Monospace Inc.",
            website="https://directus.io",
            description="Open-source data platform and headless CMS.",
            implies=["nodejs"],
            confidence_weight=0.80,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Directus"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="payload_cms",
            name="Payload CMS",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="Payload",
            website="https://payloadcms.com",
            description="Code-first, TypeScript-based headless CMS built on Next.js.",
            implies=["nodejs"],
            confidence_weight=0.80,
            signatures=FingerprintSignatures(
                headers={"x-payload-cms": r".*", "x-payload-version": r".*"},
                script_sources=[r"payload-client"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="hygraph",
            name="Hygraph",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="Hygraph GmbH",
            website="https://hygraph.com",
            description="Federated content platform formerly known as GraphCMS.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                script_sources=[r"media\.graphassets\.com"],
                asset_urls=[r"media\.graphassets\.com"],
                min_assets_for_detection=2,
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="datocms",
            name="DatoCMS",
            category=TechnologyCategory.cms,
            subcategory="headless_cms",
            vendor_or_type="DatoCMS",
            website="https://www.datocms.com",
            description="API-based headless content management system.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                script_sources=[r"datocms-assets\.com"],
                asset_urls=[r"datocms-assets\.com"],
                min_assets_for_detection=2,
            ),
        )
    )

    # =========================================================================
    # 2. PROGRAMMING LANGUAGES (Client-side & Disclosed Server-side)
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="html",
            name="HTML",
            category=TechnologyCategory.language,
            subcategory="markup_language",
            vendor_or_type="W3C / WHATWG",
            website="https://whatwg.org",
            description="Standard markup language for documents designed to be displayed in a web browser.",
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                dom_markers=["html", "body"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="css",
            name="CSS",
            category=TechnologyCategory.language,
            subcategory="stylesheet_language",
            vendor_or_type="W3C",
            website="https://www.w3.org/Style/CSS/",
            description="Cascading Style Sheets language for describing document presentation.",
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                stylesheet_hrefs=[r"\.css(\?.*)?$"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="javascript",
            name="JavaScript",
            category=TechnologyCategory.language,
            subcategory="scripting_language",
            vendor_or_type="ECMA International",
            website="https://www.ecma-international.org",
            description="High-level, just-in-time compiled programming language of the Web.",
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                script_sources=[r"\.js(\?.*)?$", r"\.mjs(\?.*)?$"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="typescript",
            name="TypeScript",
            category=TechnologyCategory.language,
            subcategory="compiled_language",
            vendor_or_type="Microsoft",
            website="https://www.typescriptlang.org",
            description="Strict syntactical superset of JavaScript adding static typing.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                script_sources=[r"\.tsx?(\?.*)?$", r"\.ts\.map$"],
                inline_markers=[r"sourceMappingURL=.*?\.tsx?"],
            ),
            limitations="Compiled JavaScript does NOT prove TypeScript unless source maps or symbols disclose it.",
        )
    )

    add(
        TechnologyFingerprint(
            id="php",
            name="PHP",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="The PHP Group",
            website="https://www.php.net",
            description="Popular server-side HTML-embedded scripting language.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"php/?([0-9\.]+)?", "server": r"php/?([0-9\.]+)?", "set-cookie": r"PHPSESSID"},
                cookies=["PHPSESSID"],
                script_sources=[r"\.php(\?.*)?$"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="header",
                    regex=r"php/([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
            limitations="Identified only when headers, cookies, or disclosed file extensions confirm PHP.",
        )
    )

    add(
        TechnologyFingerprint(
            id="python",
            name="Python",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="Python Software Foundation",
            website="https://www.python.org",
            description="Interpreted high-level general-purpose server programming language.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                headers={"server": r"\bpython(/[\d\.]+)?\b|gunicorn|uvicorn", "x-powered-by": r"python"},
            ),
            limitations="Identified only when Python WSGI/ASGI servers or framework cookies disclose presence.",
        )
    )

    add(
        TechnologyFingerprint(
            id="ruby",
            name="Ruby",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="Ruby Community",
            website="https://www.ruby-lang.org",
            description="Dynamic, open source programming language with a focus on simplicity and productivity.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                headers={"server": r"puma|unicorn|passenger", "x-powered-by": r"phusion passenger"},
                cookies=["_session_id"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="java",
            name="Java",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="Oracle Corporation",
            website="https://www.java.com",
            description="Class-based, object-oriented server programming language.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                headers={"server": r"tomcat|jetty|jboss|wildfly|glassfish", "x-powered-by": r"jsf|jsp|servlet"},
                cookies=["JSESSIONID"],
                script_sources=[r"\.jsp(\?.*)?$"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="dotnet",
            name=".NET / ASP.NET",
            category=TechnologyCategory.language,
            subcategory="server_framework",
            vendor_or_type="Microsoft",
            website="https://dotnet.microsoft.com",
            description="Open-source developer platform created by Microsoft for building web apps.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-aspnet-version": r"([0-9\.]+)"},
                dom_markers=["id:__VIEWSTATE", "id:__EVENTVALIDATION"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="header",
                    regex=r"x-aspnet-version:\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="csharp",
            name="C#",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="Microsoft",
            website="https://learn.microsoft.com/dotnet/csharp/",
            description="Modern, innovative, open-source object-oriented language for building .NET apps.",
            implies=["dotnet"],
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"asp\.net"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="go",
            name="Go",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="Google Inc.",
            website="https://go.dev",
            description="Open source programming language supported by Google for performant backend services.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"server": r"\b(golang|go-http-client)\b|^go(/[\d\.]+)?"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="rust",
            name="Rust",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="Rust Foundation",
            website="https://www.rust-lang.org",
            description="Blazingly fast and memory-efficient systems and web programming language.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"server": r"actix|rocket|axum"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="elixir",
            name="Elixir",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="Elixir Community",
            website="https://elixir-lang.org",
            description="Dynamic, functional language for building scalable and maintainable applications.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"server": r"cowboy", "x-powered-by": r"phoenix"},
                cookies=["_csrf_token"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="kotlin",
            name="Kotlin",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="JetBrains",
            website="https://kotlinlang.org",
            description="Modern multiplatform programming language targeting JVM, JS, and Native.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"server": r"Ktor(/[\d\.]+)?", "x-powered-by": r"Ktor"},
                script_sources=[r"kotlin(\.min)?\.js"],
            ),
            limitations="Observable via Ktor server headers or Kotlin/JS script bundles.",
        )
    )

    add(
        TechnologyFingerprint(
            id="erlang",
            name="Erlang",
            category=TechnologyCategory.language,
            subcategory="runtime_language",
            vendor_or_type="Ericsson",
            website="https://www.erlang.org",
            description="Programming language used to build massively scalable soft real-time systems.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"server": r"(Cowboy|MochiWeb|Yaws)"},
            ),
            limitations="Observable only when underlying Erlang HTTP server headers are disclosed.",
        )
    )

    add(
        TechnologyFingerprint(
            id="perl",
            name="Perl",
            category=TechnologyCategory.language,
            subcategory="scripting_language",
            vendor_or_type="The Perl Foundation",
            website="https://www.perl.org",
            description="Highly capable, feature-rich programming language with over 36 years of development.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Perl", "server": r"mod_perl(/[\d\.]+)?"},
                cookies=["dancer.session"],
            ),
            limitations="Identifiable via mod_perl headers or legacy Perl framework cookies.",
        )
    )

    add(
        TechnologyFingerprint(
            id="scala",
            name="Scala",
            category=TechnologyCategory.language,
            subcategory="server_language",
            vendor_or_type="EPFL / Lightbend",
            website="https://www.scala-lang.org",
            description="Scala combines object-oriented and functional programming in one concise, high-level language.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"server": r"akka-http(/[\d\.]+)?", "x-powered-by": r"Play Framework"},
                cookies=["PLAY_SESSION"],
            ),
            limitations="Observable via Play Framework or Akka HTTP server response headers.",
        )
    )

    # =========================================================================
    # 3. FRONTEND FRAMEWORKS & LIBRARIES
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="react",
            name="React",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="Meta Platforms Inc.",
            website="https://react.dev",
            description="Declarative JavaScript library for building user interfaces.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                dom_markers=["data-reactroot", "data-reactid"],
                script_sources=[r"react\.production\.min\.js", r"react-dom"],
                inline_markers=["React.createElement", "_reactListening", "__REACT_DEVTOOLS_GLOBAL_HOOK__"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="nextjs",
            name="Next.js",
            category=TechnologyCategory.frontend,
            subcategory="framework",
            vendor_or_type="Vercel Inc.",
            website="https://nextjs.org",
            description="React framework for production-grade full-stack web applications.",
            implies=["react", "javascript"],
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Next\.js\s*([0-9\.]+)?"},
                script_sources=[r"/_next/static/"],
                stylesheet_hrefs=[r"/_next/static/css/"],
                dom_markers=["id:__next", "script:__NEXT_DATA__"],
                inline_markers=["__NEXT_DATA__", "__next_f", "next/router"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="header",
                    regex=r"Next\.js\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="vue",
            name="Vue.js",
            category=TechnologyCategory.frontend,
            subcategory="ui_framework",
            vendor_or_type="Evan You / Community",
            website="https://vuejs.org",
            description="Progressive JavaScript framework for building user interfaces.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                dom_markers=["vue:data-v", "data-v-", "id:__nuxt"],
                script_sources=[r"vue(\.runtime)?(\.min)?\.js", r"/vue/dist/"],
                inline_markers=["__VUE__", "Vue.config", "__vue_app__"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="nuxt",
            name="Nuxt.js",
            category=TechnologyCategory.frontend,
            subcategory="framework",
            vendor_or_type="Nuxt Community",
            website="https://nuxt.com",
            description="Intuitive Vue.js full-stack framework.",
            implies=["vue", "javascript"],
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                dom_markers=["id:__nuxt"],
                script_sources=[r"/_nuxt/"],
                stylesheet_hrefs=[r"/_nuxt/"],
                inline_markers=["window.__NUXT__", "__NUXT_DATA__"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="angular",
            name="Angular",
            category=TechnologyCategory.frontend,
            subcategory="ui_framework",
            vendor_or_type="Google Inc.",
            website="https://angular.dev",
            description="TypeScript-based web application framework.",
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                dom_markers=["ng-version", "ng-app", "ng-controller", "html[ng-app]", "html[ng-version]"],
                script_sources=[r"angular(\.min)?\.js", r"vendor\.js.*ng-version"],
                inline_markers=["ng.coreTokens", "window.getAllAngularRootElements"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="dom_marker",
                    regex=r"ng-version[:\s]*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="svelte",
            name="Svelte",
            category=TechnologyCategory.frontend,
            subcategory="ui_framework",
            vendor_or_type="Svelte Community",
            website="https://svelte.dev",
            description="Cybernetically enhanced web apps with compile-time reactive components.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                dom_markers=["class*=svelte-"],
                script_sources=[r"svelte"],
                inline_markers=["__svelte__"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="sveltekit",
            name="SvelteKit",
            category=TechnologyCategory.frontend,
            subcategory="framework",
            vendor_or_type="Svelte Community",
            website="https://kit.svelte.dev",
            description="Web development framework for building fast, resilient Svelte applications.",
            implies=["svelte", "javascript"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"/_app/immutable/"],
                stylesheet_hrefs=[r"/_app/immutable/assets/"],
                inline_markers=["__sveltekit_"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="astro",
            name="Astro",
            category=TechnologyCategory.frontend,
            subcategory="framework",
            vendor_or_type="Astro Technology Company",
            website="https://astro.build",
            description="The web framework for content-driven websites.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"Astro(\s*v[0-9\.]+)?"],
                dom_markers=["astro-island"],
                script_sources=[r"/_astro/"],
                stylesheet_hrefs=[r"/_astro/"],
                inline_markers=["astro:hydrate"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"Astro\s*v?([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="gatsby",
            name="Gatsby",
            category=TechnologyCategory.frontend,
            subcategory="framework",
            vendor_or_type="Netlify",
            website="https://www.gatsbyjs.com",
            description="React-based open-source framework for creating websites and apps.",
            implies=["react", "javascript"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"Gatsby\s*([0-9\.]+)?"],
                dom_markers=["id:___gatsby"],
                script_sources=[r"component---src-pages-"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"Gatsby\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="remix",
            name="Remix",
            category=TechnologyCategory.frontend,
            subcategory="framework",
            vendor_or_type="Shopify Inc.",
            website="https://remix.run",
            description="Full stack web framework built on React.",
            implies=["react", "javascript"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                inline_markers=["window.__remixContext", "__remixContext"],
                script_sources=[r"/build/root-"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="jquery",
            name="jQuery",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="OpenJS Foundation",
            website="https://jquery.com",
            description="Fast, small, and feature-rich JavaScript DOM manipulation library.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"jquery(\.min)?\.js(\?.*)?$", r"jquery-([0-9\.]+)(\.min)?\.js"],
                inline_markers=["jQuery.fn.jquery", "window.jQuery"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="script_url",
                    regex=r"jquery-([0-9\.]+)(\.min)?\.js",
                    version_type=VersionType.asset_hint_unverified,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="alpinejs",
            name="Alpine.js",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="Caleb Porzio",
            website="https://alpinejs.dev",
            description="Rugged, minimal tool for composing JavaScript behavior directly in HTML markup.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                dom_markers=["x-data", "x-init", "x-show", "x-bind"],
                script_sources=[r"alpine(\.min)?\.js"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="htmx",
            name="HTMX",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="Big Sky Software",
            website="https://htmx.org",
            description="High power-tools for HTML providing access to modern browser features.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                dom_markers=["hx-get", "hx-post", "hx-target", "hx-swap"],
                script_sources=[r"htmx\.org", r"htmx(\.min)?\.js"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="tailwind",
            name="Tailwind CSS",
            category=TechnologyCategory.frontend,
            subcategory="css_framework",
            vendor_or_type="Tailwind Labs Inc.",
            website="https://tailwindcss.com",
            description="Utility-first CSS framework for rapid modern UI development.",
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                body_classes=[r"flex", r"grid", r"items-center", r"justify-center", r"text-center", r"relative", r"absolute"],
                stylesheet_hrefs=[r"tailwind(\.min)?\.css"],
                script_sources=[r"cdn\.tailwindcss\.com"],
            ),
            limitations="Compiled utility class names only hint at Tailwind unless CDN script or class clustering confirms.",
        )
    )

    add(
        TechnologyFingerprint(
            id="bootstrap",
            name="Bootstrap",
            category=TechnologyCategory.frontend,
            subcategory="css_framework",
            vendor_or_type="Bootstrap Team",
            website="https://getbootstrap.com",
            description="Powerful, extensible frontend toolkit for responsive web development.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                script_sources=[r"bootstrap(\.bundle)?(\.min)?\.js"],
                stylesheet_hrefs=[r"bootstrap(\.min)?\.css"],
                body_classes=[r"container-fluid", r"row", r"col-md-", r"col-lg-"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="script_url",
                    regex=r"bootstrap/([0-9\.]+)/",
                    version_type=VersionType.asset_hint_unverified,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="qwik",
            name="Qwik",
            category=TechnologyCategory.frontend,
            subcategory="framework",
            vendor_or_type="Builder.io",
            website="https://qwik.dev",
            description="Resumable web framework delivering instant page loads through HTML serialization.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                dom_markers=["q:container", "q:id", "q:version", "q:base"],
                script_sources=[r"/build/q-.*\.js"],
                inline_markers=["window.qwikevents"],
            ),
            limitations="Passive identification via Qwik DOM attributes and container serialization markers.",
        )
    )

    add(
        TechnologyFingerprint(
            id="solidjs",
            name="SolidJS",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="Ryan Carniato",
            website="https://www.solidjs.com",
            description="Declarative, efficient, and flexible JavaScript library for building user interfaces.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                dom_markers=["data-hk"],
                script_sources=[r"solid(-js)?(\.production)?\.js"],
                inline_markers=["_$HY"],
            ),
            limitations="Observable via Solid hydration markers and client bundle signatures.",
        )
    )

    add(
        TechnologyFingerprint(
            id="preact",
            name="Preact",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="Jason Miller",
            website="https://preactjs.com",
            description="Fast 3kB alternative to React with the same modern API.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"preact(\.min)?\.js", r"preact/hooks"],
                inline_markers=["preact.h", "window.preact"],
            ),
            limitations="Client-side observation of Preact bundle or runtime global.",
        )
    )

    add(
        TechnologyFingerprint(
            id="bulma",
            name="Bulma",
            category=TechnologyCategory.frontend,
            subcategory="css_framework",
            vendor_or_type="Jeremy Thomas",
            website="https://bulma.io",
            description="Free, open source CSS framework based on Flexbox.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                stylesheet_hrefs=[r"bulma(\.min)?\.css"],
                body_classes=[r"is-primary", r"navbar-item", r"hero-body"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="stylesheet_url",
                    regex=r"bulma/([0-9\.]+)/",
                    version_type=VersionType.asset_hint_unverified,
                )
            ],
            limitations="Identifiable via Bulma stylesheet link or characteristic class patterns.",
        )
    )

    add(
        TechnologyFingerprint(
            id="foundation",
            name="Foundation",
            category=TechnologyCategory.frontend,
            subcategory="css_framework",
            vendor_or_type="ZURB",
            website="https://get.foundation",
            description="Responsive frontend framework family for site and email development.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                stylesheet_hrefs=[r"foundation(\.min)?\.css"],
                script_sources=[r"foundation(\.min)?\.js"],
                dom_markers=["data-dropdown-menu", "data-topbar", "data-off-canvas"],
            ),
            limitations="Identifiable via Foundation stylesheet or data-attribute markers.",
        )
    )

    add(
        TechnologyFingerprint(
            id="material_ui",
            name="Material UI",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="MUI",
            website="https://mui.com",
            description="Comprehensive suite of UI tools implementing Google Material Design in React.",
            implies=["react"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                body_classes=[r"MuiButton-", r"MuiTypography-", r"MuiBox-", r"MuiGrid-"],
                dom_markers=["MuiButton", "MuiTypography", "MuiBox"],
            ),
            limitations="Identifiable via Mui class name conventions on rendered elements.",
        )
    )

    add(
        TechnologyFingerprint(
            id="chakra_ui",
            name="Chakra UI",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="Chakra Systems",
            website="https://chakra-ui.com",
            description="Modular and accessible component library providing building blocks for React apps.",
            implies=["react"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                body_classes=[r"chakra-button", r"chakra-stack", r"chakra-ui-"],
                dom_markers=["chakra-button", "chakra-stack"],
            ),
            limitations="Identifiable via chakra class name conventions.",
        )
    )

    add(
        TechnologyFingerprint(
            id="ant_design",
            name="Ant Design",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="Ant Group",
            website="https://ant.design",
            description="Enterprise-class UI design language and React component library.",
            implies=["react"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                body_classes=[r"ant-btn", r"ant-layout", r"ant-menu", r"ant-row"],
                stylesheet_hrefs=[r"antd(\.min)?\.css"],
                dom_markers=["ant-btn", "ant-layout"],
            ),
            limitations="Identifiable via Ant Design CSS or class name prefixes.",
        )
    )

    add(
        TechnologyFingerprint(
            id="gsap",
            name="GSAP",
            category=TechnologyCategory.frontend,
            subcategory="animation_library",
            vendor_or_type="GreenSock",
            website="https://greensock.com/gsap/",
            description="Professional-grade JavaScript animation library for modern web performance.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"gsap(\.min)?\.js", r"TweenMax(\.min)?\.js", r"ScrollTrigger(\.min)?\.js"],
                inline_markers=["gsap.timeline", "window.gsap", "TweenMax"],
            ),
            limitations="Observable via GreenSock script bundles or runtime global object.",
        )
    )

    add(
        TechnologyFingerprint(
            id="threejs",
            name="Three.js",
            category=TechnologyCategory.frontend,
            subcategory="3d_graphics",
            vendor_or_type="Three.js Authors",
            website="https://threejs.org",
            description="JavaScript 3D library rendering WebGL graphics directly in the browser.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"three(\.min)?\.js", r"three\.module\.js"],
                inline_markers=["THREE.WebGLRenderer", "THREE.Scene"],
            ),
            limitations="Observable via Three.js library script or WebGL scene construction globals.",
        )
    )

    add(
        TechnologyFingerprint(
            id="d3",
            name="D3.js",
            category=TechnologyCategory.frontend,
            subcategory="data_visualization",
            vendor_or_type="Mike Bostock",
            website="https://d3js.org",
            description="JavaScript library for bespoke data-driven document manipulation and visualization.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"d3(\.v[0-9]+)?(\.min)?\.js", r"d3-selection"],
                inline_markers=["d3.select", "window.d3"],
            ),
            limitations="Observable via D3 script reference or d3 global object.",
        )
    )

    add(
        TechnologyFingerprint(
            id="swiper",
            name="Swiper",
            category=TechnologyCategory.frontend,
            subcategory="ui_library",
            vendor_or_type="Vladimir Kharlampidi",
            website="https://swiperjs.com",
            description="Modern mobile touch slider with hardware-accelerated transitions.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                stylesheet_hrefs=[r"swiper(-bundle)?(\.min)?\.css"],
                script_sources=[r"swiper(-bundle)?(\.min)?\.js"],
                dom_markers=["swiper-container", "swiper-slide", "swiper-wrapper"],
            ),
            limitations="Observable via Swiper slider CSS/JS bundles or container markup classes.",
        )
    )

    add(
        TechnologyFingerprint(
            id="lodash",
            name="Lodash",
            category=TechnologyCategory.frontend,
            subcategory="utility_library",
            vendor_or_type="OpenJS Foundation",
            website="https://lodash.com",
            description="Modern JavaScript utility library delivering modularity, performance, and extras.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"lodash(\.min)?\.js"],
                inline_markers=["window._.debounce", "window.lodash"],
            ),
            limitations="Observable via Lodash script reference or runtime namespace.",
        )
    )

    # =========================================================================
    # 4. BACKEND RUNTIMES, SERVERS & FRAMEWORKS
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="nodejs",
            name="Node.js",
            category=TechnologyCategory.backend,
            subcategory="runtime",
            vendor_or_type="OpenJS Foundation",
            website="https://nodejs.org",
            description="Asynchronous event-driven JavaScript backend runtime.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Node\.js|Express"},
            ),
            limitations="Presence of frontend JavaScript does NOT prove backend Node.js.",
        )
    )

    add(
        TechnologyFingerprint(
            id="express",
            name="Express.js",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="OpenJS Foundation",
            website="https://expressjs.com",
            description="Fast, unopinionated, minimalist web framework for Node.js.",
            implies=["nodejs"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Express"},
                cookies=["connect.sid"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="laravel",
            name="Laravel",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Taylor Otwell",
            website="https://laravel.com",
            description="PHP web framework with expressive, elegant syntax.",
            implies=["php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                cookies=["laravel_session", "XSRF-TOKEN"],
                headers={"set-cookie": r"laravel_session="},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="django",
            name="Django",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Django Software Foundation",
            website="https://www.djangoproject.com",
            description="High-level Python web framework encouraging rapid development.",
            implies=["python"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                cookies=["csrftoken", "sessionid"],
                headers={"set-cookie": r"csrftoken="},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="fastapi",
            name="FastAPI",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Tiangolo / Sebastián Ramírez",
            website="https://fastapi.tiangolo.com",
            description="High performance, easy to learn, fast to code, production-ready Python API framework.",
            implies=["python"],
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"server": r"uvicorn"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="ruby_on_rails",
            name="Ruby on Rails",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="David Heinemeier Hansson",
            website="https://rubyonrails.org",
            description="Server-side web application framework written in Ruby.",
            implies=["ruby"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Phusion Passenger|Rails", "x-runtime": r"[0-9\.]+"},
                cookies=["_session_id"],
                dom_markers=["meta[name=csrf-param]"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="spring_boot",
            name="Spring Boot",
            category=TechnologyCategory.backend,
            subcategory="enterprise_framework",
            vendor_or_type="VMware / Broadcom",
            website="https://spring.io/projects/spring-boot",
            description="Enterprise Java web application framework.",
            implies=["java"],
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"x-application-context": r".*"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="nginx",
            name="Nginx",
            category=TechnologyCategory.backend,
            subcategory="web_server",
            vendor_or_type="F5 Inc.",
            website="https://nginx.org",
            description="High-performance HTTP server, reverse proxy, and mail proxy.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"^nginx(/([0-9\.]+))?"},
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="header",
                    regex=r"nginx/([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="apache",
            name="Apache HTTP Server",
            category=TechnologyCategory.backend,
            subcategory="web_server",
            vendor_or_type="Apache Software Foundation",
            website="https://httpd.apache.org",
            description="Robust, commercial-grade open-source HTTP server.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"^Apache(/([0-9\.]+))?"},
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="header",
                    regex=r"Apache/([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="litespeed",
            name="LiteSpeed",
            category=TechnologyCategory.backend,
            subcategory="web_server",
            vendor_or_type="LiteSpeed Technologies",
            website="https://www.litespeedtech.com",
            description="High-performance, high-scalability LiteSpeed Web Server.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"LiteSpeed"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="caddy",
            name="Caddy",
            category=TechnologyCategory.backend,
            subcategory="web_server",
            vendor_or_type="Caddy Authors",
            website="https://caddyserver.com",
            description="Enterprise-ready open source web server with automatic HTTPS written in Go.",
            implies=["go"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"^Caddy"},
            ),
        )
    )

    # =========================================================================
    # 5. HOSTING, CDN & INFRASTRUCTURE
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="cloudflare",
            name="Cloudflare",
            category=TechnologyCategory.hosting,
            subcategory="cdn_proxy",
            vendor_or_type="Cloudflare Inc.",
            website="https://www.cloudflare.com",
            description="Global cloud platform offering CDN, DDoS mitigation, and reverse proxy security.",
            confidence_weight=1.0,
            signatures=FingerprintSignatures(
                headers={"server": r"cloudflare", "cf-ray": r".*", "cf-cache-status": r".*"},
                cookies=["__cf_bm", "cf_clearance"],
                script_sources=[r"challenges\.cloudflare\.com", r"static\.cloudflareinsights\.com"],
            ),
            limitations="Cloudflare proxy does not prove origin hosting provider or backend language.",
        )
    )

    add(
        TechnologyFingerprint(
            id="fastly",
            name="Fastly",
            category=TechnologyCategory.hosting,
            subcategory="cdn_proxy",
            vendor_or_type="Fastly Inc.",
            website="https://www.fastly.com",
            description="Edge cloud platform and content delivery network.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-served-by": r"cache-.*", "fastly-restarts": r".*", "x-fastly-request-id": r".*"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="cloudfront",
            name="Amazon CloudFront",
            category=TechnologyCategory.hosting,
            subcategory="cdn_proxy",
            vendor_or_type="Amazon Web Services Inc.",
            website="https://aws.amazon.com/cloudfront/",
            description="Low-latency content delivery network by Amazon Web Services.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-amz-cf-id": r".*", "x-amz-cf-pop": r".*", "via": r".*CloudFront.*"},
                script_sources=[r"\.cloudfront\.net"],
                stylesheet_hrefs=[r"\.cloudfront\.net"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="vercel",
            name="Vercel",
            category=TechnologyCategory.hosting,
            subcategory="cloud_hosting",
            vendor_or_type="Vercel Inc.",
            website="https://vercel.com",
            description="Frontend cloud platform optimized for modern web frameworks.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-vercel-id": r".*", "server": r"Vercel"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="netlify",
            name="Netlify",
            category=TechnologyCategory.hosting,
            subcategory="cloud_hosting",
            vendor_or_type="Netlify Inc.",
            website="https://www.netlify.com",
            description="Composable web platform for modern web deployment and serverless.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"Netlify", "x-nf-request-id": r".*"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="github_pages",
            name="GitHub Pages",
            category=TechnologyCategory.hosting,
            subcategory="static_hosting",
            vendor_or_type="GitHub Inc.",
            website="https://pages.github.com",
            description="Static site hosting service directly from a GitHub repository.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"GitHub\.com", "x-github-request-id": r".*"},
            ),
        )
    )

    # =========================================================================
    # 6. ANALYTICS & MEASUREMENT
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="google_analytics",
            name="Google Analytics",
            category=TechnologyCategory.analytics,
            subcategory="analytics",
            vendor_or_type="Google Inc.",
            website="https://analytics.google.com",
            description="Web analytics service tracking website traffic and user engagement.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"google-analytics\.com/(analytics|ga)\.js", r"googletagmanager\.com/gtag/js\?id=(G|UA)-"],
                inline_markers=["ga('create'", "gtag('config'"],
                cookies=["_ga", "_gid"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="google_tag_manager",
            name="Google Tag Manager",
            category=TechnologyCategory.analytics,
            subcategory="tag_management",
            vendor_or_type="Google Inc.",
            website="https://tagmanager.google.com",
            description="Tag management system to manage measurement and marketing tags.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"googletagmanager\.com/gtm\.js\?id="],
                inline_markers=["dataLayer.push", "gtm.start"],
                dom_markers=["id:gtm-script"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="plausible",
            name="Plausible Analytics",
            category=TechnologyCategory.analytics,
            subcategory="privacy_analytics",
            vendor_or_type="Plausible Insights",
            website="https://plausible.io",
            description="Lightweight and open-source privacy-focused web analytics.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"plausible\.io/js/script\.js", r"/js/plausible\.js"],
                inline_markers=["window.plausible"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="hotjar",
            name="Hotjar",
            category=TechnologyCategory.ux,
            subcategory="behavior_analytics",
            vendor_or_type="Hotjar Ltd.",
            website="https://www.hotjar.com",
            description="Product experience insights including heatmaps and behavior recordings.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"static\.hotjar\.com/c/hotjar-"],
                inline_markers=["window.hj=window.hj||function", "_hjSettings"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="microsoft_clarity",
            name="Microsoft Clarity",
            category=TechnologyCategory.ux,
            subcategory="behavior_analytics",
            vendor_or_type="Microsoft",
            website="https://clarity.microsoft.com",
            description="Free behavioral analytics tool capturing heatmaps and session playbacks.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"www\.clarity\.ms/tag/"],
                inline_markers=["window.clarity=window.clarity||function"],
            ),
        )
    )

    # =========================================================================
    # 7. ADVERTISING & PIXELS
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="meta_pixel",
            name="Meta Pixel",
            category=TechnologyCategory.advertising,
            subcategory="conversion_pixel",
            vendor_or_type="Meta Platforms Inc.",
            website="https://www.facebook.com/business/tools/meta-pixel",
            description="Conversion measurement and remarketing pixel for Meta ads.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"connect\.facebook\.net/[^/]+/fbevents\.js"],
                inline_markers=["fbq('init'", "fbq('track'"],
            ),
        )
    )

    # =========================================================================
    # 8. PAYMENTS
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="stripe",
            name="Stripe",
            category=TechnologyCategory.payments,
            subcategory="payment_gateway",
            vendor_or_type="Stripe Inc.",
            website="https://stripe.com",
            description="Online payment processing infrastructure for internet businesses.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"js\.stripe\.com/v[23]/"],
                inline_markers=["Stripe(", "elements.create('card'"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="paypal",
            name="PayPal",
            category=TechnologyCategory.payments,
            subcategory="payment_gateway",
            vendor_or_type="PayPal Holdings Inc.",
            website="https://www.paypal.com",
            description="Global digital checkout and electronic payments platform.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"www\.paypal\.com/sdk/js", r"www\.paypalobjects\.com/api/checkout\.js"],
            ),
        )
    )

    # =========================================================================
    # 9. SECURITY & BOT PROTECTION
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="recaptcha",
            name="Google reCAPTCHA",
            category=TechnologyCategory.security,
            subcategory="bot_protection",
            vendor_or_type="Google Inc.",
            website="https://www.google.com/recaptcha",
            description="Security service defending websites from spam and abuse.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"google\.com/recaptcha/api\.js", r"gstatic\.com/recaptcha/"],
                dom_markers=["class:g-recaptcha"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="cloudflare_turnstile",
            name="Cloudflare Turnstile",
            category=TechnologyCategory.security,
            subcategory="bot_protection",
            vendor_or_type="Cloudflare Inc.",
            website="https://www.cloudflare.com/products/turnstile/",
            description="User-friendly, privacy-preserving CAPTCHA replacement.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"challenges\.cloudflare\.com/turnstile/v0/api\.js"],
                dom_markers=["class:cf-turnstile"],
            ),
        )
    )

    # =========================================================================
    # 10. WEB FONTS & ASSETS
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="google_fonts",
            name="Google Fonts",
            category=TechnologyCategory.fonts,
            subcategory="web_fonts",
            vendor_or_type="Google Inc.",
            website="https://fonts.google.com",
            description="Library of open-source and free typography.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                stylesheet_hrefs=[r"fonts\.googleapis\.com/css"],
                link_rels=[r"fonts\.gstatic\.com"],
            ),
        )
    )

    # =========================================================================
    # 11. WORDPRESS EXTENSIONS (Page Builders & Major Plugins)
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="elementor",
            name="Elementor",
            category=TechnologyCategory.cms,
            subcategory="page_builder",
            vendor_or_type="Elementor Ltd.",
            website="https://elementor.com",
            description="Visual drag-and-drop website builder plugin for WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                meta_generators=[r"Elementor\s*([0-9\.]+)?"],
                script_sources=[r"/wp-content/plugins/elementor/"],
                stylesheet_hrefs=[r"/wp-content/plugins/elementor/"],
                body_classes=["elementor-default", "elementor-page"],
                dom_markers=["class:elementor-section"],
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="meta_generator",
                    regex=r"Elementor\s*([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                ),
                VersionExtractionRule(
                    source_type="stylesheet_url",
                    regex=r"/elementor/assets/.*?ver=([0-9\.]+)",
                    version_type=VersionType.asset_hint_unverified,
                ),
            ],
        )
    )

    add(
        TechnologyFingerprint(
            id="elementor_pro",
            name="Elementor Pro",
            category=TechnologyCategory.cms,
            subcategory="page_builder",
            vendor_or_type="Elementor Ltd.",
            website="https://elementor.com/pro/",
            description="Premium extension for Elementor page builder.",
            implies=["elementor", "wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"/wp-content/plugins/elementor-pro/"],
                stylesheet_hrefs=[r"/wp-content/plugins/elementor-pro/"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="yoast_seo",
            name="Yoast SEO",
            category=TechnologyCategory.cms,
            subcategory="seo_plugin",
            vendor_or_type="Yoast BV",
            website="https://yoast.com",
            description="Search engine optimization plugin for WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                html_comments=["<!-- This site is optimized with the Yoast SEO plugin"],
                script_sources=[r"/wp-content/plugins/wordpress-seo/"],
                stylesheet_hrefs=[r"/wp-content/plugins/wordpress-seo/"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="rank_math",
            name="Rank Math SEO",
            category=TechnologyCategory.cms,
            subcategory="seo_plugin",
            vendor_or_type="Rank Math",
            website="https://rankmath.com",
            description="Search engine optimization plugin suite for WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                html_comments=["SEO by Rank Math", "<!-- / SEO by Rank Math"],
                script_sources=[r"/wp-content/plugins/seo-by-rank-math/"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="contact_form_7",
            name="Contact Form 7",
            category=TechnologyCategory.cms,
            subcategory="form_plugin",
            vendor_or_type="Rock Lobster LLC",
            website="https://contactform7.com",
            description="Form management plugin for WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"/wp-content/plugins/contact-form-7/"],
                stylesheet_hrefs=[r"/wp-content/plugins/contact-form-7/"],
                dom_markers=["class:wpcf7-form"],
            ),
        )
    )

    # =========================================================================
    # 4B. ADDITIONAL BACKEND FRAMEWORKS & RUNTIMES
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="nestjs",
            name="NestJS",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="NestJS",
            website="https://nestjs.com",
            description="Progressive Node.js framework for building efficient and scalable server-side applications.",
            implies=["nodejs", "typescript"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Nest(JS)?"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="fastify",
            name="Fastify",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="OpenJS Foundation",
            website="https://fastify.dev",
            description="Fast and low overhead web framework for Node.js.",
            implies=["nodejs"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"Fastify"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="symfony",
            name="Symfony",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="SensioLabs",
            website="https://symfony.com",
            description="High-performance PHP framework for Web development.",
            implies=["php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                cookies=["symfony", "_sf2_attributes"],
                headers={"x-powered-by": r"Symfony"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="codeigniter",
            name="CodeIgniter",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="CodeIgniter Foundation",
            website="https://codeigniter.com",
            description="Powerful PHP framework with a very small footprint.",
            implies=["php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                cookies=["ci_session"],
                headers={"set-cookie": r"ci_session="},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="flask",
            name="Flask",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Pallets",
            website="https://flask.palletsprojects.com",
            description="Lightweight WSGI web application framework in Python.",
            implies=["python"],
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"server": r"Werkzeug"},
                cookies=["session"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="asp_net",
            name="ASP.NET",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Microsoft",
            website="https://dotnet.microsoft.com/apps/aspnet",
            description="Open-source web framework for building modern web apps with .NET.",
            implies=["csharp", "dotnet"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"ASP\.NET", "x-aspnet-version": r".*"},
                cookies=["ASP.NET_SessionId", ".ASPXAUTH"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="asp_net_core",
            name="ASP.NET Core",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Microsoft",
            website="https://dotnet.microsoft.com/apps/aspnet",
            description="Cross-platform, high-performance, open-source framework for building modern web apps.",
            implies=["csharp", "dotnet"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-powered-by": r"ASP\.NET Core"},
                cookies=[".AspNetCore."],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="blazor",
            name="Blazor",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Microsoft",
            website="https://dotnet.microsoft.com/apps/aspnet/web-apps/blazor",
            description="Framework for building interactive client-side web UI with .NET and C#.",
            implies=["csharp", "dotnet"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"_framework/blazor\.(webassembly|server)\.js"],
                dom_markers=["_blazor", "id:components-reconnect-modal"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="phoenix",
            name="Phoenix",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Phoenix Framework",
            website="https://www.phoenixframework.org",
            description="Productive web framework that builds rich, interactive web applications in Elixir.",
            implies=["elixir"],
            confidence_weight=0.85,
            signatures=FingerprintSignatures(
                headers={"x-request-id": r".*"},
                cookies=["_.*_key"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="gin",
            name="Gin",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="Gin Authors",
            website="https://gin-gonic.com",
            description="HTTP web framework written in Go (Golang) featuring high performance.",
            implies=["go"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"\bgin-gonic\b|^gin(/[\d\.]+)?"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="fiber",
            name="Fiber",
            category=TechnologyCategory.backend,
            subcategory="web_framework",
            vendor_or_type="GoFiber",
            website="https://gofiber.io",
            description="Express-inspired web framework written in Go built on top of Fasthttp.",
            implies=["go"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"^Fiber"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="iis",
            name="Microsoft IIS",
            category=TechnologyCategory.backend,
            subcategory="web_server",
            vendor_or_type="Microsoft",
            website="https://www.iis.net",
            description="Flexible, secure and manageable Web server for hosting anything on the Web.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"server": r"Microsoft-IIS(/([0-9\.]+))?"},
            ),
            version_rules=[
                VersionExtractionRule(
                    source_type="header",
                    regex=r"Microsoft-IIS/([0-9\.]+)",
                    version_type=VersionType.explicit_version,
                )
            ],
        )
    )

    # =========================================================================
    # 5B. ADDITIONAL HOSTING, CDN & CLOUD INFRASTRUCTURE
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="akamai",
            name="Akamai",
            category=TechnologyCategory.hosting,
            subcategory="cdn_proxy",
            vendor_or_type="Akamai Technologies",
            website="https://www.akamai.com",
            description="Global content delivery network, cybersecurity, and cloud service company.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                headers={"x-akamai-transformed": r".*", "server": r"AkamaiGHost|AkamaiNetStorage"},
                cookies=["AKA_A2"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="aws",
            name="Amazon Web Services",
            category=TechnologyCategory.hosting,
            subcategory="cloud_infrastructure",
            vendor_or_type="Amazon.com Inc.",
            website="https://aws.amazon.com",
            description="Cloud computing platform offering storage, compute, and scalable backend infrastructure.",
            confidence_weight=0.85,
            default_provenance=EvidenceProvenance.asset_host,
            signatures=FingerprintSignatures(
                headers={"x-amz-request-id": r".*", "x-amz-id-2": r".*"},
                asset_urls=[r"s3\.amazonaws\.com", r"s3-[a-z0-9\-]+\.amazonaws\.com"],
                min_assets_for_detection=2,
            ),
            limitations="AWS asset storage does not establish origin application hosting provider or language.",
        )
    )

    add(
        TechnologyFingerprint(
            id="gcp",
            name="Google Cloud",
            category=TechnologyCategory.hosting,
            subcategory="cloud_infrastructure",
            vendor_or_type="Google Inc.",
            website="https://cloud.google.com",
            description="Suite of cloud computing services running on Google's infrastructure.",
            confidence_weight=0.85,
            default_provenance=EvidenceProvenance.asset_host,
            signatures=FingerprintSignatures(
                headers={"x-goog-generation": r".*", "server": r"Google Frontend"},
                asset_urls=[r"storage\.googleapis\.com"],
                min_assets_for_detection=2,
            ),
            limitations="Google Cloud storage does not establish origin application hosting or backend stack.",
        )
    )

    add(
        TechnologyFingerprint(
            id="azure",
            name="Microsoft Azure",
            category=TechnologyCategory.hosting,
            subcategory="cloud_infrastructure",
            vendor_or_type="Microsoft",
            website="https://azure.microsoft.com",
            description="Cloud computing platform with services for building, testing, deploying, and managing apps.",
            confidence_weight=0.85,
            default_provenance=EvidenceProvenance.asset_host,
            signatures=FingerprintSignatures(
                headers={"x-ms-request-id": r".*", "x-ms-blob-type": r".*"},
                asset_urls=[r"blob\.core\.windows\.net", r"azureedge\.net"],
                min_assets_for_detection=2,
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="firebase_hosting",
            name="Firebase Hosting",
            category=TechnologyCategory.hosting,
            subcategory="cloud_hosting",
            vendor_or_type="Google Inc.",
            website="https://firebase.google.com/products/hosting",
            description="Fast and secure static and dynamic web hosting by Firebase.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-firebase-hosting": r".*", "server": r"^Firebase"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="render",
            name="Render",
            category=TechnologyCategory.hosting,
            subcategory="cloud_hosting",
            vendor_or_type="Render Services Inc.",
            website="https://render.com",
            description="Unified cloud to build and run apps and websites with free SSL and global CDN.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-render-origin-server": r".*", "rndr-id": r".*"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="heroku",
            name="Heroku",
            category=TechnologyCategory.hosting,
            subcategory="cloud_hosting",
            vendor_or_type="Salesforce Inc.",
            website="https://www.heroku.com",
            description="Cloud platform as a service supporting several programming languages.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"via": r".*vegur.*", "server": r"^cowboy$"},
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="digitalocean",
            name="DigitalOcean",
            category=TechnologyCategory.hosting,
            subcategory="cloud_infrastructure",
            vendor_or_type="DigitalOcean LLC",
            website="https://www.digitalocean.com",
            description="Cloud infrastructure provider offering developer-friendly cloud services and Spaces object storage.",
            confidence_weight=0.85,
            default_provenance=EvidenceProvenance.asset_host,
            signatures=FingerprintSignatures(
                headers={"x-do-app-origin": r".*", "server": r"^do-cdn"},
                asset_urls=[r"digitaloceanspaces\.com"],
                min_assets_for_detection=2,
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="bunny_cdn",
            name="Bunny CDN",
            category=TechnologyCategory.hosting,
            subcategory="cdn_proxy",
            vendor_or_type="BunnyWay d.o.o.",
            website="https://bunny.net",
            description="Fast, reliable and high-performance edge storage and content delivery network.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.asset_host,
            signatures=FingerprintSignatures(
                headers={"server": r"BunnyCDN", "b-cache": r".*"},
                asset_urls=[r"b-cdn\.net"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="keycdn",
            name="KeyCDN",
            category=TechnologyCategory.hosting,
            subcategory="cdn_proxy",
            vendor_or_type="Procon DC AG",
            website="https://www.keycdn.com",
            description="High-performance content delivery network built for future speed.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.asset_host,
            signatures=FingerprintSignatures(
                headers={"server": r"keycdn-engine"},
                asset_urls=[r"kxcdn\.com"],
            ),
        )
    )

    # =========================================================================
    # 5C. DATABASES & DATA SERVICES (OBSERVABLE EVIDENCE ONLY)
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="firebase_database",
            name="Firebase Database / Firestore",
            category=TechnologyCategory.database,
            subcategory="cloud_database",
            vendor_or_type="Google Inc.",
            website="https://firebase.google.com/products/firestore",
            description="NoSQL cloud database for storing and syncing data in real time.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                script_sources=[r"firebase-database", r"firebase-firestore"],
                inline_markers=["firebase.database(", "firebase.firestore(", "getFirestore("],
            ),
            limitations="Client-side Firebase SDK observed. Backend database security rules and schema are private.",
        )
    )

    add(
        TechnologyFingerprint(
            id="supabase",
            name="Supabase",
            category=TechnologyCategory.database,
            subcategory="backend_as_a_service",
            vendor_or_type="Supabase Inc.",
            website="https://supabase.com",
            description="Open source Firebase alternative providing Postgres database and client APIs.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                script_sources=[r"@supabase/supabase-js"],
                inline_markers=["createClient(", "supabase.co"],
            ),
            limitations="Supabase client integration observed. Database tables and schema remain private.",
        )
    )

    add(
        TechnologyFingerprint(
            id="algolia",
            name="Algolia",
            category=TechnologyCategory.search,
            subcategory="search_engine",
            vendor_or_type="Algolia Inc.",
            website="https://www.algolia.com",
            description="Flexible search and discovery hosted API engine.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"algoliasearch", r"instantsearch\.js"],
                inline_markers=["algoliasearch(", "instantsearch("],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="meilisearch",
            name="Meilisearch",
            category=TechnologyCategory.search,
            subcategory="search_engine",
            vendor_or_type="Meilisearch",
            website="https://www.meilisearch.com",
            description="Lightning-fast, ultra-relevant, and typo-tolerant search engine.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                script_sources=[r"meilisearch"],
                inline_markers=["new MeiliSearch("],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="elasticsearch",
            name="Elasticsearch",
            category=TechnologyCategory.search,
            subcategory="search_engine",
            vendor_or_type="Elastic N.V.",
            website="https://www.elastic.co",
            description="Distributed, RESTful search and analytics engine.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-elastic-product": r"Elasticsearch"},
            ),
            limitations="Private backend search engine. Detected only when explicitly disclosed in HTTP headers.",
        )
    )

    add(
        TechnologyFingerprint(
            id="opensearch",
            name="OpenSearch",
            category=TechnologyCategory.search,
            subcategory="search_engine",
            vendor_or_type="OpenSearch Community",
            website="https://opensearch.org",
            description="Open-source distributed search and analytics suite.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-opensearch-version": r".*"},
            ),
            limitations="Private search cluster. Detected only when explicitly disclosed in HTTP headers.",
        )
    )

    add(
        TechnologyFingerprint(
            id="mysql",
            name="MySQL",
            category=TechnologyCategory.database,
            subcategory="relational_database",
            vendor_or_type="Oracle Corporation",
            website="https://www.mysql.com",
            description="Open-source relational database management system.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-database": r"MySQL"},
            ),
            limitations="Private relational database. Cannot be identified over HTTP unless explicitly disclosed in response headers.",
        )
    )

    add(
        TechnologyFingerprint(
            id="mariadb",
            name="MariaDB",
            category=TechnologyCategory.database,
            subcategory="relational_database",
            vendor_or_type="MariaDB Foundation",
            website="https://mariadb.org",
            description="Open source relational database made by the original developers of MySQL.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-database": r"MariaDB"},
            ),
            limitations="Private relational database. Detected only when explicitly disclosed.",
        )
    )

    add(
        TechnologyFingerprint(
            id="postgresql",
            name="PostgreSQL",
            category=TechnologyCategory.database,
            subcategory="relational_database",
            vendor_or_type="PostgreSQL Global Development Group",
            website="https://www.postgresql.org",
            description="Powerful, open source object-relational database system.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-database": r"PostgreSQL"},
            ),
            limitations="Private relational database. Detected only when explicitly disclosed.",
        )
    )

    add(
        TechnologyFingerprint(
            id="sqlite",
            name="SQLite",
            category=TechnologyCategory.database,
            subcategory="embedded_database",
            vendor_or_type="SQLite Consortium",
            website="https://www.sqlite.org",
            description="Self-contained, high-reliability, embedded SQL database engine.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-database": r"SQLite"},
            ),
            limitations="Embedded server-side database. Detected only when explicitly disclosed.",
        )
    )

    add(
        TechnologyFingerprint(
            id="mongodb",
            name="MongoDB",
            category=TechnologyCategory.database,
            subcategory="document_database",
            vendor_or_type="MongoDB Inc.",
            website="https://www.mongodb.com",
            description="Document-based distributed database designed for modern apps.",
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                script_sources=[r"realm\.mongodb\.com"],
                headers={"x-database": r"MongoDB"},
            ),
            limitations="Database servers are private. Detected only via public client SDK or explicit header.",
        )
    )

    add(
        TechnologyFingerprint(
            id="redis",
            name="Redis",
            category=TechnologyCategory.database,
            subcategory="in_memory_database",
            vendor_or_type="Redis Ltd.",
            website="https://redis.io",
            description="In-memory data store used as a database, cache, streaming engine, and message broker.",
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                headers={"x-cache-engine": r"Redis", "x-redis-cache": r".*"},
            ),
            limitations="Internal cache/in-memory store. Detected only when disclosed by edge proxy or caching headers.",
        )
    )

    # =========================================================================
    # 6B. ADDITIONAL ANALYTICS & MEASUREMENT
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="adobe_analytics",
            name="Adobe Analytics",
            category=TechnologyCategory.analytics,
            subcategory="enterprise_analytics",
            vendor_or_type="Adobe Systems",
            website="https://business.adobe.com/products/analytics/adobe-analytics.html",
            description="Enterprise web analytics providing actionable insights from customer data.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"assets\.adobedtm\.com", r"omtrdc\.net", r"s_code\.js"],
                inline_markers=["s_account", "s.t()"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="matomo",
            name="Matomo",
            category=TechnologyCategory.analytics,
            subcategory="privacy_analytics",
            vendor_or_type="InnoCraft",
            website="https://matomo.org",
            description="Privacy-friendly open-source web analytics platform giving 100% data ownership.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"/matomo\.js", r"/piwik\.js"],
                inline_markers=["_paq.push"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="fathom",
            name="Fathom Analytics",
            category=TechnologyCategory.analytics,
            subcategory="privacy_analytics",
            vendor_or_type="Conva Ventures Inc.",
            website="https://usefathom.com",
            description="Simple, privacy-first alternative to Google Analytics.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"cdn\.usefathom\.com/script\.js"],
                inline_markers=["fathom.trackPageview"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="mixpanel",
            name="Mixpanel",
            category=TechnologyCategory.analytics,
            subcategory="product_analytics",
            vendor_or_type="Mixpanel Inc.",
            website="https://mixpanel.com",
            description="Product analytics software to track user interactions and conversion funnels.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"cdn\.mxpnl\.com/libs/mixpanel-"],
                inline_markers=["mixpanel.init(", "mixpanel.track("],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="amplitude",
            name="Amplitude",
            category=TechnologyCategory.analytics,
            subcategory="product_analytics",
            vendor_or_type="Amplitude Inc.",
            website="https://amplitude.com",
            description="Digital analytics platform tracking product engagement and retention.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"cdn\.amplitude\.com/libs/amplitude-"],
                inline_markers=["amplitude.getInstance(", "amplitude.init("],
            ),
        )
    )

    # =========================================================================
    # 7B. ADDITIONAL ADVERTISING & MARKETING PIXELS
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="google_ads",
            name="Google Ads Conversion Tracking",
            category=TechnologyCategory.advertising,
            subcategory="conversion_tracking",
            vendor_or_type="Google Inc.",
            website="https://ads.google.com",
            description="Conversion measurement and remarketing tag for Google Ads.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"googleadservices\.com/pagead/conversion\.js", r"googleads\.g\.doubleclick\.net"],
                inline_markers=["gtag('event', 'conversion'"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="tiktok_pixel",
            name="TikTok Pixel",
            category=TechnologyCategory.advertising,
            subcategory="conversion_pixel",
            vendor_or_type="ByteDance Ltd.",
            website="https://ads.tiktok.com",
            description="Conversion measurement and audience optimization pixel for TikTok advertising.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"analytics\.tiktok\.com/i18n/pixel/events\.js"],
                inline_markers=["ttq.load(", "ttq.page("],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="linkedin_insight",
            name="LinkedIn Insight Tag",
            category=TechnologyCategory.advertising,
            subcategory="conversion_pixel",
            vendor_or_type="LinkedIn Corporation",
            website="https://business.linkedin.com/marketing-solutions/insight-tag",
            description="Lightweight JavaScript tag for in-depth campaign reporting and website demographic insights.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"snap\.licdn\.com/li\.lms-analytics/insight\.min\.js"],
                inline_markers=["_linkedin_partner_id"],
            ),
        )
    )

    # =========================================================================
    # 8B. ADDITIONAL USER EXPERIENCE (UX) & ENGAGEMENT
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="fullstory",
            name="FullStory",
            category=TechnologyCategory.ux,
            subcategory="session_replay",
            vendor_or_type="FullStory Inc.",
            website="https://www.fullstory.com",
            description="Digital experience intelligence capturing user session replays and frustration signals.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"edge\.fullstory\.com/s/fs\.js", r"fullstory\.com/s/fs\.js"],
                inline_markers=["window['_fs_host'] = 'fullstory.com'"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="intercom",
            name="Intercom",
            category=TechnologyCategory.ux,
            subcategory="customer_messaging",
            vendor_or_type="Intercom Inc.",
            website="https://www.intercom.com",
            description="Customer messaging platform with live chat, AI bots, and help desk capabilities.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"widget\.intercom\.io/widget/"],
                inline_markers=["Intercom('boot'", "window.Intercom"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="crisp",
            name="Crisp",
            category=TechnologyCategory.ux,
            subcategory="customer_messaging",
            vendor_or_type="Crisp IM SARL",
            website="https://crisp.chat",
            description="All-in-one multichannel customer service and live chat platform.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"client\.crisp\.chat/l\.js"],
                inline_markers=["window.$crisp=[]", "$crisp.push"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="zendesk",
            name="Zendesk",
            category=TechnologyCategory.ux,
            subcategory="customer_support",
            vendor_or_type="Zendesk Inc.",
            website="https://www.zendesk.com",
            description="Customer service software and support ticketing system with live chat widget.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"static\.zdassets\.com/ekr/snippet\.js"],
                inline_markers=["zE('webWidget'", "window.zEmbed"],
            ),
        )
    )

    # =========================================================================
    # 9B. ADDITIONAL PAYMENTS
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="adyen",
            name="Adyen",
            category=TechnologyCategory.payments,
            subcategory="payment_gateway",
            vendor_or_type="Adyen N.V.",
            website="https://www.adyen.com",
            description="Global financial technology platform processing end-to-end payments.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"checkoutshopper-live\.adyen\.com/checkoutshopper/sdk/"],
                inline_markers=["AdyenCheckout("],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="klarna",
            name="Klarna",
            category=TechnologyCategory.payments,
            subcategory="bnpl",
            vendor_or_type="Klarna Bank AB",
            website="https://www.klarna.com",
            description="Buy now, pay later checkout and flexible digital payments.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"x\.klarnacdn\.net/kp/lib/v1/api\.js"],
                inline_markers=["Klarna.Payments.init"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="razorpay",
            name="Razorpay",
            category=TechnologyCategory.payments,
            subcategory="payment_gateway",
            vendor_or_type="Razorpay Software Private Limited",
            website="https://razorpay.com",
            description="Full-stack financial services and payments platform in India.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"checkout\.razorpay\.com/v1/checkout\.js"],
                inline_markers=["Razorpay("],
            ),
        )
    )

    # =========================================================================
    # 10B. ADDITIONAL SECURITY & BOT PROTECTION
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="hcaptcha",
            name="hCaptcha",
            category=TechnologyCategory.security,
            subcategory="bot_protection",
            vendor_or_type="Intuition Machines Inc.",
            website="https://www.hcaptcha.com",
            description="Privacy-focused anti-bot and fraud defense solution.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"js\.hcaptcha\.com/1/api\.js"],
                dom_markers=["class:h-captcha"],
                inline_markers=["hcaptcha.render"],
            ),
        )
    )

    # =========================================================================
    # 11B. EMAIL & MARKETING AUTOMATION
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="mailchimp",
            name="Mailchimp",
            category=TechnologyCategory.marketing,
            subcategory="email_marketing",
            vendor_or_type="Intuit Inc.",
            website="https://mailchimp.com",
            description="Marketing automation and email marketing platform.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"chimpstatic\.com", r"downloads\.mailchimp\.com/js/signup-forms"],
                dom_markers=["id:mc_embed_signup"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="klaviyo",
            name="Klaviyo",
            category=TechnologyCategory.marketing,
            subcategory="marketing_automation",
            vendor_or_type="Klaviyo Inc.",
            website="https://www.klaviyo.com",
            description="Intelligent marketing automation and customer data platform for e-commerce.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"static\.klaviyo\.com/onsite/js/klaviyo\.js"],
                inline_markers=["_learnq.push"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="hubspot_marketing",
            name="HubSpot",
            category=TechnologyCategory.marketing,
            subcategory="inbound_marketing",
            vendor_or_type="HubSpot Inc.",
            website="https://www.hubspot.com",
            description="CRM platform with marketing, sales, and customer service software.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"js\.hs-scripts\.com", r"js\.hs-analytics\.net"],
                inline_markers=["_hsq.push"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="brevo",
            name="Brevo",
            category=TechnologyCategory.marketing,
            subcategory="email_marketing",
            vendor_or_type="Brevo SAS",
            website="https://www.brevo.com",
            description="All-in-one digital marketing and CRM platform for small and medium businesses.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                script_sources=[r"sibautomation\.com"],
                inline_markers=["Brevo.push", "sendinblue.track"],
            ),
        )
    )

    # =========================================================================
    # 12. ADDITIONAL WEB FONTS & ASSETS
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="adobe_fonts",
            name="Adobe Fonts",
            category=TechnologyCategory.fonts,
            subcategory="web_fonts",
            vendor_or_type="Adobe Systems",
            website="https://fonts.adobe.com",
            description="Subscription service for high-quality fonts by Typekit.",
            confidence_weight=0.95,
            default_provenance=EvidenceProvenance.third_party_embed,
            signatures=FingerprintSignatures(
                stylesheet_hrefs=[r"use\.typekit\.net"],
                script_sources=[r"use\.typekit\.net"],
                link_rels=[r"use\.typekit\.net"],
            ),
        )
    )

    # =========================================================================
    # 13. ADDITIONAL WORDPRESS EXTENSIONS (Page Builders, Plugins, Ecommerce)
    # =========================================================================
    add(
        TechnologyFingerprint(
            id="gutenberg",
            name="Gutenberg",
            category=TechnologyCategory.cms,
            subcategory="page_builder",
            vendor_or_type="WordPress Community",
            website="https://wordpress.org/gutenberg/",
            description="The native block editor for WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.90,
            signatures=FingerprintSignatures(
                stylesheet_hrefs=[r"/wp-includes/css/dist/block-library/style\.min\.css", r"block-library"],
                body_classes=["wp-embed-responsive"],
                dom_markers=["class:wp-block-group", "class:wp-block-columns"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="divi",
            name="Divi",
            category=TechnologyCategory.cms,
            subcategory="page_builder",
            vendor_or_type="Elegant Themes",
            website="https://www.elegantthemes.com/gallery/divi/",
            description="Visual website builder theme and plugin for WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                body_classes=["et_divi_builder", "et_pb_pagebuilder_layout"],
                script_sources=[r"/divi/js/", r"et-builder"],
                stylesheet_hrefs=[r"/themes/divi/style\.css"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="wpbakery",
            name="WPBakery",
            category=TechnologyCategory.cms,
            subcategory="page_builder",
            vendor_or_type="WPBakery",
            website="https://wpbakery.com",
            description="Visual Composer drag-and-drop page builder for WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                stylesheet_hrefs=[r"/plugins/js_composer/"],
                script_sources=[r"/plugins/js_composer/"],
                dom_markers=["class:vc_row", "class:wpb_wrapper"],
            ),
        )
    )

    add(
        TechnologyFingerprint(
            id="woocommerce",
            name="WooCommerce",
            category=TechnologyCategory.cms,
            subcategory="ecommerce_cms",
            vendor_or_type="Automattic Inc.",
            website="https://woocommerce.com",
            description="Open-source customizable ecommerce platform built on WordPress.",
            implies=["wordpress", "php"],
            confidence_weight=0.95,
            signatures=FingerprintSignatures(
                body_classes=["woocommerce", "woocommerce-page"],
                script_sources=[r"/plugins/woocommerce/"],
                stylesheet_hrefs=[r"/plugins/woocommerce/"],
                cookies=["woocommerce_items_in_cart", "wp_woocommerce_session_"],
            ),
        )
    )

    return catalog


class TechnologyCatalog:
    """Singleton catalog providing indexed access and query capabilities."""

    _CATALOG: Optional[Dict[str, TechnologyFingerprint]] = None

    @classmethod
    def get_catalog(cls) -> Dict[str, TechnologyFingerprint]:
        if cls._CATALOG is None:
            cls._CATALOG = _build_catalog()
        return cls._CATALOG

    @classmethod
    def get(cls, tech_id: str) -> Optional[TechnologyFingerprint]:
        return cls.get_catalog().get(tech_id)

    @classmethod
    def count(cls) -> int:
        return len(cls.get_catalog())

    @classmethod
    def get_by_category(cls, category: TechnologyCategory) -> List[TechnologyFingerprint]:
        return [fp for fp in cls.get_catalog().values() if fp.category == category]
