# Competitor Capability & Architecture Matrix

## 1. Executive Summary

This document benchmarks four leading industry tools across web technology stack profiling, SEO crawling, and performance auditing:
1. **Wappalyzer** (Technology profiler browser extension & API)
2. **BuiltWith** (Enterprise tech stack profiler & internet database)
3. **Screaming Frog SEO Spider** (Desktop-based technical SEO crawler)
4. **Google Lighthouse** (Open-source automated page audit tool built into Chrome DevTools)

The analysis compares these tools against the **Website Audit Agent** across 10 technical dimensions, contrasting their delivery models, crawling depths, data privacy, and dependency profiles.

---

## 2. Capability Comparison Matrix

| Technical Dimension | Wappalyzer (Browser Ext) | BuiltWith (Web & Ext) | Screaming Frog SEO Spider | Google Lighthouse | Website Audit Agent (Existing Backend) | Website Audit Agent (Proposed Standalone) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Delivery Model** | Chrome/Firefox Extension + Cloud API | SaaS Web Portal + Extension | Java Desktop Native App (Win/Mac/Linux) | Chrome DevTools, CLI, Node module | Chrome Extension + Local FastAPI / SQLite | 100% In-Browser Chrome Extension (MV3) |
| **2. Local vs Cloud Dependency** | Hybrid (Local rules in extension; deep lookups call paid cloud API) | Pure Cloud (Queries BuiltWith database; no client-side crawler) | 100% Local (Runs on user's machine; zero cloud requirement) | 100% Local (Executes in Chromium V8; zero cloud requirement) | Hybrid Local (Requires Python, FastAPI, Uvicorn, SQLite locally) | **100% Local (Pure V8/IndexedDB; zero backend, zero API keys)** |
| **3. Tech Fingerprint Breadth** | ~2,500 technologies across 70+ categories | Millions of tracked technologies & historical trends | Minimal (Extracts generator tag & server header only) | None (Only identifies libraries for security/audit flags) | **173 technologies across 15 categories** | **173 technologies across 15 categories (Ported to JS)** |
| **4. Multi-Page Crawling** | **No** (Single-page active tab DOM profiling only) | **No** (Pre-indexed cloud database lookup only) | **Yes** (Industry gold standard; 500 URLs free, unlimited paid) | **No** (Single-page audit; multi-page via CLI scripts/Puppeteer) | **Yes** (Budgeted async crawl: 1 to 250 pages) | **Yes** (In-browser budgeted async crawl: 1 to 50 pages) |
| **5. Technical SEO Coverage** | None (Tech profiler only) | None (Tech profiler only) | **Extensive** (300+ technical SEO checks, canonicals, hreflang, indexability) | **Moderate** (15 built-in basic SEO audits) | **Comprehensive** (51 registered rules: 16 On-Page, 22 Technical, 13 Site-Wide) | **Targeted** (Core On-Page & Technical SEO rules in-browser) |
| **6. Site-Wide Link Graph** | None | None | **Yes** (Inlink/outlink counts, internal PageRank, crawl depth) | None | **Yes** (Directed graph: orphan pages, duplicate clusters, inlinks) | **Yes** (In-memory directed graph for inlinks & orphans) |
| **7. Performance Checks** | None | None | Core Web Vitals via Google PSI API integration | **Deep** (Lab metrics: LCP, CLS, TBT, Speed Index, FCP via DevTools) | Basic latency & payload size tracking | Basic fetch latency & payload size tracking |
| **8. JS-Rendered Content** | Inspects active tab rendered DOM | Scrapes pre-rendered cloud traces | **Yes** (Built-in Chromium headless rendering engine) | **Yes** (Audits live rendered DOM and execution traces) | Optional (Local Playwright worker when enabled) | Inspects active tab DOM directly via `chrome.scripting` |
| **9. Security & Privacy Checks** | None | None | Basic (SSL cert expiry, mixed content, insecure forms) | Content Security Policy, HTTPS, vulnerable JS libraries | Mixed content, HTTPS enforcement, SSRF defense, headers | Mixed content, HTTPS enforcement, security headers |
| **10. Export Capability** | CSV/JSON (behind paid subscription) | CSV/Excel (behind paid subscription) | CSV, Excel, Google Sheets, PDF reports | JSON, HTML, Gist | JSON, CSV via backend API | **Direct JSON/CSV download via browser `Blob`** |
| **11. Account / API Key Required?** | Free extension has daily limits; API requires paid key | Requires account; free tier strictly limited | Free up to 500 URLs; license key for unlimited | **None (100% Free & Open Source)** | **None (100% Local & Free)** | **None (100% Local, Zero Install, Zero Setup)** |

---

## 3. Deep-Dive Competitor Analysis

### 3.1. Wappalyzer
- **Core Strength**: Tremendous catalog breadth (over 2,500 technology definitions), covering obscure CMSs, niche analytics tools, and legacy JavaScript frameworks.
- **Architectural Weakness**: The browser extension only evaluates the *currently loaded tab*. It does not crawl the website, discover child pages, analyze sitewide architectures, or perform SEO rule evaluations. Deep lookup features and bulk domain queries require calling their commercial cloud API.
- **Key Lesson for Website Audit Agent**: Having 170+ well-crafted, false-positive-resistant fingerprints with explicit provenance and confidence levels provides ~90% of real-world value for modern web platforms without needing an unwieldy 2,500-item dictionary.

### 3.2. BuiltWith
- **Core Strength**: Historical tracking and enterprise lead generation (shows when a site started and stopped using a technology).
- **Architectural Weakness**: Not a real-time crawler. It relies on a centralized cloud database updated on an arbitrary schedule. Querying a site through BuiltWith reflects what their crawlers saw weeks or months ago, not the current state of the page.
- **Key Lesson for Website Audit Agent**: Real-time passive observation directly against the live website produces far more trustworthy, immediate audit results than cached third-party index lookups.

### 3.3. Screaming Frog SEO Spider
- **Core Strength**: The definitive technical SEO site crawler. Deep link graphs, duplicate content identification, canonical tracking, custom extraction, and robust handling of massive 100,000+ page sites.
- **Architectural Weakness**: Heavy desktop Java application requiring installation, file system permissions, and significant RAM (often requiring configuring 8-16 GB heap space). High friction for casual users, marketing professionals, or quick audits.
- **Key Lesson for Website Audit Agent**: Users love the convenience of browser extensions. If an extension can deliver a Screaming-Frog-like multi-page crawl (up to 50 pages) and link graph analysis directly within a Chrome side panel, it eliminates the massive friction of desktop software.

### 3.4. Google Lighthouse
- **Core Strength**: Gold standard for single-page performance, Core Web Vitals, accessibility, and modern web best practices. Built right into Chrome DevTools.
- **Architectural Weakness**: Fundamentally a single-page audit tool. Does not crawl internal links, map website architectures, evaluate sitewide duplicate content, or identify technical stack dependencies.
- **Key Lesson for Website Audit Agent**: Lighthouse excels at single-page lab performance, but leaves a massive gap for *site-wide technical SEO and technology stack fingerprinting*. The Website Audit Agent directly fulfills this need.

---

## 4. Architectural Opportunities for Standalone Extension

By combining:
1. **Wappalyzer's** browser-based convenience,
2. **Screaming Frog's** multi-page crawling and link graph analysis (budgeted for 10-50 pages), and
3. **Lighthouse's** zero-install, zero-API-key local execution,

The **Standalone Website Audit Agent** can deliver an unprecedented user experience: a 1-click full site audit running completely inside the Chrome browser with **zero dependencies, zero Python setup, zero server processes, and zero cloud API keys**.
