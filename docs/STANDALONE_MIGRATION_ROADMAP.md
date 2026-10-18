# Standalone Migration Roadmap & Implementation Plan

## Executive Overview

This roadmap defines the step-by-step technical plan for migrating the **Website Audit Agent** into a **zero-install, 100% standalone Chrome Extension (Manifest V3)** while maintaining enterprise capabilities for advanced users.

---

## Migration Philosophy: Progressive Enhancement Without Disruption

1. **Zero Regression for Existing Backend**: The FastAPI backend, database schemas, and test suites remain 100% operational and untouched.
2. **Dual-Engine Architecture**: The Chrome extension UI will support seamless switching between the **Standalone Browser Engine** (default, 0 setup) and the **Local Backend Engine** (optional, for heavy crawls).
3. **True Manifest V3 Compliance**: Strictly follows Chrome Web Store security guidelines: no external script evaluation (`eval`), explicit `optional_host_permissions`, and full sandboxing.

---

## Implementation Phases

### Phase 1: Prototype Validation & Foundation (Current Milestone — COMPLETED)
- [x] **Audit Existing Dependencies**: Catalog all Python, FastAPI, SQLite, and network requirements.
- [x] **Benchmark Accuracy & Pipeline Performance**: Empirically measure technology fingerprint precision/recall (100% precision, 85.11% recall) and full-site crawl timings (14.14 pps).
- [x] **Isolated Standalone Prototype**: Build `extension/standalone/` comprising:
  - `InBrowserCrawler`: Scope-enforced, SSRF-defended, concurrency-throttled crawler.
  - `StandaloneDomParser`: V8 native C++ `DOMParser` for sub-millisecond HTML extraction.
  - `StandaloneRulesEngine`: Core On-Page, Technical, and Site-Wide SEO rule evaluators.
  - `StandaloneTechDetector`: Multi-vector fingerprint matcher with version detection.
  - `StandaloneScoringCalculator`: Weighted composite score and letter grade generator.
  - `StandaloneAuditStorage`: Durable IndexedDB store for jobs, pages, findings, and tech stack.
  - `StandaloneExporter`: Direct browser JSON & CSV export.
  - `StandaloneAuditView`: Full interactive React dashboard with zero backend dependencies.
- [x] **Comprehensive Test Verification**: 16 unit tests covering URL normalization, same-origin enforcement, crawler budgets, interruption handling, and CSV escaping. (113/113 frontend tests passing).

---

### Phase 2: Core Engine Porting & Catalog Expansion (Weeks 1–3)
- **Goal**: Expand the client-side technology catalog from 25 prototype signatures to full parity with the 173 backend technology definitions.
- **Key Tasks**:
  1. **Fingerprint Definition Compiler**: Create an automated script (`scripts/compile_catalog_to_ts.py`) that translates the Python JSON-based catalog (`backend/app/technology/catalog/`) into a minified, tree-shakeable TypeScript definition file (`extension/standalone/audit/catalog.ts`).
  2. **Rule Registry Port**: Port all 51 SEO rules (16 on-page, 22 technical, 13 sitewide) to TypeScript interfaces matching `StandaloneRulesEngine`.
  3. **Site-Wide Link Graph Analysis**: Implement client-side PageRank approximation and internal link graph cycle detection in `clientRules.ts`.
  4. **Performance Optimizations**: Compile regex signatures once at initialization time to maintain < 2 ms evaluation latency per page.

---

### Phase 3: Manifest V3 Background Worker & Checkpoint Orchestration (Weeks 4–5)
- **Goal**: Make in-browser crawling resilient against tab closure, navigation, and service worker suspension.
- **Key Tasks**:
  1. **Background Service Worker Integration**: Register a WXT background worker module (`extension/entrypoints/background.ts`) that coordinates crawl state via `chrome.alarms` and `chrome.storage.local`.
  2. **Heartbeat & Alarm Keep-Alive**: When a crawl is actively running, register a 1-minute recurring alarm to wake up the service worker if terminated by Chrome's 30-second idle timer.
  3. **Offscreen Document Integration**: For high-volume DOM parsing and headless iframe evaluations, provision an MV3 `offscreen` document to prevent main-thread UI jank.
  4. **Dynamic Host Permissions UX**: Build an elegant modal dialog explaining why site permissions are requested (`chrome.permissions.request`) and provide one-click granting.

