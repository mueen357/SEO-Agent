# Phase 3 — Task 3.1: Technology & CMS Detection Engine Architecture

## 1. Overview & Architectural Principles

The Technology & CMS Detection Engine is a modular, deterministic, passive fingerprinting subsystem integrated into the AI-Powered Website Audit platform. It analyzes observable evidence collected during crawling and rendering (HTTP response headers, HTML meta tags, script and stylesheet asset paths, DOM marker attributes, inline application bootstrap signatures, and HTML comments) to identify content management systems (CMS), website builders, frontend frameworks, and backend runtimes without executing active network probes or external LLM calls.

### Core Architectural Principles:
1. **Zero Active Probing / 100% Passive Classification:** The engine strictly classifies technologies using evidence already collected and persisted by the crawl pipeline (`CrawlPage.technology_evidence_json`, `CrawlPage.response_headers`). It never initiates unvalidated HTTP requests, never attempts admin logins, never performs directory brute-forcing, and preserves existing Server-Side Request Forgery (SSRF) protections.
2. **Deterministic, Evidence-Based Confidence Scoring:** Every finding is grounded in explicit evidence items with verified weights. Confidence is computed through a mathematically bounded saturation formula with multi-signal dampening and cross-page corroboration.
3. **Technology Coexistence Support:** Modern websites frequently compose layered technology stacks (e.g., WordPress + PHP, Next.js + React, Shopify + custom frontend). The engine detects multiple concurrent technologies without forcing an arbitrary single-winner classification.
4. **Honest Version & Status Reporting:** Versions are only reported when verified from explicit generator metadata, asset query parameters (e.g., `?ver=`), or structured comments. The engine never guesses versions (`version_or_null = None`). Status tiers explicitly distinguish `detected` ($\ge 0.70$), `possible` ($0.40 \le \text{confidence} < 0.70$), and `unknown` ($< 0.40$). Confidence levels follow: `high` ($\ge 0.85$), `medium` ($0.50 \le \text{confidence} < 0.85$), and `low` ($< 0.50$).
5. **Bounded Storage & Deduplication:** Evidence items and affected URLs are deduplicated across multiple crawled pages. Payloads in the relational database are strictly bounded.

---

## 2. Detection Engine Architecture

```
Crawl Pages & Response Headers
             │
             ▼
  ┌───────────────────────────────────────────────┐
  │              Passive Extractors               │
  │  - HTMLTechnologyExtractor (DOM, Meta, Paths) │
  │  - HeaderTechnologyExtractor (Headers, Cookies)│
  └──────────────────────┬────────────────────────┘
                         │ RawPageEvidence
                         ▼
  ┌───────────────────────────────────────────────┐
  │             Technology Registry               │
  │   - Predefined Technology Definitions         │
  │   - Cross-Technology Implications             │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │            Rule-Based Classifiers             │
  │  - CMSClassifiers (WordPress, Shopify, etc.)  │
  │  - FrontendClassifiers (React, Next.js, etc.) │
  │  - BackendClassifiers (PHP, Node.js, etc.)    │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │        WordPress Theme & Plugin Engine        │
  │  - Active vs. Referenced Theme Disambiguation │
  │  - Plugin Path & Query Version Extraction     │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │              TechnologyDetector               │
  │  - Multi-Page Corroboration & Aggregation    │
  │  - Confidence Saturation & Status Tiers       │
  │  - Executive Summary Generation               │
  └──────────────────────┬────────────────────────┘
                         │
                         ▼
  ┌───────────────────────────────────────────────┐
  │             Persistence & API                 │
  │  - AuditTechnology / AuditTechnologySummary   │
  │  - /api/v1/audits/{id}/technologies/*         │
  └───────────────────────────────────────────────┘
```

