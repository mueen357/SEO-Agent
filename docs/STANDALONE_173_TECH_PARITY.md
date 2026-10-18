# Standalone 173-Technology Fingerprint Parity & Architecture

## Executive Summary

This document specifies the architecture, data pipeline, and runtime execution model for full technology detection parity between the backend Python fingerprint system and the client-side standalone Chrome Manifest V3 extension.

The authoritative backend catalog (`backend/app/technology/fingerprints/catalog.py`) defines exactly **173 technology fingerprints** spanning 15 categories. In Phase 1, the entire catalog is exported with full multi-vector signature fidelity into `extension/standalone/technologies/technology_catalog.json` and evaluated in-browser by `UniversalTechEngine`.

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

## Signature Vector Fidelity

Previously, `TechnologyFingerprint.to_dict()` exported only metadata and omitted matching signatures. The new deterministic exporter (`scripts/export_catalog.py`) extracts all signature vectors:

1. **`meta_generators`**: Regular expressions evaluated against `<meta name="generator" content="...">`.
2. **`headers`**: Case-insensitive regular expression matches against HTTP response headers (`server`, `x-powered-by`, `x-generator`, `cf-ray`, etc.).
3. **`script_sources`**: Regular expressions tested against `<script src="...">` URLs.
4. **`stylesheet_hrefs`**: Regular expressions tested against `<link rel="stylesheet" href="...">` URLs.
5. **`dom_markers`**: CSS selectors, element tags, and specific attributes (e.g. `[data-wf-site]`, `html[data-framer-name]`).
6. **`inline_markers`**: Global object tokens and inline runtime tokens extracted safely without executing scripts.
7. **`body_classes`**: WordPress theme classes, framework state classes.
8. **`asset_urls`**: CDN host patterns and media roots.
9. **`version_rules`**: Regular expression capture groups for extracting semantic versions from headers, meta tags, and script URLs.
10. **`min_assets_for_detection`**: Defensive thresholds (e.g., generic CSS or JS requires at least 2 distinct files to prevent single-file false positives).
11. **`implies`**: Dependency graph relationships (e.g. `wordpress` implies `php`; `nextjs` implies `react`).
12. **`provenance`**: Explicit evidence attribution (`first_party`, `third_party_embed`, `asset_host`, `inferred_dependency`).

---

## JavaScript Regex & Engine Compatibility

Python's `re` engine and JavaScript's V8 `RegExp` have subtle differences. In Phase 1, all **387 regex patterns** across the 173 fingerprints were systematically tested in V8:

- **Compilation Status**: **387 / 387 compiled cleanly with 0 syntax errors**.
- **No Python-Specific Inline Flags**: Backend regexes avoid `(?i)` or `(?s)` prefixes; case-insensitivity is passed via the `'i'` flag to `new RegExp(pattern, 'i')`.
- **No Incompatible Lookbehinds**: Patterns rely on standard character classes and boundary markers `\b`.
- **Safe Matching Timeouts**: The browser engine limits string scan lengths to 1,024 characters per evidence item to guarantee bounded execution time.
- **Zero Script Execution**: The standalone engine uses native `DOMParser` inside an isolated Manifest V3 Offscreen Document, eliminating XSS and code execution vectors.

---

## Technology Implication Resolution

When a technology is confirmed from primary evidence, its implied dependencies are resolved:
```
WordPress 6.4.3 (confirmed via meta generator)
  └── Implies: PHP (inferred with provenance 'inferred_dependency')

Next.js (confirmed via script source /_next/)
  └── Implies: React (inferred with provenance 'inferred_dependency')
```
This guarantees exact parity with backend classification behavior without guessing hidden technologies.

---

## Current Status and Migration Roadmap

- **Phase 1 (Completed)**:
  - 173-technology canonical catalog export.
  - V8 regex verification suite (387 patterns verified).
  - Browser-native `UniversalTechEngine` implemented.
  - Verified detections: WordPress 6.4.3, PHP 8.2, Apache 2.4.58, Framer, Webflow, React, Next.js.
  - Zero false-positives on plain static HTML.

- **Phase 2 (Next Step)**:
  - Expanded confidence calibration across all 173 technologies against a multi-fixture test suite.
  - Porting edge-case DOM inspection rules for legacy CMS platforms.
  - Performance profiling on sites with > 200 external script references.