---

### Phase 4: UI/UX Unification & Mode Switcher (Weeks 6–7)
- **Goal**: Provide a single unified side panel interface where users can choose their preferred engine.
- **Key Tasks**:
  1. **Engine Mode Selector**:
     - **"Standalone Engine (In-Browser)"** (Default): Fast, zero-setup, ideal for sites up to 100 pages.
     - **"Backend Engine (Localhost)"**: Shows status of `http://127.0.0.1:8000`, recommended for 250+ page enterprise audits.
  2. **Unified Data Layer**: Create an abstraction layer `AuditRepository` with two implementations:
     - `IndexedDbAuditRepository` (client-side)
     - `FastApiAuditRepository` (remote/localhost client)
  3. **Visual Progress Indicators**: Real-time display of currently fetched URL, HTTP status codes, discovered links counter, and live category scores.

---

### Phase 5: Chrome Web Store Packaging & Release (Week 8)
- **Goal**: Prepare production bundle, privacy disclosures, and publish to Chrome Web Store.
- **Key Tasks**:
  1. **Privacy Policy Generation**: Formal documentation certifying that no user browsing data, URLs, or HTML content are collected or transmitted to external servers.
  2. **Security Audit & Linting**: Run `web-ext lint` and Automated Security Scans to verify zero CSP violations or dangerous permissions.
  3. **Production Minification**: Optimize assets to keep total extension package size under 1.5 MB.
  4. **Store Listing Assets**: Screenshots, promotional banners, and demo recordings showcasing the zero-config, 1-click audit experience.

---

## Feature Parity & Capability Milestones

| Feature | Current Python Backend | Standalone Prototype (Phase 1) | Target Standalone Release (Phase 5) |
| :--- | :--- | :--- | :--- |
| **No Python/CLI Required** | ❌ (Requires Python 3.11+) | ✅ (100% in Chrome) | ✅ (100% in Chrome) |
| **No Paid APIs / No Cloud** | ✅ (Local SQLite) | ✅ (Local IndexedDB) | ✅ (Local IndexedDB) |
| **Technology Definitions** | 173 technologies | 25 core technologies | 173+ technologies |
| **SEO Rules Supported** | 51 rules | 9 core rules | 51 rules |
| **Single Page Quick Audit** | ✅ (Via DOM inspection) | ✅ (Via DOMParser) | ✅ (Via DOMParser) |
| **Multi-Page Site Crawl** | ✅ (Up to 2,500 pages) | ✅ (Tested up to 50 pages) | ✅ (Capped at 100 pages) |
| **Durable Checkpoints** | ✅ (SQLite disk) | ✅ (IndexedDB disk) | ✅ (IndexedDB disk) |
| **Resume After Interruption** | ✅ (Database state) | ✅ (Storage state) | ✅ (Storage + Alarm state) |
| **JSON / CSV Export** | ✅ (Backend endpoint) | ✅ (Client Blob download) | ✅ (Client Blob download) |
| **Executive PDF Report** | ✅ (Backend ReportLab) | ❌ (JSON/CSV only) | ✅ (Client-side HTML print) |

---

## Remaining Blockers & Mitigation Strategies

1. **CORS Restrictions on Raw `fetch`**:
   - *Risk*: Cross-origin pages without CORS headers cannot be fetched via standard web page `fetch`.
   - *Mitigation*: In Chrome MV3, once `host_permissions` are granted by the user, the extension background service worker is exempt from CORS restrictions and can fetch any authorized origin.
2. **Browser Sleeping & Extended Crawls**:
   - *Risk*: If a user closes their laptop lid or Chrome sleeps background tabs during a large crawl, execution pauses.
   - *Mitigation*: Set polite default crawl budgets (max 50 pages) and prominently display crawl estimates. If a crawl is interrupted, offer an instant "Resume Crawl" button upon reopening.
3. **JavaScript-Rendered Content (SPA)**:
   - *Risk*: `fetch()` retrieves raw static HTML, which may omit client-rendered content in React/Vue SPAs that lack SSR.
   - *Mitigation*: For SPAs, inject a lightweight content script or use `chrome.scripting.executeScript` into an active or background tab to extract the live rendered DOM.
