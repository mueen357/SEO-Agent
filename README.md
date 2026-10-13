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
- **Client Services:**
  - `services/api.ts`: Typed API client for `/health`, `/api/v1/audits`, idempotency headers, audit retrieval, listing, and cancellation.
  - `services/auditRunner.ts` & `services/extractor.ts`: Client-side DOM extraction for zero-backend Quick Audits.
- **Build Output:** `extension/.output/chrome-mv3`

### Backend (Persistent Audit API Service — Phase 1.3)
- **Framework:** Python 3.12 with FastAPI & Uvicorn
- **Development Binding:** Strictly bound to `127.0.0.1:8000` (development isolation)
- **Database & ORM:** SQLAlchemy 2.x async engine with SQLite (`siteaudit.db`) for local development, architected with portable schemas ready for PostgreSQL.
- **Database Migrations:** Alembic with reversible migrations (`0001_initial_audit_tables.py`).
- **Security & SSRF Protection:** Pre-flight URL validation blocking non-HTTP schemes, userinfo credentials, excessive length, localhost, private IP ranges (RFC 1918), link-local/APIPA, multicast, reserved ranges, and cloud-metadata addresses (`169.254.169.254`). Pre-flight DNS resolution with safe failure modes.
- **Idempotency:** Persisted `Idempotency-Key` header mechanism with deterministic SHA-256 payload hashing and 409 Conflict protection.
- **Core Endpoints:**
  - `GET /health` & `GET /api/v1/health`: Backward-compatible health check (`{"status": "ok", "service": "website-audit-api"}`)
  - `GET /docs` & `GET /redoc`: Interactive Swagger and ReDoc documentation
  - `POST /api/v1/audits`: 202 Accepted; creates persistent audit record in `created` state
  - `GET /api/v1/audits/{id}`: Retrieves audit record by UUID
  - `GET /api/v1/audits`: Paginated query with status and hostname filtering
  - `POST /api/v1/audits/{id}/cancel`: Terminal-state protected audit cancellation
  - `GET /api/v1/audits/{id}/pages`: Empty collection placeholder (crawling scheduled for Phase 1.4)
  - `GET /api/v1/audits/{id}/issues`: Empty collection placeholder (issue detection scheduled for Phase 1.5)

---

## 2. Directory Structure

```
D:\Website-Audit-Agent/
├── backend/
│   ├── alembic/                # Database migrations
│   │   ├── versions/
│   │   │   └── 0001_initial_audit_tables.py
│   │   └── env.py
│   ├── app/
│   │   ├── api/v1/             # Endpoints: router, audits, health
│   │   ├── core/               # Errors & structured logging
│   │   ├── database/           # Base, session, models (Audit, IdempotencyRecord)
│   │   ├── repositories/       # AuditRepository (SQLAlchemy 2.x)
│   │   ├── schemas/            # Pydantic v2 request/response schemas
│   │   ├── services/           # AuditService & safe url_validation
│   │   ├── config.py           # Pydantic Settings
│   │   └── main.py             # FastAPI entrypoint
│   ├── tests/                  # Pytest async suite (isolated DB fixtures)
│   ├── alembic.ini
│   └── requirements.txt
├── extension/
│   ├── components/             # React UI components (Popup, Sidepanel, Audit cards)
│   ├── entrypoints/            # Background worker, popup, sidepanel
│   ├── services/               # API client, DOM extractor, tab services
│   ├── types/                  # Audit models & messaging interfaces
│   ├── utils/                  # Safe URL utilities
│   ├── tests/                  # Vitest suite
│   ├── package.json
│   └── wxt.config.ts
├── docs/                       # Architecture & test result documentation
├── scripts/                    # Automation scripts (verify_all.ps1, run_backend.ps1)
└── README.md
```

---

## 3. Quick Start & Verification

### Running the Backend Server
```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_backend.ps1
```
Or directly:
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Running Complete Verification Suite (Frontend + Backend)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify_all.ps1
```
Executes:
1. Extension TypeScript validation (`tsc --noEmit`)
2. Extension Vitest suite (`vitest run` — 24 tests)
3. Extension production build (`wxt build` -> `.output/chrome-mv3`)
4. Backend Pytest suite (`pytest -v` — 26 tests)
5. Playwright headless Chromium launch verification
6. Alembic reversible migration lifecycle test

### Database Migrations
```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```
