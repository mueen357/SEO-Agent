# One-Click End-to-End Website Audit Pipeline

## 1. Executive Summary

The One-Click Website Audit Pipeline automates the entire SEO, technology detection, and scoring workflow. After a single user action ("Start Full Audit"), the application coordinates all 9 audit stages without requiring manual intervention, intermediate button clicks, or multi-tab re-analysis triggers.

---

## 2. Problem Statement & Baseline Root Cause

### 2.1 The Real-World Failure
In previous versions, a user starting a full crawl experienced the following disconnect:
- Crawler completed 50 pages and discovered 549 URLs.
- However, the user was required to manually click:
  - "Run On-Page Analysis"
  - "Run Technical Analysis"
  - "Run Site-Wide Analysis"
  - "Analyze Technologies"
  - "Recalculate SEO Health Score"
- Even after doing so, the GUI displayed only 46 distinct evaluated rules instead of the 51 registered rules.
- The empty state prematurely claimed "No actionable SEO issues detected" before rules were evaluated.

### 2.2 Root Cause Analysis
1. **Worker Lifecycle Truncation:** `CrawlWorker` terminated immediately upon completing the network crawl stage (`release_job()`), abandoning downstream analysis to manual HTTP triggers.
2. **Rule Family Overwrite Bug:** In `IssueService.run_analysis(category=None)`, `run_sitewide_analysis()` was called first, persisting `SITE_` rules. Immediately following this, `save_assessments()` was called with `rule_prefixes_to_replace=None`. The fallback in `IssueRepository.save_assessments` executed a broad delete (`DELETE FROM seo_issues WHERE audit_id = ?`), wiping out the `SITE_` assessments that had just been saved.
3. **Missing Rule IDs in 51-Rule Count (46 vs 51):**
   - Rules like `DuplicateCanonicalReviewRule` and `ContentCanonicalConflictRule` returned empty lists `[]` when no duplicate content was detected, rather than truthful `not_applicable` or `pass` assessments.
   - `LowInternalInlinksRule` returned `[]` when the crawl sample had `<= 5` pages.
4. **Duplicate Group Page Count Mismatch:** Priority cards reported 1 affected page for duplicate content groups having 49 URLs because `issue.page_url` was null on site-wide group records.
5. **Polling Stall & Reopen Inconsistency:** The extension sidepanel stopped polling if status transitioned through intermediate states, and reopening the sidepanel failed to resume polling.

---

## 3. Architecture & Execution Stages

### 3.1 Orchestration Workflow (`AuditPipelineService`)
The pipeline runs in a single background worker lease (`AuditPipelineService.execute_pipeline`), maintaining continuous heartbeats and stage progress in `audit.progress_json["pipeline"]`.

```
[Start Full Audit / 1-Click]
           │
           ▼ (HTTP 202)
   [Stage 1: Validation]
           │
           ▼
   [Stage 2: Crawling] ─── (Crawl Budget: Max Pages)
           │
           ▼
   [Stage 3: Evidence Storage] ─── (HTML, Headers, Sitemaps, Renders)
           │
           ▼
   [Stage 4: On-Page SEO Checks] ─── (16 Registered ONPAGE_ Rules)
           │
           ▼
   [Stage 5: Technical SEO Checks] ─── (22 Registered TECH_ Rules)
           │
           ▼
   [Stage 6: Site-Wide SEO Checks] ─── (13 Registered SITE_ Rules + Link Graph)
           │
           ▼
   [Stage 7: Technology & CMS] ─── (Deterministic CMS, Frameworks & Plugins)
           │
           ▼
   [Stage 8: SEO Health Scoring] ─── (Deterministic Health Score & Priorities)
           │
           ▼
   [Stage 9: Publishing] ─── (Final Audit State & Coverage Matrix)
```

