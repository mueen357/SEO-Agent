# Authoritative 51-Rule SEO Parity Matrix

## Executive Summary

This document establishes the canonical parity baseline between the backend Python SEO rule engine (`backend/app/audit_engine/registry.py`, `backend/app/scoring/rule_mapping.py`) and the Manifest V3 client-side standalone extension (`extension/standalone/audit/clientRules.ts`, `extension/standalone/audit/ruleMapping.ts`).

The authoritative backend registry defines exactly **51 canonical SEO rules** distributed across three canonical scoring families:
- **On-Page SEO**: 16 rules (Scoring policy weight: 35%)
- **Technical SEO**: 22 rules (Scoring policy weight: 40%)
- **Site-Wide SEO**: 13 rules (Scoring policy weight: 25%)

Total: **51 canonical rules**.

In this targeted reliability checkpoint (`fix/standalone-canonical-parity-accuracy`), **14 canonical rules** are fully implemented, verified, and recorded in an authoritative execution ledger. The remaining **37 rules** are formally cataloged as unmapped/pending. Under the honest score coverage architecture, standalone evaluations with partial rule coverage are honestly classified as **`provisional`** (< 80% coverage), **`substantial_coverage`** (>= 80% coverage), or **`fully_evaluated`** (100% completed).

---

## The 14 Implemented Canonical Rules

| # | Canonical Rule ID | Family | Evidence Vector | Standalone Behavior |
|---|---|---|---|---|
| 1 | `ONPAGE_TITLE_PRESENT` | On-Page | HTML `<title>` tag | PASS if `<title>` tag exists and has trimmed text; FAIL if missing or empty |
| 2 | `ONPAGE_TITLE_LENGTH` | On-Page | `<title>` length | PASS if length between 30 and 60 chars; WARNING if < 30 (too short) or > 60 (too long) |
| 3 | `ONPAGE_META_DESC_PRESENT` | On-Page | `<meta name="description">` | PASS if meta description present and non-empty; FAIL if missing |
| 4 | `ONPAGE_META_DESC_LENGTH` | On-Page | Description length | PASS if between 70 and 160 chars; WARNING if < 70 (too short) or > 160 (too long) |
| 5 | `ONPAGE_H1_PRESENCE` | On-Page | `<h1>` element count | PASS if at least one `<h1>` tag exists on page; FAIL if missing |
| 6 | `ONPAGE_H1_MULTIPLE` | On-Page | `<h1>` element count | PASS if exactly 1 `<h1>`; WARNING if multiple `<h1>` tags found |
| 7 | `ONPAGE_CANONICAL_PRESENCE` | On-Page | `<link rel="canonical">` | PASS if canonical tag exists; FAIL if missing |
| 8 | `ONPAGE_CANONICAL_VALID` | On-Page | Canonical URL validity | PASS if canonical href is valid absolute HTTP(S) URL; FAIL if malformed |
| 9 | `ONPAGE_IMAGE_ALT_MISSING` | On-Page | `<img>` elements `alt` | PASS if all content images have non-empty `alt`; FAIL with count of missing alts |
| 10 | `TECH_HTTP_4XX` | Technical | Response status code | PASS if status is not 4xx; FAIL if client error 400–499 |
| 11 | `TECH_HTTP_5XX` | Technical | Response status code | PASS if status is not 5xx; FAIL if server error 500–599 |
| 12 | `TECH_HTTPS_USAGE` | Technical | URL protocol | PASS if `https:`; FAIL if insecure `http:`. Guard: skips fail on localhost / 127.0.0.1 |
| 13 | `SITE_TITLE_DUPLICATE` | Site-Wide | Crawled pages title map | PASS if titles are unique across crawl; FAIL if duplicate titles shared by >= 2 pages |
| 14 | `SITE_NO_OBSERVED_INTERNAL_INLINKS` | Site-Wide | Link graph in-degree | PASS if pages have >= 1 incoming internal link; WARNING if orphan page detected |

---

## Authoritative 51-Rule Parity Matrix

### On-Page SEO (16 Rules — Weight: 35%)

