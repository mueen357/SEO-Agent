# Phase 1.4B — Chrome Extension Integration & Audit Dashboard

## 1. Overview

Phase 1.4B connects the Manifest V3 Chrome Extension (React 19 + WXT) directly to the FastAPI persistent audit backend while preserving 100% of the zero-backend Quick Page Audit functionality.

---

## 2. Quick Page Audit vs. Full Website Audit

| Feature | Quick Page Audit | Full Website Audit |
| :--- | :--- | :--- |
| **Execution Context** | Chrome Content Script & DOM | Standalone Python FastAPI Backend |
| **Backend Required** | ❌ No (100% local in browser) | ✅ Yes (`http://127.0.0.1:8000`) |
| **Scope** | Single active browser tab | Multi-page recursive crawl |
| **Rendering** | Uses current browser page DOM | Headless Chromium + SafeFetcher |
| **Persistence** | In-memory / temporary UI state | SQLite database (`siteaudit.db`) |
| **Cancellation** | Instant tab detach | Server-side worker cancellation |
| **UI Presentation** | Instant single-page audit cards | Paginated table, live progress, page modal |

---

## 3. Side Panel Audit Dashboard Components

### 3.1 Mode Selector & Header (`entrypoints/sidepanel/App.tsx`)
- Provides a clean toggle between **"Quick Page Audit"** and **"Full Website Audit"**.
- Displays backend connectivity badge (Online with latency ms / Offline).
- Displays target URL and active tab hostname.

### 3.2 Full Audit Overview (`components/audit/FullAuditOverview.tsx`)
- Displays real-time audit lifecycle state (`created`, `queued`, `crawling`, `completed`, `cancelled`, `failed`).
- Shows total pages discovered, crawled, failed, and skipped.
- Progress bar reflecting percentage of max pages completed.
- Direct **"Cancel Audit"** and **"New Audit"** controls.

### 3.3 Crawled Pages Table (`components/audit/FullAuditPagesTable.tsx`)
- Paginated table showing:
  - Final URL & Depth
  - HTTP status badge (e.g., `200 OK`, `301 Redirect`, `404 Not Found`)
  - Page Title
  - Response time in milliseconds
  - Dynamic Render Status badge (`Rendered`, `Recommended`, `HTTP Only`, `Unavailable`)
- Clickable row opening detailed page inspection.

### 3.4 Page Details Modal (`components/audit/PageDetailsModal.tsx`)
- Comprehensive modal inspecting an individual crawled page:
  - **Raw Metadata:** Title, meta description, canonical URL, meta robots directives.
  - **Raw vs Rendered Comparison:** Displays side-by-side diff when dynamic rendering was executed, highlighting changes in title, description, headings, images, and links.
  - **Laboratory Performance Metrics:** DOMContentLoaded (ms), Load Event (ms), Duration (ms), and resource count.
  - **Headings Hierarchy:** H1-H6 tags.
  - **Image Analysis:** Total images, images missing alt attributes.
  - **Link Breakdown:** Internal vs external link counts.

---

## 4. Resilient Polling & State Management

- **Polling Loop:** Initiates a 2.5-second polling interval via `GET /api/v1/audits/{id}` while an audit is in active state (`created`, `queued`, `crawling`).
- **Terminal State Termination:** Polling immediately terminates once the audit enters a terminal state (`completed`, `cancelled`, `failed`).
- **Unmount Cleanup:** `useEffect` returns a cleanup function clearing all active intervals when the side panel is closed or unmounted.
- **Session Persistence:** Active full audit UUID is saved in `chrome.storage.local` under `website_audit_active_full_id` allowing seamless resume across popup/sidepanel navigation without storing sensitive content.
- **No Stale Data:** Switching tabs checks hostname alignment; users can initiate an audit for the new tab or view existing audits.
