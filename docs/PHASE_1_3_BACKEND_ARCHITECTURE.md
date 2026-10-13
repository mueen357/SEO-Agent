# Phase 1, Task 1.3 — Backend Architecture & Persistent Audit API Specification

## 1. System Architecture Overview

The backend service for the **AI-Powered Website Audit Agent** provides a persistent, decoupled REST API built with **Python 3.12**, **FastAPI**, **Pydantic v2**, and **SQLAlchemy 2.x**. It manages audit job definitions, safe URL pre-flight validation, idempotency, and lifecycle state transitions while remaining fully decoupled from actual web crawling (Phase 1.4) and AI recommendation engines (Phase 2).

```
                      +-----------------------------+
                      | Chrome Extension (MV3 / WXT)|
                      +--------------+--------------+
                                     |
               HTTP REST Requests    | Idempotency-Key
               (127.0.0.1:8000)      v
                      +-----------------------------+
                      |      FastAPI Router         |
                      |  - /health                  |
                      |  - /api/v1/health           |
                      |  - /api/v1/audits           |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |       Audit Service         |
                      |  - SSRF / Safe URL Validator|
                      |  - Idempotency Hash Verifier|
                      |  - Terminal State Guard     |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |      Audit Repository       |
                      |  (SQLAlchemy 2.x Async ORM) |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |    Database Persistence     |
                      |  - audits table             |
                      |  - idempotency_records      |
                      |  (SQLite / PostgreSQL ready)|
                      +-----------------------------+
```

---

## 2. Directory Structure

```
backend/app/
├── api/
│   └── v1/
│       ├── health.py        # /health and /api/v1/health
│       ├── audits.py        # /api/v1/audits endpoints
│       └── router.py        # Master v1 router assembly
├── core/
│   ├── errors.py            # AppError hierarchy & unified error envelopes
│   └── logging.py           # Structured logging configuration
├── database/
│   ├── base.py              # DeclarativeBase
│   ├── session.py           # Async engine & session factory
│   └── models.py            # Audit & IdempotencyRecord SQLAlchemy models
├── schemas/
│   ├── common.py            # HealthResponse, PaginationParams, PaginatedResponse
│   └── audit.py             # AuditCreateRequest, AuditResponse, AuditListResponse
├── services/
│   ├── url_validation.py    # URL normalization & SSRF protection
│   └── audit_service.py     # Business logic & lifecycle orchestration
├── repositories/
│   └── audit_repository.py  # Database query execution
├── config.py                # Pydantic Settings (.env support)
└── main.py                  # Application entrypoint & CORS middleware
```

---

## 3. Database Schema Specification

### 3.1 `audits` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Primary Key, Default: uuid4 | Unique audit job identifier |
| `target_url` | String(2048) | Not Null | User-submitted target URL |
| `normalized_url` | String(2048) | Not Null | Standardized canonical target URL |
| `hostname` | String(255) | Not Null, Indexed | Extracted domain hostname |
| `mode` | String(50) | Not Null, Default: 'quick' | Audit mode (`quick`, `full`, `verified_owner`) |
| `status` | String(50) | Not Null, Default: 'created', Indexed | Current lifecycle state |
| `max_pages` | Integer | Not Null, Default: 1 | Maximum crawl limit |
| `pages_discovered` | Integer | Not Null, Default: 0 | Number of discovered URLs |
| `pages_crawled` | Integer | Not Null, Default: 0 | Number of crawled URLs |
| `configuration_json`| JSON | Not Null, Default: `{}` | User-supplied options |
| `error_message` | Text | Nullable | Diagnostic error message on failure |
| `created_at` | DateTime(tz) | Not Null, Indexed | Creation timestamp (UTC) |
| `updated_at` | DateTime(tz) | Not Null | Last modification timestamp (UTC) |
| `started_at` | DateTime(tz) | Nullable | Timestamp when crawler begins (Phase 1.4) |
| `completed_at` | DateTime(tz) | Nullable | Terminal completion or cancellation timestamp |

**Indexes:**
- `ix_audits_status` (`status`)
- `ix_audits_hostname` (`hostname`)
- `ix_audits_created_at` (`created_at`)
- `ix_audits_status_created_at` (`status`, `created_at`)
- `ix_audits_hostname_created_at` (`hostname`, `created_at`)

### 3.2 `idempotency_records` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Primary Key, Default: uuid4 | Record identifier |
| `idempotency_key` | String(255) | Not Null, Unique, Indexed | Client-provided key |
| `request_hash` | String(64) | Not Null | SHA-256 of normalized request body |
| `audit_id` | UUID | Not Null, Foreign Key (`audits.id`, CASCADE) | Associated audit job ID |
| `created_at` | DateTime(tz) | Not Null | Key registration timestamp (UTC) |

---

