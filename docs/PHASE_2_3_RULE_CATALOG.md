# Phase 2 — Task 2.3: Site-Wide SEO Rule Catalog

This catalog documents the 13 new Site-Wide SEO rules implemented in Phase 2 Task 2.3.
With these 13 rules, the platform provides **51 total deterministic SEO rules** (16 On-Page + 22 Technical + 13 Site-Wide).

---

## 1. Duplicate Content Rules

### 1.1 `SITE_CONTENT_DUPLICATE_EXACT`
- **Category**: `content`
- **Subcategory**: `duplicate_content`
- **Default Severity**: `high`
- **Purpose**: Detect distinct crawled pages featuring identical normalized main-body text.
- **Evidence Required**:
  - `sha256`: SHA-256 hash of normalized main text.
  - `duplicate_count`: Number of pages with this exact hash ($\ge 2$).
  - `affected_urls`: List of affected URLs.
  - `sample_excerpt`: Bounded snippet of normalized content.
- **Status Evaluation**:
  - `fail` when $\ge 2$ usable pages share the exact same normalized content hash.
  - `pass` when each page has a unique normalized content hash.
- **SEO Guidance**: Multiple identical pages compete against each other in Google search rankings and dilute link equity. Consolidate via 301 redirects, implement preferred canonical tags, or customize content.

---

### 1.2 `SITE_CONTENT_DUPLICATE_NEAR`
- **Category**: `content`
- **Subcategory**: `duplicate_content`
- **Default Severity**: `medium`
- **Purpose**: Identify pages with near-duplicate content that share high textual similarity but differ slightly in boilerplate or phrasing.
- **Evidence Required**:
  - `hamming_distance`: SimHash-64 Hamming distance ($\le 3$).
  - `simhash_similarity`: Normalized SimHash metric ($1 - 	ext{distance}/64$).
  - `length_ratio`: Content length ratio between candidate pairs ($\ge 0.75$).
  - `simhash_a`, `simhash_b`: 16-character hex signatures of paired pages.
- **Status Evaluation**:
  - `warning` when candidate pairs meet the conservative threshold ($\le 3$ bits difference, $\ge 0.75$ length ratio, minimum word count $\ge 20$).
  - `pass` when no near-duplicate candidate clusters exist.
- **SEO Guidance**: Near-duplicate pages (e.g. city landing pages, thin e-commerce variations) may be treated as duplicates by search engines. Review for content differentiation or canonical consolidation.

---

## 2. Duplicate Metadata Rules

### 2.1 `SITE_TITLE_DUPLICATE`
- **Category**: `content`
- **Subcategory**: `metadata`
- **Default Severity**: `medium`
- **Purpose**: Identify multiple distinct pages sharing the exact same title tag text.
- **Evidence Required**:
  - `normalized_title`: Case-folded, whitespace-normalized title.
  - `duplicate_count`: Number of pages sharing this title.
  - `affected_urls`: URLs sharing the title.
- **Status Evaluation**:
  - `warning` when $\ge 2$ pages share the same normalized title.
  - `pass` when all page titles are unique.
- **SEO Guidance**: Unique titles help search engines distinguish page purpose and improve click-through rates.

---

### 2.2 `SITE_META_DESCRIPTION_DUPLICATE`
- **Category**: `content`
- **Subcategory**: `metadata`
- **Default Severity**: `low`
- **Purpose**: Identify multiple distinct pages sharing the exact same meta description.
- **Evidence Required**:
  - `normalized_description`: Case-folded, whitespace-normalized description.
  - `duplicate_count`: Number of pages sharing this description.
  - `affected_urls`: URLs sharing the description.
- **Status Evaluation**:
  - `warning` when $\ge 2$ pages share the same meta description.
  - `pass` when all page descriptions are distinct.
- **SEO Guidance**: Unique meta descriptions provide accurate snippets in search results.

---

### 2.3 `SITE_H1_DUPLICATE`
- **Category**: `content`
- **Subcategory**: `headings`
- **Default Severity**: `low`
- **Purpose**: Identify multiple pages sharing the same primary H1 heading text.
- **Evidence Required**:
  - `normalized_h1`: Case-folded, whitespace-normalized H1 text.
  - `duplicate_count`: Number of pages sharing this H1.
  - `affected_urls`: URLs sharing the H1.
- **Status Evaluation**:
  - `warning` when $\ge 2$ distinct pages share the same primary H1 heading.
  - `pass` when H1 headings are unique.
- **SEO Guidance**: Shared H1 headings can indicate templating oversights or ambiguous topic targeting.

---

## 3. Internal Link Graph Rules

### 3.1 `SITE_NO_OBSERVED_INTERNAL_INLINKS`
- **Category**: `links`
- **Subcategory**: `internal_linking`
- **Default Severity**: `medium`
- **Purpose**: Flag non-seed pages for which no inbound internal hyperlinks were discovered during the crawl.
- **Evidence Required**:
  - `inbound_count`: 0
  - `discovery_mode`: E.g. `sitemap_only` or `unlinked_discovery`.
  - `crawl_sample_caveat`: Explains that limited crawl cannot prove complete orphan status.
- **Status Evaluation**:
  - `warning` when a non-seed page has 0 observed inbound internal links in the crawl sample.
  - `pass` when all pages have at least 1 inbound internal link.
