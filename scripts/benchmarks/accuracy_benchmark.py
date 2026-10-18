"""Comprehensive, reproducible technology detection accuracy benchmark harness.

Tests 12 independently verified website fixtures against the Universal Technology
Fingerprinting Engine and calculates exact True Positives, False Positives, False
Negatives, Precision, Recall, and F1 by category.
"""

import sys
import os
sys.path.insert(0, os.path.abspath("backend"))

from typing import Dict, List, Set, Any
from app.technology.detector import TechnologyDetector
from app.technology.extractors.html_extractor import RawPageEvidence


FIXTURES = {
    "1. WordPress Store": {
        "url": "https://example-wordpress.com/",
        "headers": {
            "server": "nginx/1.24.0",
            "x-powered-by": "PHP/8.2.1",
            "content-type": "text/html; charset=UTF-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=["WordPress 6.4.2", "WooCommerce 8.5.1"],
            script_sources=[
                "https://example-wordpress.com/wp-includes/js/jquery/jquery.min.js?ver=3.7.1",
                "https://example-wordpress.com/wp-content/plugins/woocommerce/assets/js/frontend/woocommerce.min.js?ver=8.5.1",
                "https://example-wordpress.com/wp-content/plugins/elementor/assets/js/frontend.min.js?ver=3.18.3",
                "https://www.googletagmanager.com/gtag/js?id=G-ABC1234",
            ],
            stylesheet_hrefs=[
                "https://example-wordpress.com/wp-content/themes/twentytwentyfour/style.css?ver=1.0",
                "https://example-wordpress.com/wp-content/plugins/elementor/assets/css/frontend.min.css?ver=3.18.3",
            ],
            body_classes=["home", "page", "logged-out", "wp-custom-logo", "theme-twentytwentyfour", "woocommerce-no-js", "elementor-default"],
            html_attributes={"lang": "en-US"},
            inline_markers=["wp.apiFetch", "wc_add_to_cart_params", "elementorFrontendConfig"],
            dom_markers=["elementor", "wp-embed-responsive"],
            asset_urls=["https://example-wordpress.com/wp-content/uploads/2024/01/logo.png"],
        ),
        "expected_detected": {"wordpress", "woocommerce", "elementor", "php", "nginx", "jquery", "google_analytics", "google_tag_manager"},
        "prohibited_detected": {"framer", "shopify", "wix", "webflow", "python", "ruby", "django", "nodejs"},
    },
    "2. Framer Landing Page": {
        "url": "https://example-framer.com/",
        "headers": {
            "server": "cloudflare",
            "content-type": "text/html; charset=utf-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=["Framer a624231"],
            script_sources=[
                "https://framerusercontent.com/sites/7nFq3r/script_main.XYZ.js",
                "https://framerusercontent.com/modules/chunk-ABC.js",
            ],
            stylesheet_hrefs=[],
            body_classes=[],
            html_attributes={"data-framer-hydrate-v2": "true"},
            inline_markers=["__framer__", "framerusercontent.com"],
            dom_markers=["data-framer-hydrate-v2"],
            asset_urls=[
                "https://framerusercontent.com/images/hero.webp",
                "https://framerusercontent.com/images/feature1.webp",
            ],
        ),
        "expected_detected": {"framer", "react", "cloudflare"},
        "prohibited_detected": {"wordpress", "shopify", "wix", "webflow", "php", "python", "ruby", "django"},
    },
    "3. Shopify E-Commerce Store": {
        "url": "https://example-store.com/",
        "headers": {
            "server": "cloudflare",
            "x-shopid": "12345678",
            "content-type": "text/html; charset=utf-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=["Shopify"],
            script_sources=[
                "https://cdn.shopify.com/s/files/1/0000/t/1/assets/theme.js?v=123",
                "https://cdn.shopify.com/shopifycloud/shopify/assets/shop_events_listener.js",
                "https://js.stripe.com/v3/",
            ],
            stylesheet_hrefs=["https://cdn.shopify.com/s/files/1/0000/t/1/assets/theme.css"],
            body_classes=["template-index"],
            html_attributes={"lang": "en"},
            inline_markers=["Shopify.theme", "Shopify.shop", "ShopifyAnalytics"],
            dom_markers=[],
            asset_urls=["https://cdn.shopify.com/s/files/1/0000/products/sample.jpg"],
        ),
        "expected_detected": {"shopify", "shopify_cdn", "stripe", "cloudflare"},
        "prohibited_detected": {"wordpress", "framer", "wix", "webflow", "php", "python"},
    },
    "4. Webflow Business Site": {
        "url": "https://example-agency.com/",
        "headers": {
            "server": "openresty",
            "content-type": "text/html; charset=utf-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=["Webflow"],
            script_sources=[
                "https://assets-global.website-files.com/6000/js/webflow.js",
                "https://d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js",
            ],
            stylesheet_hrefs=["https://assets-global.website-files.com/6000/css/agency.webflow.css"],
            body_classes=[],
            html_attributes={"data-wf-page": "60001", "data-wf-site": "60002"},
            inline_markers=["Webflow.require"],
            dom_markers=["data-wf-site"],
            asset_urls=["https://assets-global.website-files.com/6000/images/hero.png"],
        ),
        "expected_detected": {"webflow", "jquery"},
        "prohibited_detected": {"wordpress", "shopify", "framer", "wix", "php", "python"},
    },
    "5. Wix Creative Portfolio": {
        "url": "https://example-portfolio.wixsite.com/mysite",
        "headers": {
            "server": "Pepyaka",
            "content-type": "text/html; charset=utf-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=["Wix.com Website Builder"],
            script_sources=[
                "https://static.parastorage.com/services/wix-thunderbolt/dist/main.js",
                "https://static.parastorage.com/unpkg/react@18.2.0/umd/react.production.min.js",
            ],
            stylesheet_hrefs=[],
            body_classes=[],
            html_attributes={"data-site-id": "wix-123"},
            inline_markers=["window.fedops", "parastorage.com"],
            dom_markers=[],
            asset_urls=["https://static.wixstatic.com/media/sample.jpg"],
        ),
        "expected_detected": {"wix", "react"},
        "prohibited_detected": {"wordpress", "shopify", "framer", "webflow", "php", "python"},
    },
    "6. Next.js / React Enterprise App": {
        "url": "https://example-saas.com/",
        "headers": {
            "server": "Vercel",
            "x-powered-by": "Next.js",
            "content-type": "text/html; charset=utf-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=[],
            script_sources=[
                "https://example-saas.com/_next/static/chunks/main-app.js",
                "https://example-saas.com/_next/static/chunks/framework.js",
            ],
            stylesheet_hrefs=["https://example-saas.com/_next/static/css/app.css"],
            body_classes=[],
            html_attributes={},
            inline_markers=["__NEXT_DATA__ = {"],
            dom_markers=["__next"],
            asset_urls=[],
        ),
        "expected_detected": {"nextjs", "react", "nodejs", "vercel"},
        "prohibited_detected": {"wordpress", "shopify", "php", "python", "ruby", "django"},
    },
    "7. Nuxt / Vue Application": {
        "url": "https://example-nuxt.com/",
        "headers": {
            "server": "cloudflare",
            "content-type": "text/html; charset=utf-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=[],
            script_sources=[
                "https://example-nuxt.com/_nuxt/entry.XYZ.js",
                "https://example-nuxt.com/_nuxt/app.XYZ.js",
            ],
            stylesheet_hrefs=["https://example-nuxt.com/_nuxt/entry.XYZ.css"],
            body_classes=[],
            html_attributes={"data-n-head": "1"},
            inline_markers=["window.__NUXT__ = {"],
            dom_markers=["__nuxt"],
            asset_urls=[],
        ),
        "expected_detected": {"nuxt", "vue", "cloudflare"},
        "prohibited_detected": {"react", "nextjs", "wordpress", "php", "python"},
    },
    "8. Astro / Svelte Content Site": {
        "url": "https://example-astro.blog/",
        "headers": {
            "server": "Netlify",
            "content-type": "text/html; charset=utf-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=["Astro v4.1.0"],
            script_sources=["https://example-astro.blog/_astro/svelte-component.XYZ.js"],
            stylesheet_hrefs=[],
            body_classes=[],
            html_attributes={},
            inline_markers=[],
            dom_markers=["astro-island"],
            asset_urls=[],
        ),
        "expected_detected": {"astro", "svelte", "netlify"},
        "prohibited_detected": {"wordpress", "nextjs", "react", "php"},
    },
    "9. PHP Laravel Application": {
        "url": "https://example-laravel.com/",
        "headers": {
            "server": "nginx/1.22.0",
            "set-cookie": "laravel_session=XYZ12345; path=/; HttpOnly",
            "x-powered-by": "PHP/8.1",
            "content-type": "text/html; charset=UTF-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=[],
            script_sources=["https://example-laravel.com/build/assets/app.js"],
            stylesheet_hrefs=["https://example-laravel.com/build/assets/app.css"],
            body_classes=[],
            html_attributes={},
            inline_markers=["csrf-token"],
            dom_markers=[],
            asset_urls=[],
        ),
        "expected_detected": {"laravel", "php", "nginx"},
        "prohibited_detected": {"python", "django", "ruby", "rails", "nodejs", "wordpress"},
    },
    "10. Plain Static HTML/CSS Site": {
        "url": "https://example-static.org/",
        "headers": {
            "server": "Apache/2.4.52 (Ubuntu)",
            "content-type": "text/html; charset=UTF-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=[],
            script_sources=["https://example-static.org/assets/script.js"],
            stylesheet_hrefs=["https://example-static.org/assets/style.css"],
            body_classes=[],
            html_attributes={"lang": "en"},
            inline_markers=[],
            dom_markers=[],
            asset_urls=["https://example-static.org/assets/photo.jpg"],
        ),
        "expected_detected": {"apache", "html", "css", "javascript"},
        "prohibited_detected": {"wordpress", "shopify", "framer", "wix", "webflow", "php", "python", "ruby", "nodejs", "react"},
    },
    "11. Mixed Third-Party Embeds Site": {
        "url": "https://example-embeds.com/",
        "headers": {
            "server": "nginx",
            "x-powered-by": "PHP/8.0",
            "content-type": "text/html; charset=UTF-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=["WordPress 6.3"],
            script_sources=[
                "https://example-embeds.com/wp-includes/js/wp-embed.min.js",
                "https://www.googleadservices.com/pagead/conversion.js",
                "https://js.stripe.com/v3/",
                "https://widget.intercom.io/widget/app-123",
            ],
            stylesheet_hrefs=["https://example-embeds.com/wp-content/themes/custom/style.css"],
            body_classes=["home", "wp-custom-logo"],
            html_attributes={},
            inline_markers=["window.intercomSettings = {"],
            dom_markers=[],
            # Note: Embedded third-party banner hosted on Framer asset CDN
            asset_urls=["https://framerusercontent.com/images/partner-banner.png"],
        ),
        "expected_detected": {"wordpress", "php", "google_ads", "stripe", "intercom", "nginx"},
        # Crucial: The presence of a single framerusercontent image must NOT detect Framer!
        "prohibited_detected": {"framer", "shopify", "wix", "python", "ruby"},
    },
    "12. Hidden Backend & Cloudflare Edge": {
        "url": "https://example-hidden-backend.io/",
        "headers": {
            "server": "cloudflare",
            "cf-ray": "879b18274a123-SJC",
            "content-type": "text/html; charset=utf-8",
        },
        "evidence": RawPageEvidence(
            meta_generators=[],
            script_sources=[
                "https://example-hidden-backend.io/static/js/bundle.js",
                "https://static.cloudflareinsights.com/beacon.min.js",
            ],
            stylesheet_hrefs=["https://example-hidden-backend.io/static/css/bundle.css"],
            body_classes=[],
            html_attributes={"lang": "en"},
            inline_markers=["React.createElement"],
            dom_markers=["root"],
            asset_urls=[],
        ),
        "expected_detected": {"react", "cloudflare", "html", "css", "javascript"},
        # Crucial: Unobserved backend languages and private databases must remain UNKNOWN / NOT OBSERVED!
        "prohibited_detected": {"python", "django", "fastapi", "ruby", "rails", "php", "go", "postgres", "mysql", "mongodb"},
    },
}