## 4. API Specification & Sample Responses

### 4.1 Health Checks
- **`GET /health`** (and **`GET /api/v1/health`**)
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "service": "website-audit-api"
  }
  ```

### 4.2 Create Audit
- **`POST /api/v1/audits`**
- **Header:** `Idempotency-Key: <unique-string>` (Optional)
- **Request Body:**
  ```json
  {
    "target_url": "https://example.com",
    "mode": "quick",
    "max_pages": 1,
    "configuration": {
      "check_ssl": true
    }
  }
  ```
- **Response (202 Accepted):**
  ```json
  {
    "id": "7f09322b-b6d3-4a0e-9273-0435be797966",
    "target_url": "https://example.com",
    "normalized_url": "https://example.com/",
    "hostname": "example.com",
    "mode": "quick",
    "status": "created",
    "max_pages": 1,
    "pages_discovered": 0,
    "pages_crawled": 0,
    "configuration_json": {
      "check_ssl": true
    },
    "error_message": null,
    "created_at": "2026-10-13T00:15:00.123456Z",
    "updated_at": "2026-10-13T00:15:00.123456Z",
    "started_at": null,
    "completed_at": null
  }
  ```

### 4.3 Idempotent Replay
- Re-sending identical request with same `Idempotency-Key` returns the previously created record with **`200 OK`**.
- Re-sending the same key with conflicting parameters returns **`409 Conflict`**:
  ```json
  {
    "error": {
      "code": "CONFLICT",
      "message": "Idempotency key 'test-key-1' was previously used with different request parameters.",
      "details": null
    }
  }
  ```

### 4.4 Cancel Audit
- **`POST /api/v1/audits/{id}/cancel`**
- **Response (200 OK):**
  ```json
  {
    "message": "Audit '7f09322b-b6d3-4a0e-9273-0435be797966' successfully cancelled.",
    "audit": {
      "id": "7f09322b-b6d3-4a0e-9273-0435be797966",
      "status": "cancelled",
      "completed_at": "2026-10-13T00:16:00.654321Z"
    }
  }
  ```
- If already in terminal state (`cancelled`, `completed`, `failed`), returns **`409 Conflict`**.

---

## 5. Security & SSRF Defense-in-Depth

### 5.1 Pre-Flight URL Validation Rules
1. **Scheme Restrictions:** Only `http://` and `https://` are accepted. All other schemes (`ftp://`, `file://`, `javascript:`, `data:`, `ws://`) are rejected.
2. **Userinfo Stripping:** Embedded user credentials (`http://user:pass@host`) are rejected immediately.
3. **Length Enforcement:** URLs exceeding 2048 characters are rejected.
4. **Forbidden Hostnames:** `localhost`, `*.localhost`, `metadata.google.internal`, `metadata.internal`, `instance-data`.
5. **Forbidden IP Address Ranges:**
   - Loopback: `127.0.0.0/8`, `::1/128`
   - Private networks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`
   - Link-local (APIPA): `169.254.0.0/16`, `fe80::/10`
   - Cloud metadata endpoints: `169.254.169.254`
   - Carrier-grade NAT: `100.64.0.0/10`
   - Broadcast, multicast, and reserved addresses: `224.0.0.0/4`, `240.0.0.0/4`, `255.255.255.255/32`
6. **DNS Pre-Flight Checks:**
   - The domain is resolved prior to job registration.
   - If resolution yields any private or restricted IP, the job is rejected with HTTP 400.
   - If DNS resolution fails (e.g., domain does not exist), the request fails safely with HTTP 400.

### 5.2 Mandatory Crawler Security Contract (Phase 1.4 Handoff)
> [!CAUTION]
> **SSRF Security Contract for Phase 1.4 Crawler**
> Pre-flight DNS validation at job creation protects the database from junk records, but **cannot** prevent Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding attacks where an attacker alternates DNS responses between public and private IPs.
> 
> Therefore, the crawling engine implemented in Phase 1.4 **MUST**:
> 1. Intercept all outbound socket connections (e.g., via Playwright/HTTPX connection hooks).
> 2. Validate the destination IP address immediately prior to socket connection.
> 3. Re-validate the destination IP address on every HTTP redirect hop.

---

## 6. Concurrency & Idempotency Notes

- **Idempotency Scope:** Scoped per client using the `Idempotency-Key` HTTP header. Keys are persisted in the `idempotency_records` table with a unique index.
- **Concurrency Limitations in Local SQLite:** SQLite supports multiple readers with a single writer under WAL mode. In Phase 1.3's local setup, database transactions are serialized cleanly.
- **Future PostgreSQL Production Migration:** The schema uses standard UUID types, foreign keys, and indexes compatible with PostgreSQL. Migrating to PostgreSQL requires only updating `DATABASE_URL` in `.env` without code changes.
