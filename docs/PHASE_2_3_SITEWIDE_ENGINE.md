# Phase 2 — Task 2.3: Site-Wide SEO Analysis & Internal Link Intelligence Engine

## 1. Architectural Overview

The Site-Wide Intelligence Engine extends the deterministic rule engine of the Website Audit platform from single-page and technical assessments to holistic cross-page graph and content analysis.

### Core Objectives
1. **Normalized Primary Content Extraction**: Strip boilerplates (navigation, footers, repetitive menus, scripts, styles) deterministically, prioritizing semantic `<main>`, `<article>`, and `#content` tags with safe fallbacks.
2. **Exact Duplicate Main Content Detection**: Detect pages sharing identical normalized primary text SHA-256 digests without false positives from shared headers or footers.
3. **Near-Duplicate Detection via 64-bit SimHash**: Fingerprint primary text with 64-bit SimHash signatures stored as 16-character hex strings (avoiding SQLite signed integer overflow). Evaluate Hamming distance ($\le 3$) and length ratios ($\ge 0.75$) with candidate filtering to achieve bounded $O(N)$ to $O(N \log N)$ grouping across up to 500 crawled pages.
4. **Duplicate Metadata Clustering**: Cluster distinct URLs with identical normalized titles (`SITE_TITLE_DUPLICATE`), meta descriptions (`SITE_META_DESCRIPTION_DUPLICATE`), and primary H1 headings (`SITE_H1_DUPLICATE`).
5. **Deterministic Internal Link Graph (`InternalLinkGraph`)**: Construct an in-memory directed graph of observed in-scope HTTP hyperlinks from persistent `CrawlLink` records. Compute:
   - Unique inbound linking pages (`inbound_internal_count`)
   - Unique outbound destination pages (`outbound_internal_count`)
   - Reachability & crawl depth from seeds
   - Discovery modes (seed, hyperlink-discovered, sitemap-only)
   - Broken link destinations (links to confirmed 4xx and 5xx responses)
   - Redirect destinations (links pointing to confirmed redirect chains)
6. **Canonical Preference & Conflict Analysis**: Cross-reference duplicate clusters with declared canonical hints. Highlight conflicting self-referencing canonical declarations and canonical targets resolving to 4xx status.
7. **Rule-Family Isolation**: Ensure transactional replacement of issue records by rule prefix (`ONPAGE_`, `TECH_`, `SITE_`) to prevent category collisions (e.g. `category="content"` or `"technical"`).

---

## 2. Component Structure

```
backend/app/
├── content/
│   ├── __init__.py
│   ├── extractor.py       # MainContentExtractor (boilerplate stripping, semantic prioritization)
│   ├── normalizer.py      # Unicode NFKC, whitespace compaction, case folding, n-grams
│   ├── fingerprint.py     # SHA-256 digest & deterministic 64-bit SimHash (16-char hex)
│   └── similarity.py      # Hamming distance, SimHash similarity metric, length ratio
├── audit_engine/
│   ├── context.py         # SiteWideAuditContext, PageAuditContext
│   ├── link_graph.py      # InternalLinkGraph topology and edge analysis
│   ├── engine.py          # AuditEngine.evaluate_sitewide with per-rule fault isolation
│   ├── registry.py        # 51 rules total (16 on-page, 22 technical, 13 site-wide)
│   └── rules/
│       └── sitewide/
│           ├── __init__.py
│           ├── duplicate_content.py    # SITE_CONTENT_DUPLICATE_EXACT, SITE_CONTENT_DUPLICATE_NEAR
│           ├── duplicate_metadata.py   # SITE_TITLE_DUPLICATE, SITE_META_DESCRIPTION_DUPLICATE, SITE_H1_DUPLICATE
│           ├── internal_graph.py       # SITE_NO_OBSERVED_INTERNAL_INLINKS, SITE_LOW_INTERNAL_INLINKS, SITE_DEEP_CRAWL_PATH
│           ├── link_health.py          # SITE_INTERNAL_LINK_TO_4XX, SITE_INTERNAL_LINK_TO_5XX, SITE_INTERNAL_LINK_TO_REDIRECT
│           └── canonical_groups.py     # SITE_DUPLICATE_CANONICAL_REVIEW, SITE_CONTENT_CANONICAL_CONFLICT
├── database/
│   └── models.py          # SiteFindingGroup, CrawlPage content columns
└── repositories/
    └── issue_repository.py# save_finding_groups, get_finding_groups, rule_prefixes_to_replace
```

