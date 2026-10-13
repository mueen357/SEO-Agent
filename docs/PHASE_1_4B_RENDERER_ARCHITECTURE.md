# Phase 1.4B — Playwright Renderer Architecture

## 1. Overview and Design Principles

Phase 1.4B introduces an optional, controlled headless Chromium rendering subsystem to evaluate dynamic JavaScript-rendered single page applications (SPAs), client-side hydration, and DOM changes that are invisible to raw HTTP HTML crawling.

The renderer is strictly decoupled from the core HTTP crawler:
- **Primary Extraction:** Fast, secure HTTP crawling (`app.crawler.fetcher.SafeFetcher`) always runs first.
- **Dynamic Inspection:** The rendering subsystem (`app.renderer`) only runs when dynamic rendering is recommended by heuristics or explicitly requested by configuration, **and** the execution environment meets security boundaries.
- **Evidence Preservation:** Raw HTTP extraction is never overwritten or discarded. Both raw and rendered evidence are stored and compared side-by-side.

```
                    ┌─────────────────────────────────┐
                    │      HTTP Crawler Pipeline      │
                    │   (SafeFetcher + HTMLParser)    │
                    └────────────────┬────────────────┘
                                     │
                             Raw Parsed Data
                                     ▼
                    ┌─────────────────────────────────┐
                    │         RenderDetector          │
                    │   (Evaluates Dynamic Need)      │
                    └────────────────┬────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
     [HTTP_ONLY]                                     [RENDER_RECOMMENDED /
   Save raw data only                                 RENDER_REQUIRED]
                                                               │
                                                               ▼
                                              ┌─────────────────────────────────┐
                                              │      BrowserSecurityManager     │
                                              │   Checks Host Environment &     │
                                              │    ValidatingEgressProxy        │
                                              └────────────────┬────────────────┘
                                                               │
                                       ┌───────────────────────┴───────────────────────┐
                                       ▼                                               ▼
                             [RENDER_UNAVAILABLE]                               [SECURE TO RENDER]
                            Records honest reason                                      │
                            and preserves raw data                                     ▼
                                                                      ┌─────────────────────────────────┐
                                                                      │         BrowserManager          │
                                                                      │   (Chromium Process Pool &      │
                                                                      │    Concurrency Semaphores)      │
                                                                      └────────────────┬────────────────┘
                                                                                       │
                                                                                       ▼
                                                                      ┌─────────────────────────────────┐
                                                                      │          PageRenderer           │
                                                                      │   (Hydration, DOM Extraction,   │
                                                                      │    Lab Metrics, Screenshots)    │
                                                                      └────────────────┬────────────────┘
                                                                                       │
                                                                                       ▼
                                                                      ┌─────────────────────────────────┐
                                                                      │     RawVsRenderedComparator     │
                                                                      │   (Diffs Metadata, Headings,    │
                                                                      │    Images, Links, Summary)      │
                                                                      └────────────────┬────────────────┘
                                                                                       │
                                                                                       ▼
                                                                      ┌─────────────────────────────────┐
                                                                      │       CrawlPageRender DB        │
                                                                      │    (Persisted with Audit ID)    │
                                                                      └─────────────────────────────────┘
```

---

## 2. Core Subsystem Modules (`backend/app/renderer/`)

### 2.1 `BrowserManager` (`browser_manager.py`)
- **Process Lifecycle:** Manages a single shared Playwright Chromium instance with controlled startup, graceful shutdown, and crash recovery.
- **Context Concurrency:** Uses an `asyncio.Semaphore` (configurable via `RENDERER_MAX_CONCURRENT_CONTEXTS`, default: 2) to limit parallel browser contexts and prevent CPU/memory exhaustion.
- **Leak Prevention:** Contexts and pages are created within structured `async with` blocks ensuring `page.close()` and `context.close()` fire even upon unexpected timeouts or exceptions.
- **Crash Recovery:** If Chromium crashes or disconnects unexpectedly, `BrowserManager` safely cleans up stale references and respawns a clean process on the next acquisition.

### 2.2 `RenderDetector` (`render_detector.py`)
- Evaluates raw HTTP HTML to determine whether dynamic JavaScript rendering is necessary, returning a structured `RenderDecision` (`strategy`, `reason`, `evidence`).
- **Heuristics:**
  - **Empty SPA Root Containers:** Detects empty standard containers like `<div id="root"></div>`, `<div id="app"></div>`, `<div id="__next"></div>`.
  - **Client-Side Placeholders:** Flags pages with phrases like "Please enable JavaScript", "Loading...", "JavaScript is required to view this site".
  - **SSR Framework Discrimination:** Modern frameworks (e.g., Next.js, Nuxt) frequently pre-render full semantic HTML on the server. If a page contains framework markers (`#__next`, `__NEXT_DATA__`) but has rich body text (>250 characters) and populated headings, it is marked as `HTTP_ONLY`.

### 2.3 `PageRenderer` (`renderer.py`)
- Coordinates navigation, hydration waiting, rendered DOM capture, lab metrics, and raw-vs-rendered comparison.
- **Bounded Navigation:** Navigation timeout is enforced (default: 15,000ms) with `wait_until="domcontentloaded"`.
- **Hydration Buffer:** If the page indicates SPA hydration, a bounded wait (default: 1,500ms) allows client scripts to mount without hanging indefinitely for `networkidle`.
- **DOM Size Limit:** Enforces a maximum DOM capture size (default: 5MB) to avoid memory spikes from massive or recursive DOM structures.

### 2.4 `RawVsRenderedComparator` (`comparator.py`)
- Compares raw HTTP extraction against rendered DOM extraction across:
  - Title (`raw_title` vs `rendered_title`)
  - Meta description
  - Canonical URL
  - Meta robots directives
  - Heading counts and text (H1-H6)
  - Image counts and missing alt tags
  - Link counts (internal vs external)
- Generates a human-readable diff summary explaining the exact impact of client-side execution.

### 2.5 `PerformanceMetricsExtractor` (`metrics.py`)
- Captures browser-level laboratory performance timings using native `window.performance.timing` and `window.performance.getEntriesByType('navigation')`:
  - `dom_content_loaded_ms`
  - `load_event_ms`
  - `navigation_duration_ms`
  - `resource_count`
  - `document_transfer_size_bytes`
- **Important:** Explicitly labeled as synthetic lab measurements. Does not fabricate or impersonate real-user Core Web Vitals (LCP, INP, CLS) or Lighthouse audits.

### 2.6 `ScreenshotService` (`screenshot.py`)
- **Default State:** **DISABLED by default**.
- **Viewports:** Captures Desktop (`1280x800`) and Mobile (`375x667`) viewports when explicitly requested.
- **Path Safety:** Uses UUID-based file naming with no user-supplied path segments.
- **Storage:** Persisted under a Git-ignored directory (`storage/screenshots/{audit_id}/`).

---

## 3. Worker Integration & Lease Heartbeats

- **Independent Worker Heartbeat:** In `app.services.crawl_service`, crawling and slow page rendering are wrapped with an asynchronous background heartbeat task running every 15 seconds. This guarantees that active 60-second database worker leases do not expire during multi-page rendering cycles.
- **Cancellation Responsiveness:** Rendering tasks check `audit.is_cancelled` before and after each page render, immediately aborting browser operations if cancelled.
