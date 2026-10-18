# Standalone Shared Catalog Architecture & Data Pipeline

## Overview

The Website Audit Agent maintains a **Single Authoritative Source of Truth** for both SEO audit rules and technology fingerprints. Rather than maintaining two divergent, hand-crafted catalogs in Python and TypeScript, definitions originate in the Python backend and are deterministically exported into standardized JSON manifests consumed directly by the Manifest V3 Chrome Extension.

```
┌─────────────────────────────────────────────────────────────┐
│               Authoritative Python Definitions              │
│  - backend/app/audit_engine/registry.py (51 Rules)          │
│  - backend/app/technology/fingerprints/catalog.py (173 Tech) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ scripts/export_catalog.py
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Shared JSON Manifest Assets                 │
│  - extension/standalone/audit/canonical_seo_rules.json      │
│  - extension/standalone/technologies/technology_catalog.json│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ Bundled at build time (WXT / Vite)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Manifest V3 Chrome Extension Runtime            │
│  - UniversalTechEngine (zero Python, zero API keys)         │
│  - StandaloneScoringCalculator (51-rule coverage tracking)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Export Automation Pipeline

The export pipeline is implemented in:
`scripts/export_catalog.py`

### Execution
```powershell
& "backend\.venv\Scripts\python.exe" scripts/export_catalog.py
```

### Deterministic Guarantees
1. **Sorted Keys & Entries**: Technologies and rules are sorted alphabetically by their canonical identifier (`id` or `rule_id`) to ensure reproducible git diffs.
2. **Signature Completeness**: Direct dataclass inspection extracts private and nested signature fields (`meta_generators`, `headers`, `script_sources`, `stylesheet_hrefs`, `dom_markers`, `version_rules`, `min_assets_for_detection`).
3. **Cross-Language Type Normalization**: Enum values (e.g. `TechnologyCategory.cms`) are converted to clean lowercase strings.
4. **Version Tagging**: Every exported bundle includes `catalog_version: "2.4.0"` and an `exported_at` ISO timestamp.

---

## 2. Shared Artifacts

### A. Canonical SEO Rules Manifest
- **File**: `extension/standalone/audit/canonical_seo_rules.json`
- **Total Rules**: Exactly 51
- **Schema**:
```json
[
  {
    "rule_id": "ONPAGE_TITLE_PRESENT",
    "title": "ONPAGE_TITLE_PRESENT",
    "scoring_family": "on_page",
    "display_category": "on_page",
    "severity": "medium",
    "is_sitewide": false,
    "description": "Checks for presence of title tag",
    "version": "1.0.0",
    "doc": ""
  }
]
```

### B. Technology Fingerprints Catalog
- **File**: `extension/standalone/technologies/technology_catalog.json`
- **Total Technologies**: Exactly 173
- **Schema**:
```json
{
  "catalog_version": "2.4.0",
  "engine_version": "1.1.0",
  "total": 173,
  "technologies": [
    {
      "id": "wordpress",
      "name": "WordPress",
      "category": "cms",
      "subcategory": "blog_engine",
      "vendor_or_type": "WordPress Foundation",
      "website": "https://wordpress.org",
      "description": "Open-source content management system.",
      "implies": ["php"],
      "confidence_weight": 1.0,
      "default_provenance": "first_party",
      "signatures": {
        "meta_generators": ["WordPress( [0-9.]+)?$"],
        "headers": {},
        "script_sources": ["/wp-includes/", "/wp-content/"],
        "stylesheet_hrefs": ["/wp-content/"],
        "dom_markers": ["link[rel*='wp-json']"],
        "body_classes": ["logged-out", "wp-custom-logo"]
      },
      "version_rules": [
        {
          "source_type": "meta_generator",
          "regex": "WordPress ([0-9.]+)",
          "version_type": "semver"
        }
      ]
    }
  ]
}
```

---

## 3. Chrome Runtime Independence

1. **Zero External Requests**: The entire catalog is bundled directly into the extension bundle via Vite's static JSON import (`import catalogJson from './technology_catalog.json'`).
2. **Zero Python Dependency**: End-users install only the unpacked Chrome extension from `.output/chrome-mv3`. No Python environment, virtual environment, or local server is required.
3. **Automated CI Validation**: `extension/tests/catalogParity.test.ts` executes in Vitest during every build to verify that catalog integrity, rule counts (51), technology counts (173), and regex compilability (387 patterns) are preserved.