| # | Canonical Rule ID | Version | Browser Feasibility | Standalone Status | Evaluated Result States |
|---|---|---|---|---|---|
| 1 | `ONPAGE_TITLE_PRESENT` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, FAIL |
| 2 | `ONPAGE_TITLE_LENGTH` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, WARNING |
| 3 | `ONPAGE_TITLE_CHARACTER_SET` | 2.0.0 | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED |
| 4 | `ONPAGE_META_DESC_PRESENT` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, FAIL |
| 5 | `ONPAGE_META_DESC_LENGTH` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, WARNING |
| 6 | `ONPAGE_H1_PRESENCE` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, FAIL |
| 7 | `ONPAGE_H1_MULTIPLE` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, WARNING |
| 8 | `ONPAGE_H1_EMPTY` | 2.0.0 | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED |
| 9 | `ONPAGE_CANONICAL_PRESENCE` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, FAIL |
| 10 | `ONPAGE_CANONICAL_VALID` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, FAIL |
| 11 | `ONPAGE_CANONICAL_MULTIPLE` | 2.0.0 | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED |
| 12 | `ONPAGE_ROBOTS_NOINDEX` | 2.0.0 | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED |
| 13 | `ONPAGE_ROBOTS_NOFOLLOW` | 2.0.0 | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED |
| 14 | `ONPAGE_OPENGRAPH_PRESENCE` | 2.0.0 | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED |
| 15 | `ONPAGE_TWITTER_CARD_PRESENCE` | 2.0.0 | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED |
| 16 | `ONPAGE_IMAGE_ALT_MISSING` | 2.0.0 | High (Native DOM) | **Implemented** | PASS, FAIL |

### Technical SEO (22 Rules — Weight: 40%)

| # | Canonical Rule ID | Version | Browser Feasibility | Standalone Status | Evaluated Result States |
|---|---|---|---|---|---|
| 17 | `TECH_HTTP_4XX` | 2.0.0 | High (Fetch HTTP) | **Implemented** | PASS, FAIL |
| 18 | `TECH_HTTP_5XX` | 2.0.0 | High (Fetch HTTP) | **Implemented** | PASS, FAIL |
| 19 | `TECH_HTTPS_USAGE` | 2.0.0 | High (Fetch URL) | **Implemented** | PASS, FAIL |
| 20 | `TECH_CERTIFICATE_VALID` | 2.0.0 | Medium (Web API) | Pending Phase 2 | NOT_EVALUATED |
| 21 | `TECH_TLS_VERSION` | 2.0.0 | Low (Chrome Net API) | Pending Phase 2 | NOT_EVALUATED |
| 22 | `TECH_HSTS_HEADER` | 2.0.0 | High (Fetch Headers) | Pending Phase 2 | NOT_EVALUATED |
| 23 | `TECH_X_CONTENT_TYPE_OPTIONS` | 2.0.0 | High (Fetch Headers) | Pending Phase 2 | NOT_EVALUATED |
| 24 | `TECH_X_FRAME_OPTIONS` | 2.0.0 | High (Fetch Headers) | Pending Phase 2 | NOT_EVALUATED |
| 25 | `TECH_CSP_HEADER` | 2.0.0 | High (Fetch Headers) | Pending Phase 2 | NOT_EVALUATED |
| 26 | `TECH_RESPONSIVE_VIEWPORT` | 2.0.0 | High (Native DOM) | Pending Phase 2 | NOT_EVALUATED |
| 27 | `TECH_MIXED_CONTENT` | 2.0.0 | High (DOM Asset URLs) | Pending Phase 2 | NOT_EVALUATED |
| 28 | `TECH_MOBILE_TOUCH_TARGETS` | 2.0.0 | Medium (DOM Layout) | Pending Phase 2 | NOT_EVALUATED |
| 29 | `TECH_REDIRECT_CHAIN_LENGTH` | 2.0.0 | High (Fetch Follower) | Pending Phase 2 | NOT_EVALUATED |
| 30 | `TECH_CANONICAL_MISMATCH` | 2.0.0 | High (URL Matcher) | Pending Phase 2 | NOT_EVALUATED |
| 31 | `TECH_SCHEMA_ORG_VALIDITY` | 2.0.0 | High (JSON.parse) | Pending Phase 2 | NOT_EVALUATED |
| 32 | `TECH_BREADCRUMB_SCHEMA` | 2.0.0 | High (JSON-LD) | Pending Phase 2 | NOT_EVALUATED |
| 33 | `TECH_COMPRESSION_ENABLED` | 2.0.0 | High (Fetch Headers) | Pending Phase 2 | NOT_EVALUATED |
| 34 | `TECH_CACHE_CONTROL_PRESENT` | 2.0.0 | High (Fetch Headers) | Pending Phase 2 | NOT_EVALUATED |
| 35 | `TECH_TIME_TO_FIRST_BYTE` | 2.0.0 | High (Performance API) | Pending Phase 2 | NOT_EVALUATED |
| 36 | `TECH_DOM_SIZE_ACCEPTABLE` | 2.0.0 | High (DOM Elements) | Pending Phase 2 | NOT_EVALUATED |
| 37 | `TECH_ROBOTS_TXT_VALID` | 2.0.0 | High (Robots Fetch) | Pending Phase 2 | NOT_EVALUATED |
| 38 | `TECH_XML_SITEMAP_VALID` | 2.0.0 | High (DOMParser XML) | Pending Phase 2 | NOT_EVALUATED |

