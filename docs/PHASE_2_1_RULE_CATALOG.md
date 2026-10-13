# Phase 2 — Task 2.1: On-Page SEO Rule Catalog

This catalog documents the 16 deterministic on-page SEO rules implemented in Phase 2 — Task 2.1. All rules adhere to Google Search Central best practices and reference official technical documentation.

---

## 1. Title Tag Rules (`on_page:title`)
*Reference: [Google Search Central — Control your title links in search results](https://developers.google.com/search/docs/appearance/title-link)*

### 1.1 `ONPAGE_TITLE_PRESENT`
- **Category / Subcategory:** `on_page` / `title`
- **Severity:** `high`
- **Status Logic:**
  - `fail`: Document contains no `<title>` tag, or title is empty whitespace.
  - `pass`: Non-empty `<title>` tag is present.
- **Evidence:** `page_url`, `document_title`, `character_count`, `source`.
- **Recommendation:** Add a concise, descriptive title inside the `<head>` element to communicate page topic to search engines and users.

### 1.2 `ONPAGE_TITLE_LENGTH`
- **Category / Subcategory:** `on_page` / `title`
- **Severity:** `low`
- **Status Logic:**
  - `warning` (Short): Length < 15 characters. May lack sufficient context.
  - `warning` (Long): Length > 70 characters. May be truncated in SERP display.
  - `pass`: 15 <= Length <= 70 characters.
  - `not_applicable`: Title tag is absent.
- **Limitation:** Character limits represent editorial guidelines, not hard Google ranking penalties. Title link display widths vary across desktop and mobile devices.

### 1.3 `ONPAGE_TITLE_REPETITIVE`
- **Category / Subcategory:** `on_page` / `title`
- **Severity:** `low`
- **Status Logic:**
  - `warning`: Words of 3+ letters repeated 3 or more times within the title string.
  - `pass`: No repeated word patterns.
  - `not_applicable`: Title tag is absent.
- **Recommendation:** Avoid keyword stuffing or repeated boilerplate brand phrases in title tags.

---

## 2. Meta Description Rules (`on_page:meta_description`)
*Reference: [Google Search Central — Control your snippets in search results](https://developers.google.com/search/docs/appearance/snippet)*

### 2.1 `ONPAGE_META_DESC_PRESENT`
- **Category / Subcategory:** `on_page` / `meta_description`
- **Severity:** `medium`
- **Status Logic:**
  - `fail`: Page HTML contains no `meta[name="description"]` tag, or content is whitespace.
  - `pass`: Non-empty meta description is present.
- **Evidence:** `page_url`, `meta_description`, `character_count`, `source`.
- **Note:** Standard SEO meta descriptions and Open Graph (`og:description`) tags are kept strictly distinct.

### 2.2 `ONPAGE_META_DESC_LENGTH`
- **Category / Subcategory:** `on_page` / `meta_description`
- **Severity:** `low`
- **Status Logic:**
  - `warning` (Short): Length < 50 characters.
  - `warning` (Long): Length > 160 characters. May exceed display snippet window.
  - `pass`: 50 <= Length <= 160 characters.
  - `not_applicable`: Meta description is absent.
- **Limitation:** Google dynamically selects snippets from on-page content when appropriate; length ranges are review advisories, not hard ranking signals.

---

## 3. Heading Structure Rules (`on_page:headings`)

### 3.1 `ONPAGE_H1_PRESENCE`
- **Category / Subcategory:** `on_page` / `headings`
- **Severity:** `medium`
- **Status Logic:**
  - `warning`: Page contains 0 `<h1>` tags.
  - `pass`: Page contains at least one `<h1>` tag.
- **Note:** Missing an H1 is not an indexing penalty, but structuring pages with an H1 communicates topic hierarchy to users and accessibility screen readers.

### 3.2 `ONPAGE_H1_MULTIPLE`
- **Category / Subcategory:** `on_page` / `headings`
- **Severity:** `low`
- **Status Logic:**
  - `warning`: Page contains > 1 `<h1>` tags.
  - `pass`: Page contains <= 1 `<h1>` tags.
- **Note:** HTML5 and Google support multiple H1 elements; this rule issues a structural review suggestion rather than a penalty claim.

### 3.3 `ONPAGE_H1_EMPTY`
- **Category / Subcategory:** `on_page` / `headings`
- **Severity:** `medium`
- **Status Logic:**
  - `fail`: `<h1>` tag exists but contains only whitespace or empty text.
  - `pass`: At least one `<h1>` tag contains readable text.
  - `not_applicable`: No `<h1>` tags present.

### 3.4 `ONPAGE_HEADING_HIERARCHY`
- **Category / Subcategory:** `on_page` / `headings`
- **Severity:** `low`
- **Status Logic:**
  - `warning`: Level jump detected (e.g., H2 exists, H3=0, but H4+ > 0).
  - `pass`: Heading levels follow sequential order.

---

## 4. Canonical URL Rules (`on_page:canonical`)
*Reference: [Google Search Central — Consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)*

### 4.1 `ONPAGE_CANONICAL_PRESENCE`
- **Category / Subcategory:** `on_page` / `canonical`
- **Severity:** `low`
- **Status Logic:**
  - `warning`: No `rel="canonical"` link tag is declared.
  - `pass`: Canonical tag is declared.

### 4.2 `ONPAGE_CANONICAL_VALID`
- **Category / Subcategory:** `on_page` / `canonical`
- **Severity:** `high` (for malformed URLs) / `low` (for cross-domain advisory)
- **Status Logic:**
  - `fail`: Canonical URL is malformed or lacks an absolute `http://` or `https://` scheme.
  - `warning`: Canonical points to an external domain (advises user to verify cross-domain syndication).
  - `pass`: Canonical is self-referencing or points to another page on the same domain.
  - `not_applicable`: Canonical tag is absent.

---

## 5. Image Alt Attribute Rules (`images:images`)
*Reference: [Google Search Central — Google Images best practices](https://developers.google.com/search/docs/appearance/google-images)*

### 5.1 `ONPAGE_IMAGE_ALT_MISSING`
- **Category / Subcategory:** `images` / `images`
- **Severity:** `medium`
- **Status Logic:**
  - `fail`: One or more `<img>` tags lack an `alt` attribute completely (`missing_alt_count > 0`).
  - `pass`: All images declare an `alt` attribute.
  - `not_applicable`: Page contains 0 images.

### 5.2 `ONPAGE_IMAGE_ALT_EMPTY`
- **Category / Subcategory:** `images` / `images`
- **Severity:** `low`
- **Status Logic:**
  - `warning`: One or more images have an empty alt attribute (`alt=""`).
  - `pass`: No images have empty alt attributes.
  - `not_applicable`: Page contains 0 images.
- **Important WCAG Distinction:** `alt=""` is valid and recommended for purely decorative presentation images. The rule explains this distinction clearly rather than labeling it an automatic failure.

---

## 6. Link Structure Rules (`links:links`)

### 6.1 `ONPAGE_INTERNAL_OUTLINKS`
- **Category / Subcategory:** `links` / `links`
- **Severity:** `low`
- **Status Logic:**
  - `warning`: Page has 0 outgoing internal links (`internal_link_count == 0`), creating an architecture dead-end.
  - `pass`: Page contains 1 or more outgoing internal links.

### 6.2 `ONPAGE_EMPTY_ANCHOR_TEXT`
- **Category / Subcategory:** `links` / `links`
- **Severity:** `low`
- **Status Logic:**
  - `warning`: Discovered links on the page have whitespace-only anchor text.
  - `pass`: All discovered links provide non-empty anchor text.
  - `not_applicable`: No link records available.

---

## 7. HTML Language Rule (`on_page:language`)

### 7.1 `ONPAGE_HTML_LANG`
- **Category / Subcategory:** `on_page` / `language`
- **Severity:** `low`
- **Status Logic:**
  - `warning`: The `<html>` tag lacks a `lang` attribute or is empty.
  - `warning`: Value does not conform to standard BCP 47 format (e.g. `en`, `es-ES`, `zh-CN`).
  - `pass`: Valid BCP 47 language code declared.
- **Important Constraint:** Does not assume English (`en`) or guess content language without true language detection.
