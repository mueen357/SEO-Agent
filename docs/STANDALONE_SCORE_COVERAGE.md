# Honest SEO Score Coverage & Authoritative Execution Ledger

## Executive Summary

Prior to this reliability checkpoint, SEO rule coverage was derived inversely from findings (assuming that if a rule had no finding, it passed or wasn't evaluated). That flawed approach conflated passing rules with missing rules and distorted coverage ratios.

This document establishes the **Authoritative Execution Ledger Architecture** and **Honest Score Coverage System**, ensuring that:
1. Every evaluated check produces an immutable execution ledger record (`StandaloneRuleExecutionRecord`), independent of whether it passes, fails, warns, or is not applicable.
2. Rule execution coverage is computed exclusively from the execution ledger.
3. Score states reflect true evaluation depth across all 51 canonical rules.
4. Failed crawl attempts and unreachable hosts trigger an explicit evidence availability gate, preventing misleading default scores (like `100/100`) from being rendered.

---

## 1. Authoritative Execution Ledger Architecture

The execution ledger is recorded at the check level and persisted to IndexedDB store `execution_ledger`:

```
┌─────────────────────────────────────────────────────────────┐
│                   In-Browser Rules Engine                   │
│   evaluatePageDetailed() & evaluateSitewideDetailed()       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                Emits Findings │ Emits Authoritative Records
                               ▼
┌──────────────────────────────┬──────────────────────────────┐
│       SEO Findings           │   Execution Ledger Records   │
│  - Failures & Warnings       │  - canonicalRuleId           │
│  - Severity & Deductions     │  - executionStatus           │
│  - Target URL & Evidence     │  - pageUrl / siteScope       │
│  - User-facing message       │  - executionTimeMs & Details │
└──────────────────────────────┴──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Authoritative Scorecard                     │
│  - Honest Rule Coverage (14/51 evaluated)                   │
│  - Score State: 'provisional' (< 80%)                       │
│  - Deductions applied only for observed issues              │
└─────────────────────────────────────────────────────────────┘
```

### Execution Status Codes
- `executed_pass`: Rule was applicable and evaluated; passed all assertions.
- `executed_fail`: Rule was applicable and evaluated; failed assertions.
- `executed_warning`: Rule was applicable and evaluated; sub-optimal configuration.
- `not_applicable`: Rule was evaluated but is not applicable to this page type or context (e.g. localhost HTTPS policy).
- `not_evaluated`: Rule is cataloged in the canonical 51 but engine implementation is pending.
- `unknown`: Evaluation attempted but evidence was unavailable or network failed.

---

## 2. Four-State Score Classification

The scoring engine classifies every audit result into one of four explicit states:

```
                          ┌─────────────────────────────┐
                          │   Audit Execution Begins    │
                          └──────────────┬──────────────┘
                                         │
                        [Usable HTML Pages Crawled > 0?]
                                  /            \
                                No               Yes
                               /                   \
        ┌────────────────────────────┐    [Coverage Ratio >= 80%
        │     UNAVAILABLE SCORE      │     across all 3 families?]
        │  - Overall: null           │          /            \
        │  - Grade: N/A              │        No              Yes
        │  - Reason: Insufficient    │       /                  \
        │    Evidence                │  ┌──────────────┐  [Coverage = 100%?]
        └────────────────────────────┘  │ PROVISIONAL  │      /       \
                                        │    SCORE     │    No         Yes
                                        │  (< 80%)     │   /             \
                                        └──────────────┘┌──────────────┐┌──────────────┐
                                                        │ SUBSTANTIAL  ││    FULLY     │
                                                        │  COVERAGE    ││  EVALUATED   │
                                                        │  (>= 80%)    ││   (100%)     │
                                                        └──────────────┘└──────────────┘
```

### A. UNAVAILABLE SCORE (`'unavailable'`)
- **Trigger**: 0 usable HTML pages retrieved (e.g. network timeout, fetch error, DNS error, 500 server outage, blocked crawler).
- **Behavior**:
  - `overallScore: null`
  - `grade: 'N/A'`
  - `available: false`
  - Banner: `SEO Scorecard Unavailable (Grade: N/A): Crawl failed / insufficient evidence to compute reliable score.`
  - Zero false content findings are emitted (early gating prevents missing title/description errors when page content was never fetched).

### B. PROVISIONAL SCORE (`'provisional'`)
- **Trigger**: Valid crawl data exists, but fewer than 80% of canonical rules (or fewer than 80% in any single family) were evaluated.
- **Current Standalone Status**: 14/51 canonical rules evaluated (27.5% coverage).
- **Behavior**:
  - Amber `PROVISIONAL SCORE` badge displayed.
  - Transparently communicates: `Provisional (14/51 Rules Evaluated)`.

### C. SUBSTANTIAL COVERAGE (`'substantial_coverage'`)
- **Trigger**: Coverage ratio ≥ 80% across On-Page (≥ 13/16), Technical (≥ 18/22), and Site-Wide (≥ 11/13).
- **Behavior**: Evaluated grade badge displayed without provisional disclaimers.

### D. FULLY EVALUATED (`'fully_evaluated'`)
- **Trigger**: Strictly reserved for when all 51 canonical rules were completed (or confirmed legitimate not_applicable).

---

## 3. Canonical Category Weighting & Penalty Model

The standalone engine strictly adheres to the authoritative scoring formula defined in `backend/app/scoring/policy.py`:

```
Overall Score = (On-Page Score × 0.35) + (Technical Score × 0.40) + (Site-Wide Score × 0.25)
```

### Deduction Severity Table
| Finding Severity | Standard Failure Deduction | Warning Deduction (50% Policy) |
|---|---|---|
| `critical` | -25 points | -13 points |
| `high` | -15 points | -8 points |
| `medium` | -8 points | -4 points |
| `low` / `info` | -3 points | -2 points |

### Category Scores Clamping
All category scores are clamped between 0 and 100. If fewer than 3 pages are crawled, the Site-Wide score is capped at `75` due to insufficient sample size for cluster and sitewide duplicate detection.

---

## 4. Authoritative Scorecard Schema

Every computed scorecard persists immutable provenance metadata:
```json
{
  "scoringVersion": "2.0.0-standalone",
  "calculatedAt": 1729245600000,
  "overallScore": 92,
  "grade": "A",
  "available": true,
  "coverage": {
    "scoreState": "provisional",
    "scoreStateLabel": "Provisional (14/51 Rules Evaluated)",
    "coverageRatio": 0.275,
    "expectedRulesTotal": 51,
    "implementedRulesCount": 14,
    "executedRulesTotal": 14,
    "distinctExecutedCanonicalRules": [
      "ONPAGE_TITLE_PRESENT",
      "ONPAGE_TITLE_LENGTH",
      "ONPAGE_META_DESC_PRESENT",
      "ONPAGE_META_DESC_LENGTH",
      "ONPAGE_H1_PRESENCE",
      "ONPAGE_H1_MULTIPLE",
      "ONPAGE_CANONICAL_PRESENCE",
      "ONPAGE_CANONICAL_VALID",
      "ONPAGE_IMAGE_ALT_MISSING",
      "TECH_HTTP_4XX",
      "TECH_HTTP_5XX",
      "TECH_HTTPS_USAGE",
      "SITE_TITLE_DUPLICATE",
      "SITE_NO_OBSERVED_INTERNAL_INLINKS"
    ],
    "applicableRulesCount": 14,
    "missingRulesTotal": 37,
    "passedChecksCount": 42,
    "failedChecksCount": 0,
    "warningChecksCount": 3,
    "notApplicableChecksCount": 5,
    "familyCoverage": {
      "on_page": { "executed": 9, "total": 16, "ratio": 0.563 },
      "technical": { "executed": 3, "total": 22, "ratio": 0.136 },
      "sitewide": { "executed": 2, "total": 13, "ratio": 0.154 }
    },
    "policyVersion": "2.0.0-standalone"
  }
}
```
