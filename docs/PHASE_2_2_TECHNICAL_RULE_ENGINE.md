# Phase 2 — Task 2.2: Evidence-Based Technical SEO Rule Engine

## Executive Overview
Phase 2.2 extends the AI-Powered Website Audit Chrome Extension with an enterprise-grade, deterministic Technical SEO Rule Engine. Evaluating 22 rigorous technical rules across HTTP status codes, robots directives, robots.txt compliance, XML sitemaps, redirect chains/loops, canonical target status, and HTTPS security, the engine grounds every assessment in real HTTP responses and verifiable crawl artifacts.

All evaluations are fully reproducible, idempotent, and backed by Google Search Central documentation and RFC standards.

---

## Architecture & Design Principles

### 1. Unified Assessment Pipeline
The rule engine evaluates both page-level contexts (`PageAuditContext`) and site-wide audit topology (`SiteAuditContext`):
- **Page-Level Rules:** Inspect HTTP status codes, response headers (`X-Robots-Tag`, `Location`, `Strict-Transport-Security`), meta robots directives, canonical targets, relative/absolute resolution, and URL schemes.
- **Site-Level Rules:** Inspect `robots.txt` availability, sitemap declarations, XML sitemap fetch status, parse errors, and sitewide indexability alignment.

### 2. Transactional & Category-Isolated Execution
- Executing Technical SEO rules replaces only issues belonging to `category="technical"`.
- Existing On-Page issues (`on_page`, `images`, `links`) remain intact and unaltered.
- Cross-category executions via `POST /api/v1/audits/{id}/analyze` or category-specific endpoints (`POST /api/v1/audits/{id}/analyze/technical` and `POST /api/v1/audits/{id}/analyze?category=on_page`) run transactionally within database sessions.

### 3. Strict RFC & Standards Compliance
- **BCP 47 / RFC 5646:** Standardized regex validation supporting 2-3 letter primary language tags (`en`, `cmn`, `ast`), scripts (`zh-Hans`), regions (`en-US`, `es-419`), and variants.
- **Relative Canonical Resolution:** Valid relative canonical URLs (e.g., `/products/item`, `../contact`) resolve safely against the page's base URL and evaluate to `pass`. Malformed strings lacking valid syntax evaluate to `fail`.
- **Proportionate Structural Severities:** Missing H1 tags are designated as `low` severity structural reviews rather than inflated Google ranking penalties.
- **Actionable Findings vs. Total Assessments:** Summaries clearly report actionable findings (`fail` + `warning`) alongside total executed checks (`pass`, `unknown`, `not_applicable`).

---

## Schema & Migration (0005_add_technical_seo_evidence.py)
Reversible migration adding evidence storage:
- `crawl_pages.headers_json`: JSON response headers captured safely during crawling.
- `crawl_pages.canonical_tag_count`: Integer count of `<link rel="canonical">` elements detected.
- `crawl_sitemaps.urls_json`: JSON array of URLs declared inside sitemaps.
- `audits.robots_txt_status`: Status string (`fetched`, `not_found`, `failed`, `skipped`).
- `audits.robots_txt_content`: Raw text content of the site's `robots.txt` file.

---

## REST API Endpoints
- `POST /api/v1/audits/{id}/analyze/technical`: Executes only technical SEO rules.
- `POST /api/v1/audits/{id}/analyze?category=...`: Executes rules for the specified category or all categories.
- `GET /api/v1/audits/{id}/issues?category=technical`: Paginated issue retrieval filtered by category.
- `GET /api/v1/audits/{id}/issues/summary`: Real-time summary breakdown with `total_assessments`, `actionable_findings`, and per-status/category distributions.

---

## Chrome Extension Integration
- Updated `SeoFindingsView.tsx` with dedicated "Run Technical (22 Rules)", "Run On-Page (16 Rules)", and "Run Full Analysis (38 Rules)" buttons.
- Filter pill for "Technical SEO (22 Rules)".
- Modern KPI cards displaying Actionable Issues, Failures, Warnings, Passed Checks, and Total Assessed.
- JSON evidence drawer and direct links to official Google Search Central documentation.