---

## 3. Database Migration 0006

Migration file: `alembic/versions/0006_add_sitewide_intelligence.py`
Reversible migration chaining from `0005_add_technical_seo_and_security`:

### Columns added to `crawl_pages`:
- `normalized_main_text_hash` (`VARCHAR(64)`, indexed): SHA-256 of extracted normalized primary text.
- `main_text_simhash` (`VARCHAR(16)`, indexed): 64-bit SimHash formatted as a 16-hex character string.
- `main_text_word_count` (`INTEGER`, nullable): Word count of extracted main text.
- `main_text_character_count` (`INTEGER`, nullable): Character count of extracted main text.
- `extraction_source` (`VARCHAR(32)`, default `'none'`): Tag origin (`main`, `article`, `content_container`, `body_fallback`).
- `extraction_version` (`VARCHAR(16)`, default `'1.0.0'`): Parser extraction version.
- `content_quality_status` (`VARCHAR(32)`, default `'unknown'`): Status flag (`usable`, `insufficient_text`, `empty`, `failed`).

### Table added: `site_finding_groups`
- `id` (`CHAR(36)`, Primary Key)
- `audit_id` (`CHAR(36)`, Foreign Key to `audits.id`, indexed)
- `rule_id` (`VARCHAR(64)`, indexed)
- `rule_version` (`VARCHAR(16)`)
- `group_fingerprint` (`VARCHAR(64)`, indexed)
- `group_type` (`VARCHAR(64)`, indexed)
- `affected_page_ids_json` (`TEXT`)
- `affected_urls_json` (`TEXT`)
- `evidence_json` (`TEXT`)
- `created_at` (`DATETIME`)
- `updated_at` (`DATETIME`)

---

## 4. REST API Endpoints

1. **`POST /api/v1/audits/{id}/analyze/sitewide`**
   - Triggers isolated execution of all 13 site-wide rules.
   - Clears existing `SITE_` issues and regenerates `site_finding_groups` atomically.
   - Preserves `ONPAGE_` and `TECH_` issues.
2. **`GET /api/v1/audits/{id}/sitewide/summary`**
   - Returns aggregated statistics: total assessments, actionable findings, pass/warning/fail counts, exact duplicate groups count, near duplicate groups count, duplicate metadata groups count, canonical conflict groups count, and evidence coverage status.
3. **`GET /api/v1/audits/{id}/sitewide/duplicate-groups`**
   - Paginated access to `SiteFindingGroup` clusters with filtering by `group_type` and `rule_id`.
4. **`GET /api/v1/audits/{id}/sitewide/link-graph`**
   - Returns complete directed topology metrics: node count, internal edge count, orphan count, low-inlink count, broken link destinations, redirect destinations, crawl depth, and full node array.

---

## 5. Security & Verification Guarantees

- **Zero Network Calls During Analysis**: The engine operates purely over persisted SQLite records.
- **Zero Hallucinations & No LLMs**: All assessments, clusters, and topology calculations use pure algorithmic logic.
- **No SQLite 64-bit Integer Overflow**: SimHash signatures are encoded as 16-character hex strings.
- **Bounded Excerpts & Bounded Payload Sizes**: Raw HTML is never copied into evidence; only bounded text snippets and hash signatures are stored.
