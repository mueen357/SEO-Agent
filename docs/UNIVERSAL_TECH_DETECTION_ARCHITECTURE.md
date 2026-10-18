# Universal Website Technology Stack Detection Architecture

## 1. Overview & Architectural Principles

The Universal Technology Stack Detection Engine provides comprehensive, passive, evidence-based fingerprinting of website platforms, frontend frameworks, backend runtimes, programming languages, hosting/CDN infrastructure, data services, analytics, advertising, UX tools, payments, and security services.

### Core Architectural Decisions:
1. **Separation of Data from Execution Logic**: All technology detection rules are defined declaratively as structured, immutable `TechnologyFingerprint` definitions in `app.technology.fingerprints.catalog`. The execution engine `UniversalFingerprintEngine` compiles regexes once and evaluates page evidence deterministically.
2. **Evidence-Based Provenance**: Every technical finding records its explicit origin:
   - `first_party`: Direct observation from the site's own HTML, headers, or DOM.
   - `third_party_embed`: Externally referenced script or integration (e.g., Google Analytics, Stripe).
   - `asset_host`: Static assets hosted on a specific CDN or service (e.g., Framer CDN, Shopify CDN).
   - `inferred_dependency`: Indirect architectural implication (e.g., Next.js implies React).
3. **Strict Truthfulness & Observability**:
   - Hidden server-side languages (e.g., Python, Go, Ruby, Java, C#) are **NEVER** guessed based on visual appearance. They are classified as `unknown` unless credible public signals exist (e.g., framework cookies, response headers, disclosed generator tags).
   - Private databases (PostgreSQL, MySQL, Redis, MongoDB) are **NEVER** probed or inferred from the frontend stack. Only publicly observable search services (e.g. Algolia, Meilisearch) or explicit disclosures are reported.
   - Compiled JavaScript in the browser does not prove backend Node.js or source TypeScript.
4. **Defensive ReDoS & Resource Bounds**:
   - Input strings across all vectors (URLs, headers, class strings) are capped to bounded lengths (200-500 characters).
   - Regex patterns are pre-compiled at system startup with `re.IGNORECASE` and wrapped in exception boundaries.

---

## 2. Classification Status & Confidence Model

For every technology evaluated, the engine produces one of five mutually exclusive states:

| Status | Threshold / Definition | Provenance | Description |
| :--- | :--- | :--- | :--- |
| **DETECTED** | Confidence $\ge 0.70$ | `first_party` / `third_party_embed` / `asset_host` | Strong supporting evidence from multiple vectors or unique platform generators. |
| **POSSIBLE** | Confidence $0.40 - 0.69$ | Any | Limited or single moderate technical signal without full corroboration. |
| **INFERRED** | Proportional to parent ($\le 0.65$) | `inferred_dependency` | Architectural implication from confirmed parent technology (e.g., Next.js implies React). |
| **UNKNOWN** | Confidence $< 0.40$ | N/A | Insufficient or conflicting public evidence. |
| **NOT OBSERVED** | 0.00 | N/A | No matching technical signals found in the analyzed evidence (does not prove absence). |

### Version Verifiability Classification
- **Explicit Version (`explicit_version`)**: Extracted from authoritative meta generator tags, public runtime version variables, or explicit HTTP response headers.
- **Asset Version Hint (`asset_hint_unverified`)**: Extracted from URL query strings (e.g. `?ver=6.4.2`). Clearly marked as an unverified asset hint rather than a verified backend installation.
- **Inferred Version (`inferred_version`)**: Derived from dependency manifests or bundle fingerprints.
- **Unknown Version (`unknown`)**: No credible version string observed.

---

## 3. Extensible Fingerprint Schema

Each fingerprint in `app.technology.fingerprints.schema.TechnologyFingerprint` defines:

```python
@dataclass
class TechnologyFingerprint:
    id: str                                  # Unique stable slug (e.g., "strapi")
    name: str                                # Human-readable name (e.g., "Strapi")
    category: TechnologyCategory             # Canonical category enum
    subcategory: str                         # Subcategory (e.g., "headless_cms")
    vendor_or_type: str                      # Organization or product category
    website: str                             # Official documentation / vendor URL
    description: str                         # High-level overview
    signatures: FingerprintSignatures        # Multi-vector observable patterns
    implies: List[str]                       # Implied dependency slugs
    confidence_weight: float                 # Platform base confidence weight (0.80 - 1.0)
    version_rules: List[VersionExtractionRule] # Deterministic version extraction
    known_false_positives: List[str]         # Documented false-positive scenarios
    limitations: str                         # Disclosed boundary limitations
    default_provenance: EvidenceProvenance   # First-party vs third-party embed
```

### Supported Observable Vectors in `FingerprintSignatures`:
- `meta_generators`: Regular expressions matching `<meta name="generator" content="...">`
- `headers`: Map of lowercase header name to regular expression pattern
- `cookies`: Known cookie names or prefixes in `Set-Cookie` or header cookies
- `script_sources`: Substrings or regexes matching `<script src="...">`
- `stylesheet_hrefs`: Substrings or regexes matching `<link rel="stylesheet" href="...">`
- `dom_markers`: Distinct DOM elements, attributes, or IDs (e.g., `data-wf-page`, `ng-version`, `id:__next`)
- `inline_markers`: Distinct global variables, JSON objects, or comment markers (e.g., `wp.apiFetch`, `Shopify.theme`)
- `html_comments`: Distinct comments left by plugins/builders (e.g., `<!-- / SEO by Rank Math`)
- `asset_urls`: URLs of static media or CDN assets, evaluated with `min_assets_for_detection` guards
- `body_classes`: Bounded class substrings on the `<body>` element

---

## 4. How to Add New Fingerprints Without Changing Core Services

Adding support for any new web technology does not require modifying `UniversalFingerprintEngine`, `TechnologyDetector`, or any database schema.

### Step 1: Open the Fingerprint Catalog
Navigate to:
`backend/app/technology/fingerprints/catalog.py`

### Step 2: Add the Definition to `_build_catalog()`
```python
add(
    TechnologyFingerprint(
        id="new_tech_slug",
        name="New Technology Name",
        category=TechnologyCategory.frontend, # or cms, backend, hosting, analytics, etc.
        subcategory="framework",
        vendor_or_type="Vendor Name",
        website="https://example.com",
        description="High-level description of what the technology does.",
        implies=["dependency_slug"],
        confidence_weight=0.95,
        signatures=FingerprintSignatures(
            meta_generators=[r"NewTech\s*([0-9\.]+)?"],
            headers={"x-powered-by": r"NewTech"},
            script_sources=[r"/new-tech-client(\.min)?\.js"],
            dom_markers=["data-new-tech-app"],
        ),
        version_rules=[
            VersionExtractionRule(
                source_type="meta_generator",
                regex=r"NewTech\s*([0-9\.]+)",
                version_type=VersionType.explicit_version,
            )
        ],
        limitations="Client-side observation only.",
    )
)
```

### Step 3: Run Catalog Integrity Tests
```bash
pytest backend/tests/test_technology_fingerprint_engine.py
```
The new fingerprint is automatically compiled, loaded into `TechnologyRegistry`, surfaced through `TechnologyDetector`, and stored in the database without any schema migrations.
