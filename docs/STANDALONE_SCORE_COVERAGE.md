# Honest SEO Score Coverage & Provenance Semantics

## Executive Summary

Prior to Phase 1, the standalone in-browser audit engine evaluated a subset of rules and awarded a score of `100/100` without communicating that only ~18% of the canonical rules had been executed. Furthermore, 5 passed checks on the 5-page test fixture were misleadingly displayed as `SEO Issues (5)`.

This document establishes the **Honest Score Coverage System**, ensuring that audit scores reflect true evaluation depth, separate issues from passed checks, and prevent misleading representations of site health.

---

## 1. Score States and Classifications

The scoring engine classifies every audit result into one of three explicit states:

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
        │    Evidence                │  ┌──────────────┐  ┌──────────────┐
        └────────────────────────────┘  │ PROVISIONAL  │  │    FULLY     │
                                        │    SCORE     │  │  EVALUATED   │
                                        │ (Phase 1 MVP)│  │ (Future P4)  │
                                        └──────────────┘  └──────────────┘
```

### A. PROVISIONAL SCORE
- **Trigger**: Valid crawl data exists, but fewer than 80% of canonical rules (or fewer than 80% of any single rule family) were evaluated.
- **UI Treatment**: Displays an amber **PROVISIONAL SCORE** badge showing exact coverage: `Coverage: 9/51 canonical rules (18%)`.
- **Purpose**: Accurately communicates that while the evaluated rules passed, 42 canonical checks (e.g. Hreflang reciprocity, Schema.org, OpenGraph, TTFB latency) remain unassessed.

### B. FULLY EVALUATED SCORE
- **Trigger**: Coverage ratio ≥ 80% across On-Page (≥ 13/16), Technical (≥ 18/22), and Site-Wide (≥ 11/13).
- **UI Treatment**: Displays a standard verified grade badge without provisional disclaimers.

### C. UNAVAILABLE SCORE
- **Trigger**: 0 usable HTML pages were retrieved (e.g. network timeout, DNS failure, 500 server error, blocked crawl).
- **UI Treatment**:
  - `overallScore: null`
  - `grade: 'N/A'`
  - Amber warning banner: `SEO Scorecard Unavailable (Grade: N/A): Crawl failed / insufficient evidence to compute reliable score.`
  - Attempted URLs and usable page counts are explicitly reported.

---

## 2. Metric Separation: Issues vs Passed Checks

To eliminate misleading counters, raw findings are strictly classified into mutually exclusive typed categories:

| Status Code | Semantics | Contributes to `totalIssuesCount`? | UI Section |
|---|---|---|---|
| `fail` | Check evaluated and failed | **YES** (by severity: critical, high, medium, low) | Issues Tab (Failed) |
| `warning` | Partial issue or sub-optimal configuration | **YES** (half deduction penalty) | Issues Tab (Warning) |
| `pass` | Check evaluated and successfully passed | **NO** | Passed Checks Tab |
| `not_applicable` | Check does not apply to this site/page type | **NO** | All Records Tab |
| `not_evaluated` | Rule is registered in catalog but not executed | **NO** | Coverage & Rules Tab |
| `unknown` | Evidence inconclusive | **NO** | All Records Tab |

### Real Chrome 5-Page Fixture Example
- **Previous Flawed Display**:
  - `findings.length = 5` (5 pass findings for `TECH_HTTPS_SECURITY`)
  - Rendered: `SEO Issues (5)` ❌ *(Misleading: zero issues existed!)*
- **Corrected Honest Display**:
  - `findingsSummary.issueCount = 0`
  - `findingsSummary.passedCount = 5`
  - `findingsSummary.failedCount = 0`
  - `findingsSummary.warningCount = 0`
  - Rendered: `SEO Issues (0)` ✅
  - Success Banner: `✓ Zero SEO issues detected across evaluated pages! (5 checks passed)`

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
All category scores are clamped between 0 and 100.
If fewer than 3 pages are crawled, the Site-Wide score is capped at `75` due to insufficient sample size for cluster and sitewide duplicate detection.

---

## 4. Provenance & Calculation Versioning

Every computed scorecard persists immutable provenance metadata:
```json
{
  "scoringVersion": "2.4.0-standalone",
  "calculatedAt": 1729245600000,
  "coverage": {
    "scoreState": "provisional",
    "scoreStateLabel": "Provisional (9/51 Rules Evaluated)",
    "coverageRatio": 0.176,
    "expectedRulesTotal": 51,
    "executedRulesTotal": 9,
    "missingRulesTotal": 42,
    "passedRulesCount": 5,
    "failedRulesCount": 0,
    "warningRulesCount": 0,
    "familyCoverage": {
      "on_page": { "executed": 6, "total": 16, "ratio": 0.375 },
      "technical": { "executed": 2, "total": 22, "ratio": 0.091 },
      "sitewide": { "executed": 1, "total": 13, "ratio": 0.077 }
    },
    "policyVersion": "2.4.0-standalone"
  }
}
```
Historical audits remain completely intact with their original score provenance preserved.
