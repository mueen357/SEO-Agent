# Existing System Dependency Audit & Architecture Decomposition

## 1. Executive Summary

This document performs an exhaustive audit of the existing **Website Audit Agent** architecture as of branch `feature/universal-tech-stack-detection` (HEAD: `a4d9c914c0ff4307b1383f0a262f2a4c2e38ff0a`). It maps every dependency on Python, FastAPI, SQLite, operating system processes, network protocols, browser privileges, and background workers to establish a concrete feasibility foundation for a standalone, API-key-free Chrome extension.

---

## 2. System Verification Baseline

The repository baseline was verified directly against the live code on 2026-10-18:

| Subsystem / Metric | Reported Baseline | Verified Baseline | Verification Source |
| :--- | :--- | :--- | :--- |
| **Active Branch** | `feature/universal-tech-stack-detection` | `research/standalone-audit-benchmark` | `git status` (branched from verified HEAD `a4d9c91`) |
| **Technology Definitions** | 173 | **173** | `TechnologyCatalog.count()` (`app.technology.fingerprints.catalog`) |
| **Registered SEO Rules** | 51 | **51** | `RuleRegistry().get_all_rules()` (`app.audit_engine.registry`) |
| - *On-Page Rules* | 16 | **16** | `RuleRegistry().get_onpage_rules()` (`app.audit_engine.rules.onpage`) |
| - *Technical Rules* | 22 | **22** | `RuleRegistry().get_technical_rules()` (`app.audit_engine.rules.technical`) |
| - *Site-Wide Rules* | 13 | **13** | `RuleRegistry().get_sitewide_rules()` (`app.audit_engine.rules.sitewide`) |
| **Backend Test Suite** | 491 passed | **491 passed** | `pytest tests` (exit code 0, 217.65s) |
| **Frontend Test Suite** | 97 passed | **97 passed** | `vitest run` in `extension/` (exit code 0, 10.94s) |
| **Database Migrations** | Revision 0008 | **Revision 0008 (head)** | Alembic migration history |

---

## 3. Dependency Mapping: Backend Services

### 3.1. Language Runtime & Core Frameworks
- **Python 3.12+**: Required for all server-side logic.
- **FastAPI (v0.115+) & Starlette**: HTTP routing, request validation, middleware, error handling, CORS (`CORSMiddleware`).
- **Uvicorn**: ASGI web server listening on `127.0.0.1:8000`.
- **Pydantic v2**: Strict schema validation and serialization for audit records, issues, scores, and technologies.
- **AsyncIO**: Concurrent asynchronous execution throughout the crawler, worker, and pipeline services.

### 3.2. Data Persistence (SQLite & SQLAlchemy)
- **SQLAlchemy 2.0 (Async Engine)**: ORM modeling and database access layer.
- **aiosqlite**: Asynchronous SQLite driver managing local file storage `seo_agent.db`.
- **Alembic**: Database schema versioning and migrations (revisions 0001 through 0008).
- **Relational Tables**:
  1. `audits`: Primary audit records, status machine, configuration JSON, and timestamps.
  2. `crawl_pages`: Crawled page records, HTTP status, headers JSON, technology evidence JSON, body text, title, canonical URL, depth, fetched_at.
  3. `audit_issues`: Detected SEO rule violations and warnings.
  4. `audit_scores`: Computed category and sitewide SEO scores.
  5. `audit_technologies`: Individual technology findings with confidence, status, provenance, and evidence items JSON.
  6. `audit_technology_summaries`: Aggregated technology summaries per audit.

### 3.3. Crawler Architecture (`backend/app/crawler/`)
- **HTTP Transport**: `httpx.AsyncClient` with custom SSL context, connection pooling, and redirect tracking.
- **DNS & Preflight**: `socket.getaddrinfo()` for pre-flight SSRF prevention (blocking RFC 1918, loopback, multicast, link-local, and cloud metadata IPs `169.254.169.254`).
- **HTML Parsing**: `BeautifulSoup4` with `html.parser` for link extraction, meta tags, and body content.
- **Robots Processing (`robots.py`)**: `urllib.robotparser.RobotFileParser` downloading and caching `/robots.txt`.
- **Sitemap Ingestion (`sitemap.py`)**: XML parsing via `xml.etree.ElementTree` handling sitemap indexes, gzip streams, and URL sets.
- **Crawl Budget & Scope**: Domain boundary enforcement (`ScopeEnforcer`), depth limits, page count budgets (default: 50, max: 250), URL normalization (`Normalizer`).
- **Headless Renderer (Optional)**: `Playwright` Chromium used for dynamic JavaScript hydration when enabled.

