# Phase 1 — Task 1.4A: Secure HTTP Crawling Engine Architecture

## 1. Executive Summary

Phase 1.4A introduces a secure, decoupled, asynchronous HTTP crawling engine and background audit execution pipeline for the AI-Powered Website Audit Agent.

All findings originate strictly from real HTTP responses and parsed DOM trees. Long-running website audits are completely decoupled from active HTTP requests via durable SQLite-backed worker job leases, robust URL discovery, RFC 9309-compliant `robots.txt` enforcement, and safe XML sitemap parsing.

---

## 2. Crawler Package Architecture

The crawling subsystem is organized into modular, testable, decoupled components located under `backend/app/crawler/`:

```
backend/app/crawler/
    ├── __init__.py            # Clean public API exports
    ├── policies.py            # CrawlConfig and FetchResult data structures
    ├── scope.py               # Strict hostname, port, and scheme boundaries
    ├── normalizer.py          # Deterministic URL canonicalization & resolution
    ├── secure_transport.py    # Custom ValidatedDNSResolver and SSRF protection
    ├── fetcher.py             # SecureHTTPFetcher (manual redirects, size caps)
    ├── robots.py              # RFC 9309 robots.txt discovery and adherence
    ├── sitemap.py             # defusedxml XML sitemap and index parsing
    ├── parser.py              # BeautifulSoup4 + lxml HTML metadata extraction
    ├── discovery.py           # CrawlQueue with deduplication and depth limits
    └── engine.py              # CrawlEngine asynchronous execution coordinator
```

### Component Responsibilities

1. **`policies.py` (`CrawlConfig`, `FetchResult`)**:
   - Encapsulates bounded configuration parameters:
     - `max_pages` (default: 50, clamp: 1-500)
     - `max_depth` (default: 3, clamp: 0-10)
     - `request_timeout` (default: 15.0s, clamp: 2-60s)
     - `max_redirects` (default: 5, clamp: 0-10)
     - `max_response_bytes` (default: 5 MB, clamp: 100 KB - 25 MB)
     - `requests_per_second` (default: 1.0, clamp: 0.1 - 10.0)
     - `per_host_concurrency` (strictly 1 for polite single-host crawling)
     - `include_subdomains` (default `False`, subdomains excluded)
     - `respect_robots_txt` (default `True`)
     - `parse_sitemaps` (default `True`)

2. **`scope.py` (`CrawlScope`)**:
   - Enforces strict target boundaries:
     - Scheme must be `http` or `https`.
     - Port must be 80 or 443 (or match target default).
     - Candidate hostname must match target hostname exactly (case-insensitive).
     - Subdomains are excluded by default.
     - Disallows embedded credentials (`user:pass@host`).
     - Rejects deceptive attacker suffixes (`example.com.evil.com`).

3. **`normalizer.py` (`normalize_url`)**:
   - Deterministic normalization:
     - Joins relative and root-relative paths against base URL.
     - Strips fragments (`#section`).
     - Strips default ports (`:80` for HTTP, `:443` for HTTPS).
     - Lowercases scheme and netloc.
     - Collapses redundant path slashes and resolves `.` and `..` segments.
     - Sorts query string parameters deterministically without discarding valid parameters.

4. **`secure_transport.py` (`ValidatedDNSResolver`, `is_public_ip`)**:
   - Mandatory socket-level security boundary (see Security Review document).

5. **`fetcher.py` (`SecureHTTPFetcher`)**:
   - Outbound HTTP fetching via `aiohttp.ClientSession(trust_env=False)`.
   - Automatic redirect following is disabled (`allow_redirects=False`).
   - Every redirect hop is evaluated individually:
     - Destination scope checked.
     - Redirect count bounded (max 5).
     - Redirect loops detected and aborted.
     - Response body streamed in chunks up to `max_response_bytes` (5 MB).

6. **`robots.py` (`RobotsChecker`)**:
   - Discovers `/robots.txt`.
   - Parses `User-agent`, `Allow`, `Disallow`, `Sitemap`, and `Crawl-delay`.
   - Complies with RFC 9309 (longest-matching rule precedence; ties favor Allow).
   - Handles 404 (allowed), 401/403 (conservative block), and 5xx safely.

7. **`sitemap.py` (`SitemapParser`)**:
   - Safe XML parsing via `defusedxml.ElementTree` (immune to XML entity expansion / XXE).
   - Traverses `<urlset>` and recurses `<sitemapindex>` up to depth 3.
   - Filters all discovered URLs through `CrawlScope`.
   - Handles Gzip-compressed sitemaps with safe buffer limits.

