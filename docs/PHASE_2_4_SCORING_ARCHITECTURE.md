# Phase 2 Task 2.4 — Scoring Architecture

## 1. Executive Summary & Disclaimer
The **Audit Health Score** is an internal, evidence-based diagnostic metric engineered to summarize technical and structural SEO quality discovered during crawling and rule execution.

> **CRITICAL DISCLAIMER:**
> **Audit Health Score is an internal diagnostic score, NOT Google's actual or proprietary ranking algorithm.** Google uses hundreds of algorithmic signals, user interaction signals, machine learning models, and real-time query-dependent factors that no third-party audit tool can directly replicate. This system measures adherence to confirmed SEO best practices, technical integrity, and standards-compliant web architecture.

## 2. Core Architectural Principles
The scoring engine is built according to seven foundational guarantees:
1. **Deterministic:** Identical crawl evidence evaluated under the same policy version yields mathematically identical scorecards and priority items every time.
2. **Versioned:** All evaluations pin a specific policy version (currently `2026.1`) to ensure historical comparability.
3. **Evidence-Based:** Scores are calculated exclusively from persisted rule assessments (`SeoIssue`, `CrawlPage`, and site-wide graph findings).
4. **Bounded:** Overall and category scores are strictly bounded in the range $[0.0, 100.0]$.
5. **Explainable:** Every scorecard includes mathematical breakdowns, category weightings, and prioritized root-cause deductions.
6. **Reproducible:** Scoring can be re-run idempotently at any time without side effects on underlying crawl data.
7. **Zero Network / Zero LLM Dependency:** Scoring and prioritization require zero external HTTP requests, zero external APIs, and zero non-deterministic Large Language Model hallucinations.

## 3. Subsystem Organization
The scoring engine lives in `backend/app/scoring/`:
```
backend/app/scoring/
    __init__.py          # Public exports
    policy.py            # Configurable weights, severity multipliers, status values
    coverage.py          # Evidence completeness, confidence ratios, score states
    calculator.py        # Mathematical rule, category, and composite score computation
    grouping.py          # Finding deduplication, clustering, and stable SHA-256 fingerprinting
    priorities.py        # P0-P3 classification, ranking, and remediation action generation
    explainability.py    # Transparent explanation text, formula, and top point deductions
    engine.py            # High-level orchestrator: Audit -> Scorecard + Priority Items
```

## 4. Integration with Application Architecture
- **Repository Layer (`backend/app/repositories/scoring_repository.py`):**
  - Handles ACID-safe persistence of `AuditScorecard` and `AuditPriorityItem` records.
  - Implements idempotent replacement of scorecards and priority items on recalculation.
  - Efficient paginated queries with priority tier, category, and rule filtering.
- **Service Layer (`backend/app/services/scoring_service.py`):**
  - Manages transaction lifecycle and staleness checking.
  - Invalidation: Marks scorecards as stale if newer crawl pages or issues are registered after scorecard creation.
- **API Layer (`backend/app/api/v1/audits.py`):**
  - `POST /api/v1/audits/{id}/score`: Calculate or recalculate score.
  - `GET /api/v1/audits/{id}/score`: Retrieve latest scorecard with freshness status.
  - `GET /api/v1/audits/{id}/score/breakdown`: Detailed rule-level contributions and deductions.
  - `GET /api/v1/audits/{id}/score/coverage`: Audit coverage, crawl limits, and confidence metrics.
  - `GET /api/v1/audits/{id}/priorities`: Paginated, filterable priority remediation backlog.
