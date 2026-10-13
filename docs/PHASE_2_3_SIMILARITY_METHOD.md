# Phase 2 — Task 2.3: Similarity Method & Content Fingerprinting Documentation

## 1. Primary Content Extraction Pipeline

Raw HTML contains persistent site-wide boilerplate (navigation headers, mobile menus, footers, cookie banners, tracking scripts, and stylesheets) that would cause distinct pages to falsely appear identical or near-duplicate.

### 1.1 Boilerplate Stripping
The `MainContentExtractor` (`backend/app/content/extractor.py`) removes non-content elements prior to text processing:
- **Structural Boilerplate Elements**: `<nav>`, `<footer>`, `<header>`, `<aside>`
- **Non-Text / Script Elements**: `<script>`, `<style>`, `<noscript>`, `<iframe>`, `<svg>`, `<canvas>`
- **Boilerplate CSS Classes / IDs**: Elements with classes or IDs matching `nav`, `menu`, `footer`, `cookie`, `banner`, `sidebar`, `modal`, `header`, `widget`.

### 1.2 Semantic Element Prioritization
The extractor searches for the primary content container in order of confidence:
1. `<main>` element
2. `<article>` element
3. Container with `id` or `class` containing `content`, `main-content`, `post-content`, or `article-body`
4. Fallback to `<body>` (after all boilerplate tags are removed)

---

## 2. Text Normalization

The extracted text is transformed through deterministic normalization (`backend/app/content/normalizer.py`):
1. **Unicode NFKC Normalization**: Converts non-standard glyphs, full-width characters, and ligatures to standard forms.
2. **HTML Entity Decoding**: Converts `&amp;`, `&nbsp;`, `&#39;`, etc., to literal unicode characters.
3. **Whitespace Compaction**: Collapses multiple whitespace characters, tabs, and newlines into single spaces; trims leading and trailing spaces.
4. **Case Folding**: Converts to lowercase for case-insensitive matching.
5. **Tokenization & N-Grams**:
   - Single-word tokens (words of length $\ge 2$).
   - Word bigrams (adjacent word pairs) to capture phrasal structure.

---

## 3. Fingerprinting Methods

### 3.1 Exact Content Digest: Normalized SHA-256
- `normalized_main_text_sha256 = hashlib.sha256(normalized_text.encode('utf-8')).hexdigest()`
- Stored as a 64-character lowercase hex string.
- If two pages have the same normalized SHA-256 digest, they contain identical primary content text.

### 3.2 Near-Duplicate Signature: SimHash-64
SimHash is a locality-sensitive hashing (LSH) algorithm developed by Moses Charikar. Similar texts produce hashes with small Hamming distances (few differing bit positions).

#### Algorithm:
1. Initialize an array of 64 integers `V = [0] * 64`.
2. For each feature (word unigram and bigram) $f$ with weight $w_f$:
   - Compute standard 64-bit hash $h(f)$ via MD5:
     `h = int(hashlib.md5(f.encode('utf-8')).hexdigest()[:16], 16)`
   - For each bit position $i \in [0, 63]$:
     - If bit $i$ of $h$ is 1: $V[i] \gets V[i] + w_f$
     - If bit $i$ of $h$ is 0: $V[i] \gets V[i] - w_f$
3. Compute the final 64-bit integer fingerprint:
   - For each bit position $i \in [0, 63]$:
     - If $V[i] > 0$: bit $i$ of fingerprint is 1
     - Else: bit $i$ of fingerprint is 0
4. Format as a **16-character fixed-width lowercase hex string** (`f"{fingerprint:016x}"`).

#### Storage Safety:
SQLite handles 64-bit signed integers (`-9223372036854775808` to `9223372036854775807`). Unsigned 64-bit integer values where the most significant bit is 1 overflow SQLite integers. Storing signatures as a 16-character hex string prevents overflow errors and preserves database portability.

---

## 4. Similarity Metrics & Thresholds

### 4.1 Hamming Distance
The number of bit positions in which two 64-bit SimHash values differ:
$$	ext{HammingDistance}(h_1, h_2) = 	ext{popcount}(h_1 \oplus h_2)$$

### 4.2 Normalized Similarity Metric
$$	ext{SimHashSimilarity}(h_1, h_2) = 1.0 - rac{	ext{HammingDistance}(h_1, h_2)}{64.0}$$

### 4.3 Conservative Candidate Criteria
A pair of pages is flagged as a near-duplicate review candidate **only** when all of the following conditions are met:
1. **Minimum Word Count**: Both pages must have $\ge 20$ words of meaningful extracted primary text (`insufficient_text` excluded).
2. **Hamming Distance $\le 3$**: No more than 3 differing bits out of 64 ($\ge 95.3\%$ bit alignment).
3. **Comparable Length**: $rac{\min(	ext{len}_1, 	ext{len}_2)}{\max(	ext{len}_1, 	ext{len}_2)} \ge 0.75$ (pages must have comparable text lengths).

---

## 5. Algorithmic Complexity & Scalability

For up to 500 crawled pages per audit:
- Naive all-pairs comparison involves $rac{N(N-1)}{2} = rac{500 	imes 499}{2} = 124,750$ comparisons, which execute in under 40ms in pure Python.
- Pre-filtering candidates by word count bucket and length ratio reduces the active comparison space by $>80\%$.
- Connected components are formed using a disjoint-set (union-find) structure, avoiding transitive drift.

---

## 6. Limitations & False Positive Protections

1. **Not a Semantic Vector Embedding**: SimHash detects lexical similarity and token overlap, not semantic meaning. Two pages discussing the same concept with completely different vocabulary will not match.
2. **No Ranking Guarantee**: Near-duplicate detection is an advisory SEO signal. Search engines may accept intentional variations (e.g. multi-region or paginated pages).
3. **No External Network Calls**: The similarity pipeline runs entirely in-memory and on-CPU without GPUs, Ollama, or third-party APIs.