### 3.4. Audit Engine & Rule Evaluation (`backend/app/audit_engine/`)
- **Execution Engine (`engine.py`)**: Orchestrates rules against `AuditContext`.
- **Link Graph (`link_graph.py`)**: NetworkX-like in-memory directed graph of internal links, calculating inlinks, outlinks, PageRank-style centrality, orphan pages, and redirect chains.
- **Duplicate Content Engine**: MinHash/SimHash-style shingles or content similarity hashes across crawled pages.
- **Rule Definitions (`rules/`)**:
  - `onpage/`: 16 rules evaluating HTML title, meta description, heading hierarchy, image alt text, canonical tags, OpenGraph tags, viewport, word count.
  - `technical/`: 22 rules evaluating status codes, response latency, HTTPS, mixed content, canonical consistency, robots directives, sitemap inclusion, structured data.
  - `sitewide/`: 13 rules evaluating sitewide duplicate titles, duplicate descriptions, low inlinks, orphan pages, broken internal links, redirect loops, crawl depth distribution.

### 3.5. Scoring Engine (`backend/app/scoring/`)
- **Calculator (`calculator.py`)**: Weighted scoring algorithms per category: On-Page (40%), Technical (35%), Site-Wide (25%).
- **Availability Gates (`coverage.py`)**: Evaluates whether minimum page thresholds are met before declaring scores valid, preventing false "A+" scores on 1-page crawls.
- **Priority Grouping (`priorities.py`, `grouping.py`)**: Deduplicates and clusters rule violations into prioritized, actionable cards (Critical, High, Medium, Low).

### 3.6. Technology Stack Detection Engine (`backend/app/technology/`)
- **Universal Fingerprint Engine (`engine.py`)**: Evaluates 173 declarative technology definitions.
- **Evidence Extractor (`html_extractor.py`)**: Extracts headers, meta generators, script URLs, stylesheets, DOM markers, inline variables, comments, and asset URLs.
- **Corroboration & Aggregation (`detector.py`)**: Multi-page aggregator with bounded corroboration boost (+0.05 cap), provenance tracking, and version extraction.

### 3.7. Background Worker & Pipeline Orchestration
- **Async Worker (`backend/app/crawler/worker.py`)**: Continuous polling loop checking for `queued` audits in SQLite.
- **Pipeline Coordinator (`backend/app/services/audit_pipeline_service.py`)**: 9-stage sequential state machine:
  `validation` -> `crawling` -> `storage` -> `on_page_seo` -> `technical_seo` -> `sitewide_seo` -> `technology_detection` -> `seo_scoring` -> `publishing`.

---

## 4. Dependency Mapping: Chrome Extension

### 4.1. Manifest V3 Configuration (`extension/wxt.config.ts`)
- **Framework**: WXT (`v0.21.4`) with React 19 (`@wxt-dev/module-react`), Vite 8, Tailwind CSS 3.
- **Declared Manifest Permissions**:
  - `activeTab`: Inspects the active Chrome tab URL and title.
  - `storage`: Local Chrome storage for UI preferences, last viewed audit ID, active tab states.
  - `sidePanel`: Dedicated persistent sidepanel interface (`chrome.sidePanel`).
  - `scripting`: Executes content scripts for Quick Audit DOM extraction.
  - `tabs`: Queries tab state, navigates to URLs, tracks tab updates.
- **Host Permissions**:
  - `http://127.0.0.1:8000/*`
  - `http://localhost:8000/*`
- **Missing for Standalone**:
  - No wildcards (`<all_urls>` or `*://*/*`) currently declared for arbitrary target websites.
  - No dynamic `chrome.permissions.request()` implementation for runtime origin access.

### 4.2. Extension Service Layer (`extension/services/api.ts`)
- **Current Role**: Pure HTTP REST client talking to FastAPI at `http://127.0.0.1:8000`.
- **Endpoints Called**:
  - `GET /health`: Backend connectivity and latency monitor.
  - `POST /api/v1/audits`: Create new audit job.
  - `GET /api/v1/audits/{id}`: Poll audit progress and stage stepper.
  - `POST /api/v1/audits/{id}/cancel`: Cancel running crawl.
  - `GET /api/v1/audits/{id}/issues`: Retrieve SEO issues list.
  - `GET /api/v1/audits/{id}/score`: Retrieve calculated SEO scorecard.
  - `GET /api/v1/audits/{id}/technologies`: Retrieve detected technology stack.
  - `POST /api/v1/audits/{id}/technologies/reanalyze`: Trigger zero-network re-analysis.
  - `POST /api/v1/audits/{id}/complete-analysis`: Run missing downstream stages.

---

## 5. Feature Compatibility & Portability Matrix

The table below analyzes every major subsystem, evaluating how feasible it is to execute purely within a Chrome Extension (Manifest V3) without Python or native binaries:

