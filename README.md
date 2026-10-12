# AI-Powered Website Audit Agent

A production-oriented, AI-powered website audit system delivered through a Google Chrome Manifest V3 extension with a high-performance Python FastAPI audit backend.

---

## 1. Architecture Overview

### Frontend (Chrome Extension — Manifest V3)
- **Framework & Build:** Built using [WXT](https://wxt.dev/) with Vite and React 19 + TypeScript 5
- **Styling:** Tailwind CSS 3 with charcoal / dark navy palette, cyan/blue SaaS accents, and Lucide React icons
- **Entrypoints:**
  - **Popup (`entrypoints/popup/`):** Quick inspector showing current site detection, hostname, favicon, backend connectivity status, "Quick Audit" execution button, disabled future audit tiers, and side panel shortcut.
  - **Side Panel (`entrypoints/sidepanel/`):** Comprehensive audit dashboard featuring Overview, Quick Audit metrics, Metadata inspection, Headings hierarchy, Image alt analysis, Link graph breakdown, and structured placeholders for future phases.
  - **Background Worker (`entrypoints/background.ts`):** Manifest V3 service worker coordinating side panel opening and extension messaging.
  - **Content Script (`entrypoints/content.ts`):** On-page messaging responder for runtime audit requests.
- **Modular Directory Structure:**
  - `components/audit/`: HeadingsSection, ImagesSection, LinksSection, MetadataSection, PlaceholderSection, QuickAuditSummary
  - `components/common/`: Badge, BackendIndicator
  - `components/layout/`: Header
  - `services/`: auditRunner, extractor, api, tab, storage
  - `types/`: audit.ts, messaging.ts
  - `utils/`: url.ts
- **Build Output:** `extension/.output/chrome-mv3`

### Backend (API Service)
- **Framework:** Python 3.12 / 3.11+ with FastAPI & Uvicorn
- **Development Binding:** Strictly bound to `127.0.0.1:8000` (not exposed to public interfaces)
- **CORS Hardening:** Development CORS policy explicitly permits local origins and `chrome-extension://*` regex origins with `allow_credentials=False` (preventing wildcard credential exposure).
- **Core Endpoints:**
  - `GET /health`: Health status endpoint returning `{"status": "ok", "service": "website-audit-api"}`
  - `GET /docs`: Interactive Swagger documentation
  - `GET /redoc`: ReDoc documentation
- **Testing:** Pytest with HTTPX AsyncClient and ASGITransport

---

## 2. Prerequisites & Local Paths

- **Operating System:** Windows 11 Pro 64-bit
- **Node.js:** v24.19.0+ LTS with npm 11.17.0+
- **Python:** 3.12+ (Active virtual environment at `backend/.venv`)
- **Browser:** Google Chrome (Installed at `C:\Program Files\Google\Chrome\Application\chrome.exe`)

### Project Paths
- **Project Root:** `D:\Website-Audit-Agent`
- **Chrome Extension Directory:** `D:\Website-Audit-Agent\extension`
- **Backend Directory:** `D:\Website-Audit-Agentackend`
- **Documentation:** `D:\Website-Audit-Agent\docs`
- **Scripts:** `D:\Website-Audit-Agent\scripts`

---

## 3. Chrome Extension Setup & Build

### Development Mode (with Live Reload):
```powershell
cd "D:\Website-Audit-Agent\extension"
npm run dev
```

### Type Checking & Production Build:
```powershell
cd "D:\Website-Audit-Agent\extension"
npm run compile   # TypeScript validation (tsc --noEmit)
npm test          # Unit test suite (Vitest + JSDOM)
npm run build     # Builds production bundle to .output/chrome-mv3
```

### Loading the Extension in Google Chrome
1. Open Google Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the directory:
   `D:\Website-Audit-Agent\extension\.output\chrome-mv3`
5. The **Website Audit Agent** extension icon will now appear in your toolbar.
6. Click the extension icon to view the popup or open the Chrome Side Panel.

---

## 4. Backend Setup & Launch

### Virtual Environment Activation:
```powershell
cd "D:\Website-Audit-Agentackend"
.\.venv\Scripts\Activate.ps1
```

### Running the FastAPI Server:
```powershell
cd "D:\Website-Audit-Agentackend"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Running Backend Tests:
```powershell
cd "D:\Website-Audit-Agentackend"
.\.venv\Scripts\pytest.exe -v
```

---

## 5. Quick Page Audit Capabilities

The Quick Audit engine operates strictly on the active page's live DOM:
1. **Document Title:** Text, character length, short/long/missing recommendations.
2. **Meta Description:** Content extraction, character length, presence checks.
3. **Canonical URL:** Relative href resolution, presence check.
4. **Meta Robots Directive:** Directives extraction (index, noindex, follow, nofollow).
5. **HTML Language:** Detection of `lang` attribute on root `<html>` element.
6. **Headings Hierarchy (H1-H6):** Sequential extraction in exact DOM order, total counts per heading level, detection of missing H1 or multiple H1 tags.
7. **Image Analysis:** Total image count, images completely missing an `alt` attribute vs images with empty `alt=""` (valid decorative images), sample issues list.
8. **Hyperlink Graph:** Total hyperlinks, internal links (matching current hostname), external links (different domain), non-HTTP links (`mailto:`, `tel:`, `javascript:`).
9. **Preliminary Findings:** Actionable, objective recommendations with severity ratings (`critical`, `warning`, `info`, `good`).

---

## 6. Permissions & Security Policy

### Manifest V3 Permissions:
- `activeTab`: Provides temporary access to the currently active tab when invoked.
- `storage`: Enables local caching of audit results via `chrome.storage.local`.
- `sidePanel`: Grants access to the Chrome Side Panel API.
- `scripting`: Fallback script execution on pages opened prior to extension installation.
- `tabs`: Allows querying the active tab state and detecting URL changes.

### Host Permissions:
- `http://127.0.0.1:8000/*` and `http://localhost:8000/*`: Dedicated to local backend health queries.
- Unrestricted wildcard host permissions (`<all_urls>`) are avoided.

### Subdomain Classification Rule:
- By default (strict hostname consistency), links to subdomains (e.g. `blog.example.com` when viewing `example.com`) are classified as external to match the tab's exact hostname. Optional configuration flag `includeSubdomains` allows treating root-domain subdomains as internal.

---

## 7. Known Limitations

1. **Restricted Pages:** Cannot execute on `chrome://`, `chrome-extension://`, `edge://`, `about:blank`, or Chrome Web Store pages (gracefully handled with informative status indicators).
2. **Iframes and Shadow DOM:** Content nested within cross-origin iframes or closed shadow roots is not extracted in the preliminary DOM audit.
3. **Dynamic SPA Hydration:** Single-page applications rendering client-side content after hydration are audited based on current DOM state at the time of audit execution.
4. **Local Audit Scope:** Labeled explicitly as "Quick Page Audit" — does not fabricate site-wide crawl metrics, domain authority, or search ranking figures.