8. **`parser.py` (`HTMLPageParser`)**:
   - Parses HTML using BeautifulSoup with `lxml`.
   - Extracts page title, meta description (ignoring `og:description`), canonical link, meta robots directive, html lang.
   - Computes H1-H6 heading counts and samples.
   - Analyzes images for missing and empty alt attributes.
   - Classifies links into internal and external; computes content SHA-256 hash.

9. **`discovery.py` (`CrawlQueue`)**:
   - FIFO queue (`collections.deque`) tracking URL, crawl depth, and source URL.
   - Deduplication via `seen_urls` set.
   - Tracks granular skip metrics: `duplicate`, `out_of_scope`, `depth_limit`, `robots_blocked`.

10. **`engine.py` (`CrawlEngine`)**:
    - Asynchronous workflow coordinator.
    - Seeds queue with target URL and discovered sitemap URLs.
    - Applies polite rate-limiting delay between requests.
    - Invokes cancellation, heartbeat, and persistence callbacks.

---

## 3. Database Schema Extensions

Alembic migration `0002_add_crawler_tables.py` introduces three tables and extends `audits`:

### `crawl_pages` Table
| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Unique page record ID |
| `audit_id` | UUID (FK) | Reference to `audits.id` (CASCADE) |
| `requested_url` | VARCHAR(2048) | Initially requested URL |
| `final_url` | VARCHAR(2048) | URL after redirects |
| `depth` | INTEGER | Crawl depth level (0 for seed) |
| `fetch_status` | VARCHAR(32) | Status: `success`, `http_error`, `timeout`, `network_error`, `ssrf_blocked`, `size_exceeded`, `scope_blocked`, `robots_blocked`, `unsupported_media` |
| `http_status` | INTEGER | HTTP response status code (e.g. 200, 404) |
| `content_type` | VARCHAR(128) | Response Content-Type header |
| `response_time_ms` | INTEGER | Round-trip response time in ms |
| `redirect_chain_json`| JSON | List of redirect hops |
| `title` | VARCHAR(512) | Page title |
| `meta_description` | VARCHAR(1024) | Meta description |
| `canonical_url` | VARCHAR(2048) | Canonical link |
| `meta_robots` | VARCHAR(256) | Robots directive |
| `html_lang` | VARCHAR(64) | Language code |
| `headings_json` | JSON | Counts and samples for H1-H6 |
| `image_count` | INTEGER | Total image count |
| `missing_alt_count`| INTEGER | Images missing alt tag |
| `empty_alt_count` | INTEGER | Images with empty alt tag |
| `internal_link_count`| INTEGER | Total internal links on page |
| `external_link_count`| INTEGER | Total external links on page |
| `content_hash` | VARCHAR(64) | SHA-256 of response body |
| `error_message` | TEXT | Detailed error if fetch failed |
| `fetched_at` | DATETIME | Timestamp of fetch |

### `crawl_links` Table
| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Link record ID |
| `audit_id` | UUID (FK) | Reference to `audits.id` |
| `source_page_id` | UUID (FK) | Reference to `crawl_pages.id` |
| `destination_url` | VARCHAR(2048) | Target hyperlink URL |
| `link_text` | VARCHAR(512) | Anchor text |
| `internal` | BOOLEAN | Internal vs external flag |
| `discovered_at` | DATETIME | Timestamp discovered |

### `crawl_sitemaps` Table
| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Sitemap record ID |
| `audit_id` | UUID (FK) | Reference to `audits.id` |
| `sitemap_url` | VARCHAR(2048) | Sitemap XML URL |
| `status` | VARCHAR(32) | `success`, `fetch_error`, `parse_error` |
| `url_count` | INTEGER | In-scope URLs discovered |
| `error_message` | TEXT | Parsing error message if any |
| `discovered_at` | DATETIME | Timestamp discovered |

### `audits` Table Additions
- `worker_token` (VARCHAR(64), nullable): Identifies the worker holding the lease.
- `lease_expires_at` (DATETIME, nullable): Lease expiration timestamp.
- `heartbeat_at` (DATETIME, nullable): Last heartbeat timestamp.
- `progress_json` (JSON, default `{}`): Real-time progress statistics.

---

## 4. Background Worker Architecture

- **Executable:** `python -m app.workers.crawl_worker`
- **Leasing Mechanism:**
  - Worker atomically queries for jobs with `status = 'queued'` OR (`status = 'crawling'` and `lease_expires_at < now`).
  - Worker claims job with unique `worker_token` and default 60-second lease window.
  - Heartbeat renewed after each page fetch.
  - If a job is cancelled by the user, the worker detects cancellation at next heartbeat and halts crawling without overwriting `cancelled` status.