### Site-Wide SEO (13 Rules — Weight: 25%)

| # | Canonical Rule ID | Version | Browser Feasibility | Standalone Status | Evaluated Result States |
|---|---|---|---|---|---|
| 39 | `SITE_TITLE_DUPLICATE` | 2.0.0 | High (IndexedDB Corpus) | **Implemented** | PASS, FAIL |
| 40 | `SITE_META_DESC_DUPLICATE` | 2.0.0 | High (IndexedDB Corpus) | Pending Phase 2 | NOT_EVALUATED |
| 41 | `SITE_H1_DUPLICATE` | 2.0.0 | High (IndexedDB Corpus) | Pending Phase 2 | NOT_EVALUATED |
| 42 | `SITE_CANONICAL_TARGET_INVALID` | 2.0.0 | High (Crawl Status Map) | Pending Phase 2 | NOT_EVALUATED |
| 43 | `SITE_DEAD_ENDS` | 2.0.0 | High (Link Graph) | Pending Phase 2 | NOT_EVALUATED |
| 44 | `SITE_MAX_CRAWL_DEPTH` | 2.0.0 | High (Crawl Tree) | Pending Phase 2 | NOT_EVALUATED |
| 45 | `SITE_SITEMAP_ORPHANS` | 2.0.0 | High (Sitemap vs Crawl) | Pending Phase 2 | NOT_EVALUATED |
| 46 | `SITE_ROBOTS_SITEMAP_LINKED` | 2.0.0 | High (Robots.txt Parser) | Pending Phase 2 | NOT_EVALUATED |
| 47 | `SITE_CLEAN_URL_STRUCTURE` | 2.0.0 | High (URL Regex) | Pending Phase 2 | NOT_EVALUATED |
| 48 | `SITE_CANONICAL_CHAINS` | 2.0.0 | High (Canonical Graph) | Pending Phase 2 | NOT_EVALUATED |
| 49 | `SITE_CYCLIC_REDIRECT_CHAINS` | 2.0.0 | High (Redirect Graph) | Pending Phase 2 | NOT_EVALUATED |
| 50 | `SITE_HTTP_TO_HTTPS_CONSISTENCY` | 2.0.0 | High (URL Scheme Map) | Pending Phase 2 | NOT_EVALUATED |
| 51 | `SITE_NO_OBSERVED_INTERNAL_INLINKS` | 2.0.0 | High (Link Graph In-Degree) | **Implemented** | PASS, WARNING |

---

## Legacy Rule Mapping & Compatibility Layer

To ensure backwards compatibility with historical audits saved in IndexedDB or imported from older versions, `extension/standalone/audit/ruleMapping.ts` implements a bidirectional mapping:

| Legacy Rule ID | Canonical Rule ID(s) | Split Decision Rationale |
|---|---|---|
| `ONPAGE_TITLE_TAG` | `ONPAGE_TITLE_PRESENT`, `ONPAGE_TITLE_LENGTH` | Splits presence check (critical error if missing) from length optimization (warning if short/long). |
| `ONPAGE_META_DESCRIPTION` | `ONPAGE_META_DESC_PRESENT`, `ONPAGE_META_DESC_LENGTH` | Splits presence check from snippet display character length optimization. |
| `ONPAGE_H1_PRIMARY` | `ONPAGE_H1_PRESENCE`, `ONPAGE_H1_MULTIPLE` | Splits missing primary heading from multiple heading structural warnings. |
| `ONPAGE_CANONICAL_URL` | `ONPAGE_CANONICAL_PRESENCE`, `ONPAGE_CANONICAL_VALID` | Splits missing canonical tag from syntax/URL validity. |
| `ONPAGE_IMG_ALT_MISSING` | `ONPAGE_IMAGE_ALT_MISSING` | Exact semantic equivalence; aligns with backend naming convention. |
| `TECH_HTTP_STATUS` | `TECH_HTTP_4XX`, `TECH_HTTP_5XX` | Separates client errors (broken links/unauthorized) from server errors (server outages/500). |
| `TECH_HTTPS_SECURITY` | `TECH_HTTPS_USAGE` | Direct rename matching backend rule registry. |
| `SITE_DUPLICATE_TITLE` | `SITE_TITLE_DUPLICATE` | Direct rename matching backend sitewide rule registry. |
| `SITE_ORPHAN_PAGES` | `SITE_NO_OBSERVED_INTERNAL_INLINKS` | Direct rename matching backend sitewide rule registry. |

The `migrateLegacyFinding()` function seamlessly expands historical findings to canonical findings during audit loads and scorecard computation without mutating persistent historical data destructively.
