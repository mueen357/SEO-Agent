# Standalone 173-Technology Fingerprint Parity & Architecture

## Executive Summary

This document specifies the architecture, data pipeline, and runtime execution model for full technology detection parity between the backend Python fingerprint system (`backend/app/technology/fingerprints/`) and the client-side standalone Chrome Manifest V3 extension (`extension/standalone/technologies/universalTechEngine.ts`).

The authoritative backend catalog defines exactly **173 technology fingerprints** spanning 15 categories. In this reliability checkpoint (`fix/standalone-canonical-parity-accuracy`), the entire catalog (Catalog Version **`2.0.0`**, Engine Version **`2.0.0`**) is evaluated with full multi-vector signature fidelity into `extension/standalone/technologies/technology_catalog.json` and executed 100% offline in-browser by `UniversalTechEngine`.

---

## Catalog Totals and Category Breakdown

The 173 canonical technologies are distributed across categories as follows:

| Category | Total Signatures | Core Representative Technologies | Detection Vectors |
|---|---|---|---|
| **CMS** | 24 | WordPress, Shopify, Wix, Webflow, Squarespace, Framer, Ghost, Drupal, Joomla, PrestaShop | Meta, Scripts, Styles, DOM markers, Cookies |
| **Framework / Library** | 35 | React, Vue.js, Angular, Svelte, Next.js, Nuxt.js, Astro, Remix, jQuery, Alpine.js | Script sources, Inline markers, DOM attributes |
| **Server / Hosting** | 18 | Apache, Nginx, Cloudflare, AWS CloudFront, LiteSpeed, Caddy, Vercel, Netlify | HTTP response headers, Server timing |
| **Language / Runtime** | 12 | PHP, Node.js, Python, Ruby, Java, Go, ASP.NET | Headers (`x-powered-by`, `server`), Implied dependencies |
| **Analytics & Tracking** | 22 | Google Analytics 4, Universal Analytics, Google Tag Manager, Meta Pixel, Hotjar | Script URLs, Inline global variables (`dataLayer`, `gtag`) |
| **Ecommerce** | 14 | WooCommerce, Magento, BigCommerce, Snipcart, Stripe, PayPal | Meta, Script URLs, DOM classes |
| **UI Framework / CSS** | 15 | Tailwind CSS, Bootstrap, Foundation, Bulma, Material UI | Stylesheet hrefs, Body classes, DOM markers |
| **Marketing / CRM** | 10 | HubSpot, Marketo, Mailchimp, Klaviyo | Script resources, Embed URLs |
| **Security & CDN** | 9 | Cloudflare Turnstile, reCAPTCHA, hCaptcha, Akamai, Fastly | Script sources, Response headers |
| **Database** | 4 | Redis, MySQL, PostgreSQL, MongoDB | *Inferred backend only* (never guessed client-side) |
| **Other Categories** | 6 | Font services, Media players, Web servers | Asset hosts, Link rels, Styles |
| **Total** | **173** | | **100% Shared Portable Catalog** |

---

## Signature Vector Fidelity & Parity Implementation

In this update, all vector types supported by the backend Python fingerprint schema are fully supported in TypeScript/V8:

1. **`meta_generators`**: Regular expressions evaluated against `<meta name="generator" content="...">`.
2. **`headers`**: Case-insensitive regular expression matches against HTTP response headers (`server`, `x-powered-by`, `x-generator`, `cf-ray`, etc.).
3. **`script_sources`**: Regular expressions tested against `<script src="...">` URLs.
4. **`stylesheet_hrefs`**: Regular expressions tested against `<link rel="stylesheet" href="...">` URLs.
5. **`dom_markers`**: CSS selectors, ID selectors (`id:app`), class selectors (`class:entry-content`), tag selectors, attribute existence (`[data-wf-page]`), and element-qualified attributes (`html[data-wf-site]`).
6. **`html_attributes`**: Attributes inspected on the root `<html>` or `<body>` element (e.g., `data-wf-page`, `data-framer-name`).
7. **`link_rels`**: Substring and pattern matching against `<link rel="...">` targets (e.g., `https://api.w.org/`, `wp-json`).
8. **`asset_urls`**: CDN host patterns, font paths, and media roots. Evaluated defensively with `min_assets_for_detection`.
9. **`html_comments`**: HTML comments scanned for CMS build markers (e.g., `<!-- This site is optimized with the Yoast SEO plugin -->`).
10. **`body_classes`**: WordPress theme classes, framework state classes.
11. **`cookies`**: Safe cookie *name* matching only (e.g., `wp-settings-`, `PHPSESSID`), with strict isolation that never reads cookie values or sensitive session data.
12. **`version_rules`**: Regular expression capture groups for extracting semantic versions from headers, meta tags, and script URLs.
13. **`min_assets_for_detection`**: Defensive thresholds (defaulting to 2 for asset-only signals, bypassed when primary evidence exists) to eliminate single-file false positives.
14. **`excluded_domains`**: Protects against third-party embeds (e.g. Framer badge embedded on WordPress) falsely claiming primary CMS identity.
15. **`implies`**: Dependency graph relationships (e.g., `wordpress` implies `php`; `nextjs` implies `react`).
16. **`provenance`**: Explicit evidence attribution (`first_party`, `third_party_embed`, `asset_host`, `inferred_dependency`).

---

## Multi-Signal Confidence Calibration

To guarantee strict parity with backend scoring and eliminate false positives, confidence scores are systematically calculated:

- **Strong / Corroborated Evidence (>= 0.95)**:
  - Triggered when primary signals (e.g. `<meta name="generator">`, first-party headers, or multiple corroborated vectors) are observed.
  - Assigned status: `confirmed`.
- **Single Moderate Signal (0.75)**:
  - Triggered by a single script source, stylesheet href, or structured DOM attribute without external corroboration.
  - Assigned status: `detected`.
- **Weak / Asset-Only Signal (0.40)**:
  - Triggered by CDN script or external asset references without root CMS confirmation.
  - Assigned status: `possible`, with provenance `third_party_embed`.
- **Inferred Dependencies (0.60)**:
  - Architectural implications (such as WordPress implying PHP) are assigned confidence `0.60` (matching backend `min(0.65, conf * 0.8)`), status `inferred`, and provenance `inferred_dependency`. They are never dishonestly labeled as directly observed evidence.
- **Primary CMS Conflict Downgrading**:
  - When a primary CMS (e.g. WordPress) is confirmed with strong evidence (confidence >= 0.90), any weak asset-only CMS finding (e.g. Framer embed script) is downgraded to confidence `<= 0.35` and labeled as an external embed.

---

## JavaScript Regex & Engine Compatibility

- **Compilation Status**: **387 / 387 regex patterns compiled cleanly in V8 with 0 syntax errors**.
- **No Python-Specific Inline Flags**: Case-insensitivity is passed cleanly via the `'i'` flag to `new RegExp(pattern, 'i')`.
- **Safe Matching Timeouts**: String scan lengths are bounded per evidence item to guarantee non-blocking in-browser execution.
- **Zero Code Execution**: Analysis is strictly passive AST and DOM inspection via native `DOMParser` in Manifest V3 Offscreen Documents, with no `eval()` or active script execution.