### Module Breakdown (`backend/app/technology/`):
- `models.py`: Strongly typed dataclasses (`EvidenceItem`, `TechnologyFinding`, `WordPressThemeCandidate`, `WordPressPluginCandidate`, `TechnologySummary`, `AggregatedEvidence`).
- `registry.py`: Canonical definitions for technologies, categories, display names, and implication rules (e.g., Next.js implies React, WordPress implies PHP).
- `extractors/html_extractor.py`: High-performance BeautifulSoup4 parser extracting meta generator tags, script src URLs, stylesheet href URLs, DOM marker attributes (`id`, `data-*`, `ng-*`), inline bootstrap scripts (`__NEXT_DATA__`, `window.__NUXT__`), and HTML comments.
- `extractors/header_extractor.py`: Safe header parser analyzing `X-Powered-By`, `Server`, `X-Generator`, and cookie headers (`laravel_session`, `csrftoken`, `PHPSESSID`). Strips sensitive credentials, auth tokens, and session secrets before recording evidence.
- `classifiers/base.py`: Abstract base classifier defining confidence accumulation, signal dampening, and confidence-to-tier mappings.
- `classifiers/cms.py`: Specialized classifiers for WordPress, Shopify, Wix, Webflow, and Squarespace.
- `classifiers/frontend.py`: Specialized classifiers for React, Next.js, Vue, Nuxt, and Angular.
- `classifiers/backend.py`: Specialized classifiers for PHP, Node.js, Laravel, and Django.
- `wordpress.py`: WordPress asset detector identifying theme slugs, active vs. referenced status, verified theme names, plugin slugs, and query parameter versions (`?ver=`).
- `detector.py`: Central coordination engine running extractors, classifiers, and WordPress analyzers across single or multiple crawled pages.

---

## 3. Technology Coverage & Classifier Signatures

### 3.1 CMS & Website Builders
| Technology | Category | Primary Signals | Implied Tech |
|---|---|---|---|
| **WordPress** | `cms` | Meta generator (`WordPress [ver]`), `/wp-content/`, `/wp-includes/`, `/wp-json/`, `wp-emoji` | PHP |
| **Shopify** | `cms` | `cdn.shopify.com`, `window.Shopify`, `Shopify.theme`, `shopify-features` meta | — |
| **Wix** | `cms` | `static.wixstatic.com`, `wix-warmup-data`, `wix-custom-elements`, `X-Wix-Renderer` | — |
| **Webflow** | `cms` | `data-wf-page`, `data-wf-site`, `assets.website-files.com`, `webflow.js` | — |
| **Squarespace** | `cms` | `static1.squarespace.com`, `squarespace-headers`, `squarespace-context`, `squarespace.com` | — |
| **Unknown / Custom** | `cms` | Evaluated when no known CMS signals are observed; status marked `unknown`. | — |

### 3.2 Frontend Frameworks & Libraries
| Technology | Category | Primary Signals | Implied Tech |
|---|---|---|---|
| **React** | `frontend` | `data-reactroot`, `data-reactid`, `react.development.js`, `react-dom`, framework bundle references | — |
| **Next.js** | `frontend` | `<script id="__NEXT_DATA__">`, `/_next/static/`, `next/dist/client` | React |
| **Vue** | `frontend` | `data-v-[a-f0-9]`, `vue.runtime.js`, `__VUE_SSR_CONTEXT__`, `window.__INITIAL_STATE__` | — |
| **Nuxt** | `frontend` | `window.__NUXT__`, `data-n-head`, `/_nuxt/`, `id="__nuxt"` | Vue |
| **Angular** | `frontend` | `ng-version="[ver]"`, `ng-app`, `ng-model`, `_ngcontent-`, `_nghost-` | — |

### 3.3 Backend Runtimes & Frameworks
| Technology | Category | Primary Signals | Coexistence Notes |
|---|---|---|---|
| **PHP** | `backend` | `X-Powered-By: PHP/[ver]`, `PHPSESSID` cookie, implied by WordPress/Laravel | Coexists with WordPress & Laravel |
| **Node.js** | `backend` | `X-Powered-By: Express`, `connect.sid` cookie, Next.js / Nuxt SSR indicators | Does not guess from client JS alone |
| **Laravel** | `backend` | `laravel_session` cookie, `X-Powered-By: Laravel`, `csrf-token` meta paired with Laravel patterns | Implies PHP |
| **Django** | `backend` | `csrftoken` cookie, `csrfmiddlewaretoken` hidden input | Coexists with Python backends |

---

## 4. Confidence & Evidence Model

### 4.1 Confidence Calculation
Each classifier evaluates observed evidence signals. Individual signals are assigned a raw score weight (ranging from 0.15 for weak hints to 0.75 for authoritative meta generators or bootstrap objects).

Raw scores are combined using an asymptotic diminishing-returns saturation curve:
$$\text{combined} = 1.0 - \prod_{i=1}^n (1.0 - w_i)$$

Where:
- Single weak signals ($w \le 0.25$) are capped at maximum confidence $0.25$ and status `unknown`.
- Multiple weak signals require corroboration to reach status `possible` ($0.40 \le \text{confidence} < 0.70$).
- Confirmed single authoritative signals (e.g. `meta generator="WordPress 6.4"`) yield confidence $\ge 0.70$ and status `detected`.
- Multi-page observation adds up to $+0.15$ cross-page corroboration boost.
- Maximum confidence is mathematically clamped to $[0.0, 1.0]$.