### 3.2 Stage Specification
| Stage | Key | Description | Status Mapping |
| :--- | :--- | :--- | :--- |
| **Stage 1** | `validation` | Validates URL format, DNS preflight, and audit configuration | `queued` |
| **Stage 2** | `crawling` | Executes BFS crawl respecting robots.txt and page budgets | `crawling` |
| **Stage 3** | `storage` | Persists HTML, HTTP headers, links, and sitemaps | `crawling` |
| **Stage 4** | `on_page_seo` | Evaluates 16 on-page SEO rules across crawled pages | `analyzing` |
| **Stage 5** | `technical_seo` | Evaluates 22 technical SEO rules | `analyzing` |
| **Stage 6** | `sitewide_seo` | Evaluates 13 site-wide rules and computes link graph | `analyzing` |
| **Stage 7** | `technology_detection` | Fingerprints CMS, WordPress, server, and libraries | `enriching` |
| **Stage 8** | `seo_scoring` | Computes deterministic SEO health score and P0-P3 priorities | `generating_recommendations` |
| **Stage 9** | `publishing` | Finalizes status, timestamps, and coverage details | `completed` / `partially_completed` |

---

## 4. Key Fixes & Design Implementations

### 4.1 Rule Family Preservation Fix
In `backend/app/services/issue_service.py`:
- When executing complete analysis (`category in (None, "all")`), `rule_prefixes_to_replace` is explicitly set to `["ONPAGE_", "TECH_"]`.
- `SITE_` rules saved by `run_sitewide_analysis()` are completely isolated and preserved.
- When running targeted category re-analysis, only the targeted prefix (`["ONPAGE_"]` or `["TECH_"]` or `["SITE_"]`) is replaced.

### 4.2 51-Rule Coverage Truthfulness
In `backend/app/audit_engine/rules/`:
- `DuplicateCanonicalReviewRule` and `ContentCanonicalConflictRule` now return `not_applicable` `RuleAssessment` with diagnostic evidence when no duplicate groups exist, and `pass` when evaluated cleanly.
- `LowInternalInlinksRule` returns `not_applicable` when crawled page count is `<= 5`.
- Verified 100% of the 51 rules produce evaluated records without fabricating synthetic passes.

### 4.3 Priority Card Affected Pages Count
In `backend/app/scoring/grouping.py`:
- Priority clustering inspects `evidence["all_urls"]`, `evidence["affected_urls"]`, and `evidence["page_count"]`.
- Group-level duplicate content findings correctly report the actual count of affected pages (e.g., 49 pages) instead of defaulting to 1 page.

### 4.4 Worker Heartbeat, Leases & Crash Recovery
In `AuditPipelineService`:
- Long-running analysis stages renew the database lease (`Audit.worker_expires_at`) before and after each stage.
- Before each stage, `_is_cancelled()` checks if the user cancelled the audit.
- If a worker crashes and restarts, `_stage_is_completed()` and `_has_crawled_pages()` detect existing evidence and skip redundant work, picking up at the first uncompleted stage.

### 4.5 Existing Completed Audit Support ("Complete Missing Analysis")
- New endpoint: `POST /api/v1/audits/{id}/complete-analysis` (`HTTP 202 Accepted`).
- Reuses existing crawl evidence and runs only missing or uncompleted downstream stages.
- Idempotent and safe for historical crawls.

---

## 5. Frontend UX & Synchronization

### 5.1 One-Click Action
- The primary action in `FullAuditOverview.tsx` is: **"Start Full Audit (1-Click Automation)"**.
- Clicking initiates the backend job and starts polling immediately.

### 5.2 Real-Time Pipeline Matrix
- Visual stepper in `FullAuditOverview.tsx` displays all 9 stages with status badges:
  - Green check for completed stages.
  - Cyan spinning indicator for active stage.
  - Rose cross for failed stages.
  - Slate dot for pending stages.

### 5.3 Truthful Empty States
- When audit is running: Displays `"SEO analysis in progress"`.
- When audit has not run: Displays `"Analysis not completed"`.
- When evidence is limited: Displays `"Insufficient evidence"` / `"Some checks unavailable"`.
- Only displays pass/clean messaging when evaluation is complete and clean.

### 5.4 Polling Resilience
- Polls across all active backend states: `queued`, `crawling`, `analyzing`, `enriching`, `generating_recommendations`.
- Automatically resumes polling when the sidepanel is reopened or browser is reloaded.
- Re-entrant guard (`isFetchingRef`) prevents overlapping out-of-order network requests.
- When audit reaches terminal state (`completed` or `partially_completed`), all child views (`SeoHealthDashboard`, `SeoFindingsView`, `SiteWideIntelligenceView`, `TechnologyDashboard`) automatically refresh their evidence.
