# Authoritative 51-Rule SEO Parity Matrix

## Executive Summary

This document establishes the canonical parity baseline between the backend Python SEO rule engine and the Manifest V3 client-side standalone extension.

The authoritative backend registry (`backend/app/audit_engine/registry.py`, `backend/app/scoring/rule_mapping.py`) defines exactly **51 SEO rules** distributed across three canonical scoring families:
- **On-Page SEO**: 16 rules (weight: 35%)
- **Technical SEO**: 22 rules (weight: 40%)
- **Site-Wide SEO**: 13 rules (weight: 25%)

Total: **51 canonical rules**.

In Phase 1, **9 rules** are fully implemented and verified in the standalone browser runtime, while **42 rules** have their canonical metadata, schemas, and parity tracking registered in the shared manifest (`extension/standalone/audit/canonical_seo_rules.json`). Scores computed with partial coverage are explicitly marked **`PROVISIONAL`**.

---

## Authoritative 51-Rule Parity Matrix

| # | Canonical Rule ID | Family / Category | Version | Evidence Required | Browser Feasibility | Standalone Status | Evaluated Result States | Dependencies | False-Positive Risks & Guardrails |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `ONPAGE_TITLE_PRESENT` | On-Page | 1.0.0 | HTML `<title>` tag | High (Native DOM) | **Implemented** | PASS, FAIL | DOM Parser | Whitespace-only title tags guarded |
| 2 | `ONPAGE_TITLE_LENGTH` | On-Page | 1.0.0 | `<title>` text content | High (Native DOM) | **Implemented** | PASS, WARN_SHORT, WARN_LONG | `ONPAGE_TITLE_PRESENT` | Character length 30–60 characters enforced |
| 3 | `ONPAGE_TITLE_REPETITIVE` | On-Page | 1.0.0 | Title corpus across site | High (IndexedDB) | Pending Phase 2 | NOT_EVALUATED | Site crawl pages | Repetitive boilerplate phrases ignored |
| 4 | `ONPAGE_META_DESC_PRESENT` | On-Page | 1.0.0 | `<meta name="description">` | High (Native DOM) | **Implemented** | PASS, FAIL | DOM Parser | Case-insensitive attribute matching |
| 5 | `ONPAGE_META_DESC_LENGTH` | On-Page | 1.0.0 | Meta description content | High (Native DOM) | **Implemented** | PASS, WARN_SHORT, WARN_LONG | `ONPAGE_META_DESC_PRESENT` | 70–160 char range checked |
| 6 | `ONPAGE_H1_PRIMARY` | On-Page | 1.0.0 | `<h1>` tags count and content | High (Native DOM) | **Implemented** | PASS, FAIL_MISSING, WARN_MULTIPLE | DOM Parser | Hidden/decorative H1s avoided |
| 7 | `ONPAGE_H1_LENGTH` | On-Page | 1.0.0 | `<h1>` text length | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | `ONPAGE_H1_PRIMARY` | Overly long headings penalized |
| 8 | `ONPAGE_HEADING_HIERARCHY` | On-Page | 1.0.0 | H1, H2, H3 order & counts | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Skipping levels (e.g. H1 -> H3) |
| 9 | `ONPAGE_IMG_ALT_MISSING` | On-Page | 1.0.0 | `<img>` elements `alt` attribute | High (Native DOM) | **Implemented** | PASS, FAIL | DOM Parser | Decorative icons with `aria-hidden` excluded |
| 10 | `ONPAGE_IMG_ALT_REPETITIVE` | On-Page | 1.0.0 | Alt text across page images | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | `ONPAGE_IMG_ALT_MISSING` | Identical alt on multiple images |
| 11 | `ONPAGE_CONTENT_THIN` | On-Page | 1.0.0 | Word count in main text | High (DOM Readability) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Nav/footer text stripped before count |
| 12 | `ONPAGE_KEYWORD_TITLE_ABSENT` | On-Page | 1.0.0 | Page keywords & title | Medium (Text NLP) | Pending Phase 2 | NOT_EVALUATED | Keyword extractor | Stop words excluded |
| 13 | `ONPAGE_KEYWORD_H1_ABSENT` | On-Page | 1.0.0 | Page keywords & H1 | Medium (Text NLP) | Pending Phase 2 | NOT_EVALUATED | Keyword extractor | Stemming differences |
| 14 | `ONPAGE_KEYWORD_FIRST_P` | On-Page | 1.0.0 | First paragraph text | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Intro hero text vs first `<p>` |
| 15 | `ONPAGE_KEYWORD_STUFFING` | On-Page | 1.0.0 | Term frequency distribution | High (Text Stats) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Density threshold > 4.5% |
| 16 | `ONPAGE_FAVICON_PRESENT` | On-Page | 1.0.0 | `<link rel="icon">` | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Default `/favicon.ico` fallback check |
| 17 | `TECH_HTTPS_SECURITY` | Technical | 1.0.0 | URL protocol (`https:`) | High (Fetch URL) | **Implemented** | PASS, FAIL | Fetch observation | Mixed content warnings |
| 18 | `TECH_HTTP_STATUS` | Technical | 1.0.0 | Response status code | High (Fetch HTTP) | **Implemented** | PASS, FAIL | Fetch observation | 200 vs 301/302 redirects vs 404/500 |
| 19 | `TECH_ROBOTS_TXT` | Technical | 1.0.0 | `/robots.txt` content & syntax | High (HTTP Fetch) | **Implemented** | PASS, WARN, FAIL | Direct fetch | Empty or disallow-all directives |
| 20 | `TECH_ROBOTS_TXT_VALID` | Technical | 1.0.0 | User-agent block syntax | High (String Parser) | Pending Phase 2 | NOT_EVALUATED | `TECH_ROBOTS_TXT` | Parser edge cases |
| 21 | `TECH_XML_SITEMAP_PRESENT` | Technical | 1.0.0 | `/sitemap.xml` presence | High (HTTP Fetch) | Pending Phase 2 | NOT_EVALUATED | Direct fetch | Sitemap index recursion |
| 22 | `TECH_XML_SITEMAP_VALID` | Technical | 1.0.0 | XML schema conformance | High (DOMParser XML) | Pending Phase 2 | NOT_EVALUATED | `TECH_XML_SITEMAP_PRESENT` | Namespace validation |
| 23 | `TECH_CANONICAL_SPECIFIED` | Technical | 1.0.0 | `<link rel="canonical">` | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Relative vs absolute canonical URL |
| 24 | `TECH_CANONICAL_SELF_REF` | Technical | 1.0.0 | Canonical URL matches self | High (URL Matcher) | **Implemented** | PASS, WARN | DOM Parser, Page URL | Trailing slash & query param normalizer |
| 25 | `TECH_NOINDEX_LEAK` | Technical | 1.0.0 | `<meta name="robots" content="noindex">` | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Accidental production noindex |
| 26 | `TECH_NOFOLLOW_DIRECTIVE` | Technical | 1.0.0 | Meta robots nofollow | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Page vs link-level nofollow |
| 27 | `TECH_OPENGRAPH_TAGS` | Technical | 1.0.0 | `og:title`, `og:image`, `og:url` | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Partial OG tags vs complete bundle |
| 28 | `TECH_TWITTER_CARDS` | Technical | 1.0.0 | `twitter:card`, `twitter:title` | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Fallback to OG tags |
| 29 | `TECH_STRUCTURED_DATA_SYNTAX` | Technical | 1.0.0 | `<script type="application/ld+json">` | High (JSON.parse) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Malformed JSON vs schema type |
| 30 | `TECH_STRUCTURED_DATA_TYPE` | Technical | 1.0.0 | Schema.org `@type` validation | High (JSON-LD Object) | Pending Phase 2 | NOT_EVALUATED | JSON-LD Parser | Organization, WebSite, Article |
| 31 | `TECH_VIEWPORT_MOBILE` | Technical | 1.0.0 | `<meta name="viewport">` | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | `width=device-width` check |
| 32 | `TECH_HREFLANG_PRESENT` | Technical | 1.0.0 | `<link rel="alternate" hreflang="...">` | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Language-country code validity |
| 33 | `TECH_HREFLANG_XDEFAULT` | Technical | 1.0.0 | `hreflang="x-default"` check | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | `TECH_HREFLANG_PRESENT` | Multi-language sites without default |
| 34 | `TECH_RESPONSE_TIME_LATENCY` | Technical | 1.0.0 | HTTP fetch response duration | High (Performance API) | Pending Phase 2 | NOT_EVALUATED | Fetch observation | TTFB vs full payload download |
| 35 | `TECH_CONTENT_ENCODING` | Technical | 1.0.0 | `Content-Encoding: gzip/br` | High (Headers) | Pending Phase 2 | NOT_EVALUATED | Fetch headers | Missing compression |
| 36 | `TECH_STRICT_TRANSPORT_SEC` | Technical | 1.0.0 | `Strict-Transport-Security` header | High (Headers) | Pending Phase 2 | NOT_EVALUATED | Fetch headers | `includeSubDomains` & `max-age` |
| 37 | `TECH_MIXED_CONTENT_BLOCKS` | Technical | 1.0.0 | `http://` resources on HTTPS | High (URL Scanner) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | Active vs passive mixed content |
| 38 | `TECH_HTML_LANG_ATTRIBUTE` | Technical | 1.0.0 | `<html lang="...">` present | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED | DOM Parser | ISO 639-1 code validity |
| 39 | `SITE_CANONICAL_CONSISTENCY` | Site-Wide | 1.0.0 | Canonical URL consistency across site | High (IndexedDB crawl) | **Implemented** | PASS, WARN | Crawl repository | Cross-page link targets vs canonicals |
| 40 | `SITE_DUPLICATE_TITLE` | Site-Wide | 1.0.0 | Title duplication across pages | High (Corpus analysis) | Pending Phase 2 | NOT_EVALUATED | Full crawl corpus | Paginated pages with identical titles |
| 41 | `SITE_DUPLICATE_META_DESC` | Site-Wide | 1.0.0 | Meta description uniqueness | High (Corpus analysis) | Pending Phase 2 | NOT_EVALUATED | Full crawl corpus | Template descriptions across catalog |
| 42 | `SITE_DUPLICATE_H1` | Site-Wide | 1.0.0 | H1 duplication across site | High (Corpus analysis) | Pending Phase 2 | NOT_EVALUATED | Full crawl corpus | Home vs category headers |
| 43 | `SITE_ORPHAN_PAGES` | Site-Wide | 1.0.0 | Link graph in-degree = 0 | High (Link Graph) | Pending Phase 2 | NOT_EVALUATED | Link graph | Seed URL excluded from orphan check |
| 44 | `SITE_DEEP_CLICK_DEPTH` | Site-Wide | 1.0.0 | Crawl depth > 3 from seed | High (Crawl Tree) | Pending Phase 2 | NOT_EVALUATED | Crawl tree | Flat vs deep site hierarchy |
| 45 | `SITE_INTERNAL_BROKEN_LINKS` | Site-Wide | 1.0.0 | Internal 404/500 link targets | High (Crawl Statuses) | Pending Phase 2 | NOT_EVALUATED | Crawl status map | Anchors & mailto ignored |
| 46 | `SITE_REDIRECT_CHAINS` | Site-Wide | 1.0.0 | > 1 hop redirects | High (Fetch Follower) | Pending Phase 2 | NOT_EVALUATED | Fetch redirect log | Hop count > 2 flagged |
| 47 | `SITE_REDIRECT_LOOPS` | Site-Wide | 1.0.0 | Circular redirect loops | High (URL History) | Pending Phase 2 | NOT_EVALUATED | Fetch redirect log | Loop detection |
| 48 | `SITE_UNIFORM_PROTOCOL` | Site-Wide | 1.0.0 | Mixed HTTP / HTTPS URLs | High (URL Corpus) | Pending Phase 2 | NOT_EVALUATED | URL Corpus | Non-standard port handling |
| 49 | `SITE_UNIFORM_HOST` | Site-Wide | 1.0.0 | Consistent www vs non-www | High (Host Normalizer) | Pending Phase 2 | NOT_EVALUATED | Host Normalizer | Subdomain aliases |
| 50 | `SITE_HREFLANG_RETURN_TAGS` | Site-Wide | 1.0.0 | Bi-directional hreflang verification | High (Graph Matcher) | Pending Phase 2 | NOT_EVALUATED | Multi-page crawl | Missing reverse confirmation tag |
| 51 | `SITE_404_PAGE_QUALITY` | Site-Wide | 1.0.0 | Custom 404 page status & content | High (Synthetic Request) | Pending Phase 2 | NOT_EVALUATED | Direct probe | Soft 404 (returning 200 with error text) |

---

## Shared Rule Metadata Manifest

The canonical definitions are exported from Python `RuleRegistry` to:
`extension/standalone/audit/canonical_seo_rules.json`

This shared manifest ensures:
1. **Identical Rule IDs**: No camelCase or custom naming deviations between backend and client.
2. **Version Pinning**: Every rule is tracked at version `1.0.0`.
3. **Exact Scoring Weights**: On-Page 35%, Technical 40%, Site-Wide 25%.
4. **Honest Coverage Enforcement**: The standalone engine reports progress against all 51 rules, keeping scores labeled `PROVISIONAL` until 80%+ coverage is reached.