### 4.2 Status & Confidence Tiers
| Confidence Score | Confidence Level | Status | Meaning |
|---|---|---|---|
| $\ge 0.70$ | `high` ($\ge 0.85$) / `medium` ($0.70 - 0.84$) | `detected` | Definite presence supported by strong or corroborated evidence. |
| $0.40 - 0.69$ | `medium` ($0.50 - 0.69$) / `low` ($0.40 - 0.49$) | `possible` | Indicative signals present; plausible but unconfirmed. |
| $< 0.40$ | `low` | `unknown` | Weak or solitary hint; insufficient for confirmation. |

### 4.3 Evidence Item Model
Every finding records the granular evidence trail:
- `evidence_type`: `meta_generator`, `header`, `cookie`, `script_url`, `stylesheet_url`, `dom_marker`, `inline_marker`, `html_comment`.
- `evidence_source`: Exact header name, script URL, tag attribute, or comment snippet.
- `evidence_summary`: Human-readable explanation of why this signal indicates the technology.
- `observed_page_or_url`: The URL where the evidence was captured.
- `weight`: The signal weight contributing to confidence.

---

## 5. WordPress Theme & Plugin Detection Subsystem

### 5.1 WordPress Theme Detection
Observable paths matching `/wp-content/themes/{slug}/` are analyzed:
- **Slug Extraction:** Normalized directory name immediately following `/themes/`.
- **Active vs. Referenced Distinction:**
  - `active`: Identified from the main stylesheet `<link rel="stylesheet" href=".../themes/{slug}/style.css">`, `<body>` class attribute `theme-{slug}`, or exclusive presence as the sole theme across all pages.
  - `referenced`: Identified only from secondary asset references (e.g. image, template partial) without active theme stylesheet confirmation.
  - `unknown`: Ambiguous or unconfirmed theme references.
- **Name Resolution:** Pre-seeded with top verified theme signatures (e.g., Astra, Divi, Elementor Hello, GeneratePress, Twenty Twenty-Four) while preserving exact slug for custom themes. Never invents unverifiable names.
- **Version Extraction:** Extracted from query string parameters (`?ver=X.Y.Z`) on the theme's `style.css`. If unobservable, reported as `None`.

### 5.2 WordPress Plugin Detection
Observable paths matching `/wp-content/plugins/{slug}/` and HTML comments are analyzed:
- **Slug Extraction:** Normalized directory name immediately following `/plugins/`.
- **Name Resolution:** Pre-seeded with verifiable names for top WordPress plugins (e.g., Yoast SEO, WooCommerce, Elementor, Contact Form 7, Wordfence, WP Rocket). Unmapped plugins report `None` for name (never guessed).
- **Version Extraction:** Extracted from versioned asset URLs (`?ver=X.Y.Z`) or structured plugin HTML comments (e.g. `<!-- This site is optimized with the Yoast SEO plugin v21.0 - ... -->`). If absent, reported as `None`.
- **Security Constraint:** Never attempts directory brute-forcing, admin enumeration, or vulnerability scanning. Only public crawl evidence is classified.

---

## 6. Persistence & Relational Data Model

Implemented in Alembic Migration `0008_add_technology_detection_tables.py`:

### 6.1 `crawl_pages` Table Extension
- `technology_evidence_json`: `JSON` nullable column storing page-level extracted raw evidence (generators, scripts, styles, DOM markers, inline signatures, headers).

### 6.2 `audit_technologies` Table
Stores individual detected/possible technologies per audit:
- `id`: `UUID` (Primary Key).
- `audit_id`: `UUID` (Foreign Key $\rightarrow$ `audits.id` on delete CASCADE).
- `technology_id`: `String(50)` (e.g., `wordpress`, `react`, `php`).
- `technology_name`: `String(100)` (e.g., `WordPress`, `React`, `PHP`).
- `technology_category`: `String(50)` (`cms`, `frontend`, `backend`).
- `status`: `String(20)` (`detected`, `possible`, `unknown`).
- `confidence`: `Float` ($0.0 - 1.0$).
- `confidence_level`: `String(20)` (`low`, `medium`, `high`).
- `version_or_null`: `String(50)` nullable.
- `evidence_type`: `String(50)`.
- `evidence_source`: `String(255)`.
- `evidence_summary`: `Text`.
- `observed_page_or_url`: `String(2048)`.
- `detection_method`: `String(50)` (`passive_crawler_evidence`).
- `page_count`: `Integer`.
- `affected_urls_json`: `JSON` list of URLs.
- `evidence_items_json`: `JSON` list of granular evidence dictionaries.
- `created_at`, `updated_at`: `DateTime(timezone=True)`.
- Indexes: `(audit_id, technology_id)` (Unique), `(audit_id, technology_category)`, `(audit_id, status)`.