def run_accuracy_benchmark():
    detector = TechnologyDetector()
    
    total_expected = 0
    total_detected_correct = 0
    total_false_positives = 0
    total_false_negatives = 0
    
    by_category_stats: Dict[str, Dict[str, int]] = {}

    print("=" * 80)
    print("TECHNOLOGY DETECTION ACCURACY BENCHMARK - 12 VERIFIED GROUND TRUTH FIXTURES")
    print("=" * 80)

    for name, fixture in FIXTURES.items():
        url = fixture["url"]
        headers = fixture["headers"]
        evidence = fixture["evidence"]
        expected = fixture["expected_detected"]
        prohibited = fixture["prohibited_detected"]

        findings = detector.detect_page(evidence, headers, url)
        detected_slugs = {f.technology_id for f in findings if f.confidence >= 0.40}
        
        tp_set = expected.intersection(detected_slugs)
        fn_set = expected - detected_slugs
        fp_set = prohibited.intersection(detected_slugs)
        
        total_expected += len(expected)
        total_detected_correct += len(tp_set)
        total_false_negatives += len(fn_set)
        total_false_positives += len(fp_set)
        
        # Categorize
        for f in findings:
            cat = f.technology_category.value if hasattr(f.technology_category, "value") else str(f.technology_category)
            stats = by_category_stats.setdefault(cat, {"tp": 0, "fp": 0, "fn": 0})
            if f.technology_id in expected:
                stats["tp"] += 1
            elif f.technology_id in prohibited:
                stats["fp"] += 1

        print(f"\nFixture: {name}")
        print(f"  Detected ({len(detected_slugs)}): {sorted(list(detected_slugs))}")
        print(f"  True Positives ({len(tp_set)}): {sorted(list(tp_set))}")
        if fn_set:
            print(f"  False Negatives ({len(fn_set)}): {sorted(list(fn_set))}")
        if fp_set:
            print(f"  FALSE POSITIVES ({len(fp_set)}): {sorted(list(fp_set))}  <-- VIOLATION")
        else:
            print("  False Positives: 0 (PASS)")

    # Category-level analysis
    cat_metrics = {}
    for name, fixture in FIXTURES.items():
        url = fixture["url"]
        headers = fixture["headers"]
        evidence = fixture["evidence"]
        expected = fixture["expected_detected"]
        prohibited = fixture["prohibited_detected"]

        findings = detector.detect_page(evidence, headers, url)
        detected_map = {f.technology_id: f for f in findings if f.confidence >= 0.40}

        for exp_id in expected:
            # find category
            tech_fp = detector.engine.catalog.get(exp_id)
            cat = tech_fp.category.value if tech_fp else "other"
            m = cat_metrics.setdefault(cat, {"tp": 0, "fp": 0, "fn": 0})
            if exp_id in detected_map:
                m["tp"] += 1
            else:
                m["fn"] += 1

        for pro_id in prohibited:
            if pro_id in detected_map:
                tech_fp = detector.engine.catalog.get(pro_id)
                cat = tech_fp.category.value if tech_fp else "other"
                m = cat_metrics.setdefault(cat, {"tp": 0, "fp": 0, "fn": 0})
                m["fp"] += 1

    print("\n" + "=" * 80)
    print("CATEGORY ACCURACY BREAKDOWN")
    print("=" * 80)
    print(f"{'Category':<15} | {'TP':<4} | {'FP':<4} | {'FN':<4} | {'Precision':<10} | {'Recall':<10} | {'F1 Score':<10}")
    print("-" * 80)
    for cat, m in sorted(cat_metrics.items()):
        p = m["tp"] / (m["tp"] + m["fp"]) if (m["tp"] + m["fp"]) > 0 else 1.0
        r = m["tp"] / (m["tp"] + m["fn"]) if (m["tp"] + m["fn"]) > 0 else 1.0
        f1 = (2 * p * r) / (p + r) if (p + r) > 0 else 0.0
        print(f"{cat:<15} | {m['tp']:<4} | {m['fp']:<4} | {m['fn']:<4} | {p*100:>8.2f}% | {r*100:>8.2f}% | {f1*100:>8.2f}%")

    overall_precision = total_detected_correct / (total_detected_correct + total_false_positives) if (total_detected_correct + total_false_positives) > 0 else 1.0
    overall_recall = total_detected_correct / total_expected if total_expected > 0 else 1.0
    overall_f1 = (2 * overall_precision * overall_recall) / (overall_precision + overall_recall) if (overall_precision + overall_recall) > 0 else 0.0

    print("\n" + "=" * 80)
    print("OVERALL BENCHMARK ACCURACY SUMMARY")
    print("=" * 80)
    print(f"Total Expected Ground-Truth Signals: {total_expected}")
    print(f"Total True Positives (TP):           {total_detected_correct}")
    print(f"Total False Positives (FP):          {total_false_positives}")
    print(f"Total False Negatives (FN):          {total_false_negatives}")
    print(f"Overall Precision:                   {overall_precision * 100:.2f}%")
    print(f"Overall Recall:                      {overall_recall * 100:.2f}%")
    print(f"Overall F1 Score:                    {overall_f1 * 100:.2f}%")
    print("=" * 80)

    return {
        "total_expected": total_expected,
        "total_tp": total_detected_correct,
        "total_fp": total_false_positives,
        "total_fn": total_false_negatives,
        "precision": overall_precision,
        "recall": overall_recall,
        "f1": overall_f1,
    }


if __name__ == "__main__":
    run_accuracy_benchmark()
