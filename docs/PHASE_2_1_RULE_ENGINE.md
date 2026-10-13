# Phase 2 — Task 2.1: Evidence-Based On-Page SEO Rule Engine Architecture

## 1. Overview and Core Principles

Task 2.1 establishes the foundational deterministic SEO rule engine for the AI-Powered Website Audit Agent. The engine operates entirely on persisted crawl and render evidence, producing structured, reproducible findings without external network calls or LLM dependencies.

### Core Architectural Principles
1. **Evidence-Based Grounding:** Every finding originates strictly from observed HTML or rendered DOM signals. Missing data is never guessed or marked as passing.
2. **Determinism & Idempotency:** The same crawled page evidence evaluated multiple times always yields identical findings with deterministic fingerprints, preventing duplicate rows.
3. **Status vs. Severity Orthogonality:** A rule's assessment evaluation (`pass`, `warning`, `fail`, `unknown`, `not_applicable`) is decoupled from its business severity (`critical`, `high`, `medium`, `low`, `info`). For example, a missing title is a `high` severity `fail`, whereas multiple H1 headings are an editorial `low` severity `warning`.
4. **Per-Rule Exception Isolation:** Rules execute independently inside structured exception handlers. An unexpected runtime error in one rule is isolated, emitting an `unknown` status assessment with diagnostic error context rather than crashing the audit run.
5. **No Fictional Scores:** Numerical SEO scores and fake quality percentages are explicitly omitted until grounded multi-category models are implemented.

```
                    ┌─────────────────────────────────┐
                    │     CrawlPage & Render DB       │
                    │   (Stored HTML, Meta, Links)    │
                    └────────────────┬────────────────┘
                                     │
                             PageAuditContext
                                     ▼
                    ┌─────────────────────────────────┐
                    │          AuditEngine            │
                    │   (RuleRegistry: 16 Rules)      │
                    └────────────────┬────────────────┘
                                     │
                        List[RuleAssessment]
                                     │
                     Fingerprint: SHA256(audit:page:rule:src:ver)
                                     ▼
                    ┌─────────────────────────────────┐
                    │         IssueRepository         │
                    │    (Idempotent Upsert / Save)   │
                    └────────────────┬────────────────┘
                                     │
                               SeoIssue Model
                                     ▼
             ┌─────────────────────────────────────────────────┐
             │                FastAPI Endpoints                │
             │  GET  /api/v1/audits/{id}/issues                │
             │  POST /api/v1/audits/{id}/analyze               │
             │  GET  /api/v1/audits/{id}/issues/summary        │
             └───────────────────────┬─────────────────────────┘
                                     │
                                     ▼
             ┌─────────────────────────────────────────────────┐
             │          Chrome Extension Side Panel            │
             │       (SeoFindingsView & Filter Drawer)         │
             └─────────────────────────────────────────────────┘
```

---

## 2. Subsystem Structure (`backend/app/audit_engine/`)

```
backend/app/audit_engine/
├── __init__.py                 # Exports: AuditEngine, BaseRule, PageAuditContext, RuleAssessment
├── context.py                  # PageAuditContext unifying raw HTTP & rendered DOM evidence
├── engine.py                   # AuditEngine coordinating isolated execution
├── registry.py                 # RuleRegistry with automatic rule discovery
├── result.py                   # RuleAssessment dataclass & SHA-256 fingerprint generator
└── rules/
    ├── __init__.py             # Exports BaseRule
    ├── base.py                 # Abstract BaseRule definition
    └── onpage/
        ├── __init__.py         # Registry collection (ALL_ONPAGE_RULES)
        ├── canonical.py        # Canonical presence & destination validity rules
        ├── headings.py         # H1 presence, multiple H1, empty H1, hierarchy jumps
        ├── html_language.py    # HTML lang attribute presence and BCP 47 format
        ├── images.py           # Missing alt & empty decorative alt rules
        ├── links.py            # Outgoing internal links & empty anchor text rules
        ├── meta_description.py # Meta description presence & editorial length rules
        └── title.py            # Title tag presence, editorial length & repetition rules
```

---

## 3. Data Model & Storage Semantics (`SeoIssue`)

Stored in the `seo_issues` table (Alembic migration `0004_add_seo_issues.py`):

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Unique issue identifier |
| `audit_id` | `UUID` (FK) | Reference to `audits.id` (CASCADE) |
| `crawl_page_id` | `UUID` (FK, nullable) | Reference to `crawl_pages.id` (CASCADE) |
| `rule_id` | `VARCHAR(100)` | Stable rule identifier (e.g., `ONPAGE_TITLE_PRESENT`) |
| `category` | `VARCHAR(50)` | Category (`on_page`, `images`, `links`, etc.) |
| `subcategory` | `VARCHAR(50)` | Subcategory (`title`, `canonical`, `headings`, etc.) |
| `title` | `VARCHAR(255)` | Human-readable finding summary |
| `description` | `TEXT` | Detailed factual description |
| `severity` | `VARCHAR(20)` | `critical` \| `high` \| `medium` \| `low` \| `info` |
| `status` | `VARCHAR(20)` | `pass` \| `warning` \| `fail` \| `unknown` \| `not_applicable` |
| `evidence_json` | `JSON` | Structured dictionary of observed facts |
| `recommendation` | `TEXT` | Actionable advice grounded in search documentation |
| `source_type` | `VARCHAR(30)` | `raw_http` \| `rendered_browser` \| `derived_from_crawl` |
| `confidence` | `FLOAT` | Evidentiary confidence score (0.0 to 1.0) |
| `documentation_url` | `VARCHAR(2048)` | Link to official search documentation |
| `rule_version` | `VARCHAR(20)` | Version string (e.g., `1.0.0`) |
| `fingerprint` | `VARCHAR(64)` | Deterministic SHA-256 hash for deduplication |

---

## 4. REST API Integration

### `POST /api/v1/audits/{id}/analyze`
- Validates audit exists.
- Iterates over all successfully crawled pages (`fetch_status == "success"`, `http_status == 200`).
- Evaluates each page against all 16 registered rules.
- Saves assessments atomically, replacing prior run assessments to maintain idempotency.
- Returns `AnalyzeAuditResponse` with count of pages analyzed, issues found, and category/severity summary.

### `GET /api/v1/audits/{id}/issues`
- Paginated retrieval supporting:
  - `category`: Filter by category (e.g. `on_page`, `images`, `links`)
  - `severity`: Filter by severity (`critical`, `high`, `medium`, `low`, `info`)
  - `status`: Filter by status (`pass`, `warning`, `fail`, `unknown`)
  - `crawl_page_id`: Filter to issues for a single crawled page
  - `page` & `page_size`: Standard offset/limit pagination (1 to 100)
- Results ordered by severity priority (`critical` -> `high` -> `medium` -> `low` -> `info`) and status (`fail` -> `warning` -> `unknown` -> `pass`).

### `GET /api/v1/audits/{id}/issues/summary`
- Aggregates real-time count breakdowns:
  - `by_category`: Grouped counts across categories
  - `by_severity`: Grouped counts across severities
  - `by_status`: Grouped counts across rule statuses
  - `total_issues`: Total assessed records