### 6.3 `audit_technology_summaries` Table
Stores the executive summary for an audit:
- `id`: `UUID` (Primary Key).
- `audit_id`: `UUID` (Foreign Key $\rightarrow$ `audits.id` on delete CASCADE, Unique).
- `primary_cms`: `String(100)` nullable.
- `frontend_frameworks_json`: `JSON` list of string framework names.
- `backend_runtimes_json`: `JSON` list of string runtime names.
- `total_detected`: `Integer`.
- `detected_technologies_count`: `Integer`.
- `possible_technologies_count`: `Integer`.
- `confidence_distribution_json`: `JSON` mapping (`high`, `medium`, `low` counts).
- `wordpress_themes_json`: `JSON` list of theme candidate objects.
- `wordpress_plugins_json`: `JSON` list of plugin candidate objects.
- `created_at`, `updated_at`: `DateTime(timezone=True)`.

---

## 7. API Endpoints

### 7.1 `POST /api/v1/audits/{audit_id}/technologies/analyze`
- **Description:** Triggers idempotent passive technology detection across all crawled pages for the specified audit. If already analyzed, re-analyzes and deterministically updates records.
- **Response:** `200 OK` $\rightarrow$ `AuditTechnologyAnalysisResponse`:
  - `audit_id`: UUID
  - `status`: string
  - `technologies`: list of `TechnologyFindingResponse`
  - `summary`: `TechnologySummaryResponse`
- **Errors:** `404 Not Found` if audit does not exist.

### 7.2 `GET /api/v1/audits/{audit_id}/technologies`
- **Description:** Returns paginated list of technology findings for an audit with optional category and status filters.
- **Parameters:**
  - `category` (optional): `cms`, `frontend`, `backend`
  - `status` (optional): `detected`, `possible`, `unknown`
  - `skip` (default 0), `limit` (default 50, max 100)
- **Response:** `200 OK` $\rightarrow$ `AuditTechnologyListResponse`

### 7.3 `GET /api/v1/audits/{audit_id}/technologies/summary`
- **Description:** Returns the executive technology summary (primary CMS, frontend frameworks, backend runtimes, WordPress themes, WordPress plugins, confidence breakdown).
- **Response:** `200 OK` $\rightarrow$ `TechnologySummaryResponse`
- **Errors:** `404 Not Found` if audit does not exist or has not been analyzed yet.

---

## 8. Chrome Extension Integration

Added TypeScript interfaces and API client methods in `extension/`:
- Interfaces in `extension/types/audit.ts`:
  - `EvidenceItem`
  - `TechnologyFinding`
  - `WordPressThemeCandidate`
  - `WordPressPluginCandidate`
  - `TechnologySummary`
  - `AuditTechnologyAnalysisResponse`
  - `AuditTechnologyListResponse`
- API client functions in `extension/services/api.ts`:
  - `analyzeAuditTechnologies(auditId: string)`
  - `getAuditTechnologies(auditId: string, options?: { category?, status?, skip?, limit? })`
  - `getAuditTechnologySummary(auditId: string)`

*(Note: The full interactive Technology Dashboard UI in the extension is reserved for Phase 3 Task 3.2 per project specifications).*

---

## 9. Security & Safety Compliance

1. **SSRF Protection:** Technology analysis is strictly passive, parsing stored HTML and headers from existing `CrawlPage` records. No outbound HTTP requests are dispatched during analysis.
2. **Credential & Secret Stripping:** The header extractor explicitly filters out `Set-Cookie` tokens, Authorization headers, and sensitive cookies before recording evidence strings.
3. **Regex Injection & Denial-of-Service Defense:** All URL path patterns use strict, anchored, non-backtracking regular expressions (`re.escape` where dynamic strings are involved).
4. **Untrusted Input Sanitization:** All HTML and header values are treated as untrusted text. Attribute values and comments are bounded in length to prevent memory exhaustion.
5. **No Active Directory Scanning:** WordPress theme and plugin detection only classifies assets referenced in parsed DOM or headers; no active enumeration is executed.