- **SEO Guidance**: Pages without internal links are harder for crawlers to discover and rank. Add relevant contextual links from related content.

---

### 3.2 `SITE_LOW_INTERNAL_INLINKS`
- **Category**: `links`
- **Subcategory**: `internal_linking`
- **Default Severity**: `low`
- **Purpose**: Flag pages with very low inbound internal link coverage ($\le 2$ observed inlinks).
- **Evidence Required**:
  - `inbound_count`: Observed count of inbound links.
  - `threshold`: Configurable advisory threshold (default 2).
- **Status Evaluation**:
  - `warning` when a non-seed page has 1 or 2 inbound internal links.
  - `pass` when internal linking coverage is robust.
- **SEO Guidance**: Important landing pages should receive adequate internal link support from category or hub pages.

---

### 3.3 `SITE_DEEP_CRAWL_PATH`
- **Category**: `links`
- **Subcategory**: `crawl_depth`
- **Default Severity**: `low`
- **Purpose**: Identify pages located at high crawl depth ($\ge 4$ clicks from the seed).
- **Evidence Required**:
  - `observed_depth`: Minimum observed click depth from seed URL.
  - `depth_threshold`: Configurable depth threshold (default 4).
- **Status Evaluation**:
  - `warning` when depth $\ge 4$.
  - `pass` when all pages are reachable within 3 hops.
- **SEO Guidance**: Shallow site architecture (1-3 clicks) facilitates rapid crawl discovery and efficient PageRank distribution.

---

## 4. Link Health Rules

### 4.1 `SITE_INTERNAL_LINK_TO_4XX`
- **Category**: `links`
- **Subcategory**: `broken_links`
- **Default Severity**: `high`
- **Purpose**: Detect internal hyperlinks pointing to confirmed 4xx client error pages.
- **Evidence Required**:
  - `destination_url`: Broken target URL.
  - `http_status`: Confirmed 4xx response code (e.g. 404, 410).
  - `linking_pages`: List of source page URLs containing the link.
- **Status Evaluation**:
  - `fail` when at least one internal link points to a confirmed 4xx page.
  - `pass` when no links point to broken 4xx pages.
- **SEO Guidance**: Broken internal links waste crawl budget and damage user experience. Update or remove the dead links.

---

### 4.2 `SITE_INTERNAL_LINK_TO_5XX`
- **Category**: `links`
- **Subcategory**: `server_errors`
- **Default Severity**: `critical`
- **Purpose**: Detect internal hyperlinks pointing to confirmed 5xx server error pages.
- **Evidence Required**:
  - `destination_url`: Server error target URL.
  - `http_status`: Confirmed 5xx response code (e.g. 500, 502, 503).
  - `linking_pages`: Source URLs.
- **Status Evaluation**:
  - `fail` when internal links point to 5xx error responses.
  - `pass` when no internal links point to server errors.
- **SEO Guidance**: Links to server errors point to application crashes or infrastructure outages requiring immediate remediation.

---

### 4.3 `SITE_INTERNAL_LINK_TO_REDIRECT`
- **Category**: `links`
- **Subcategory**: `redirects`
- **Default Severity**: `low`
- **Purpose**: Detect internal links pointing to URLs that perform 3xx redirects rather than linking directly to the destination.
- **Evidence Required**:
  - `redirect_url`: Initial linked URL.
  - `final_destination_url`: Final resolved URL.
  - `http_status`: 301, 302, 307, or 308.
  - `linking_pages`: Source URLs.
- **Status Evaluation**:
  - `warning` when internal links target redirecting URLs.
  - `pass` when internal links target direct 200 OK canonical URLs.
- **SEO Guidance**: Update internal links to point directly to final canonical URLs to eliminate unnecessary redirect latency.

---

## 5. Canonical Consolidation Rules

### 5.1 `SITE_DUPLICATE_CANONICAL_REVIEW`
- **Category**: `technical`
- **Subcategory**: `canonical`
- **Default Severity**: `medium`
- **Purpose**: Highlight duplicate or near-duplicate page groups where canonicalization signals require manual review.
- **Evidence Required**:
  - `duplicate_group_id`: Group fingerprint.
  - `canonical_targets`: Distinct canonical targets declared across the group.
  - `affected_urls`: URLs in the cluster.
- **Status Evaluation**:
  - `warning` when duplicates have inconsistent or distinct self-referencing canonicals.
  - `pass` when duplicates correctly consolidate to a single agreed canonical URL.
- **SEO Guidance**: When pages are equivalent, specify a single consistent canonical target across all copies.

---

### 5.2 `SITE_CONTENT_CANONICAL_CONFLICT`
- **Category**: `technical`
- **Subcategory**: `canonical`
- **Default Severity**: `high`
- **Purpose**: Detect direct conflicts where duplicate content copies actively declare mutually conflicting or invalid canonical URLs.
- **Evidence Required**:
  - `conflicting_canonicals`: Multiple divergent canonical declarations.
  - `observed_target_status`: Target status code (e.g. 404).
- **Status Evaluation**:
  - `fail` when canonical targets conflict or resolve to error status codes.
  - `pass` when canonical targets are consistent and valid.
- **SEO Guidance**: Conflicting canonical tags confuse search engine crawlers and can cause Google to ignore declared canonical hints entirely.