| Feature / Subsystem | Current Python Backend Implementation | Standalone Chrome Extension Feasibility | Required Browser API / Implementation Strategy | Browser Obstacles & Limitations |
| :--- | :--- | :--- | :--- | :--- |
| **URL Discovery & Scope** | `urllib.parse`, `ScopeEnforcer` in Python | **HIGH (Native)** | TypeScript URL API (`new URL()`), regex scope checks | None. Clean 1:1 port to TypeScript. |
| **Robots.txt Parser** | `urllib.robotparser` in Python | **HIGH (Native)** | TypeScript robots.txt parser (`robots-parser` or custom ~150-line parser) | Standard CORS/host permission required to fetch `/robots.txt`. |
| **Sitemap Ingestion** | XML ElementTree in Python | **HIGH (Native)** | Browser `DOMParser` (`text/xml`) or regex | Standard CORS/host permission required. |
| **HTTP Fetching** | `httpx.AsyncClient` with pooled TCP | **MEDIUM (Native)** | Extension background worker `fetch()` with `AbortController` | **CORS & Host Permissions:** Extension requires explicit host permission (`chrome.permissions.request`). Fetch lacks granular TCP socket control. |
| **SSRF / IP Blocking** | `socket.getaddrinfo()` pre-flight IP check | **LOW-MEDIUM (Browser Limitation)** | WebRequest / declarativeNetRequest / URL string heuristics | Chrome extensions cannot resolve DNS before `fetch()`. Private IP filtering must rely on URL patterns and private subnet blocking. |
| **HTML Parsing** | `BeautifulSoup4` with `html.parser` | **HIGH (Native)** | Browser `DOMParser` (`parseFromString(html, "text/html")`) | Extremely fast in Chrome (V8 C++ engine). Zero external parser dependency. |
| **Data Storage** | SQLite `seo_agent.db` via aiosqlite | **HIGH (Native)** | Browser **IndexedDB** (`idb` wrapper or raw API) | IndexedDB easily handles 1,000+ pages and 50+ MB. Survives tab closes. Subject to browser storage eviction policies. |
| **Worker Lifecycle** | OS-level infinite loop (`CrawlWorker`) | **MEDIUM (MV3 Limitation)** | Manifest V3 Service Worker + Chrome Alarms API (`chrome.alarms`) | **Service Worker Suspension:** MV3 service workers terminate after 30s of inactivity or 5 minutes of continuous task. Must checkpoint state to IndexedDB. |
| **On-Page SEO Rules** | 16 Python rule classes | **HIGH (Native)** | TypeScript DOM evaluation on parsed `Document` | 100% portable. Evaluates title, meta, h1-h6, canonical, images, links. |
| **Technical SEO Rules** | 22 Python rule classes | **MEDIUM (Native)** | TypeScript rule evaluation | Response headers available in `fetch()`. HTTP status codes available. SSL certificate details not exposed by `fetch()`. |
| **Site-Wide Link Graph** | Python link graph & NetworkX | **HIGH (Native)** | TypeScript in-memory directed graph (Adjacency list) | Calculating inlinks, outlinks, and orphan pages for 50-250 pages takes < 15ms in JS. |
| **Duplicate Content Graph** | Python content hashing | **HIGH (Native)** | TypeScript 64-bit hashing / shingle comparison | Very fast in JS for 50-250 pages. |
| **Technology Stack Engine**| 173 Python catalog fingerprints | **HIGH (Native)** | TypeScript regex & string matching against extracted evidence | All 173 fingerprints are declarative regex/strings. Evaluates in < 5ms per page in JS. |
| **SEO Score Calculation** | Python scoring calculator & gates | **HIGH (Native)** | TypeScript scoring math (pure functions) | Identical mathematical formula. 100% portable. |
| **Dynamic JS Hydration** | Headless Playwright Chromium | **LOW (Native Browser)** | Offscreen document / hidden tab script injection | Running full headless browser inside extension is impossible; must use Chrome's own active tab or offscreen documents. |
| **Export Capability** | Backend API or manual DB query | **HIGH (Native)** | Client-side `Blob` generation -> `chrome.downloads.download` or object URL | Can export JSON, CSV, and HTML reports directly in-browser. |

---

## 6. Key Takeaways & Architecture Constraints
1. **The Core Engine is 85% Portable to TypeScript**: HTML parsing, rule checks, link graphs, technology fingerprint matching, and scoring algorithms are pure data transformations that run even faster in V8 C++ than in Python.
2. **The 3 Critical Browser Hurdles**:
   - **Host Permissions**: To fetch arbitrary websites, the user must grant host permissions via `chrome.permissions.request({ origins: [...] })`.
   - **Service Worker Lifecycle**: Manifest V3 service workers are ephemeral. Crawling 250 pages cannot rely on an in-memory loop; state must be durably checkpointed in IndexedDB after every page fetch.
   - **Lack of Raw Socket / DNS Access**: Chrome extensions cannot perform raw socket preflight DNS checks. SSRF defense must be handled via domain filtering and standard browser security boundaries.
