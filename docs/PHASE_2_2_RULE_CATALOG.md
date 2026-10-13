# Phase 2 — Task 2.2: Technical SEO Rule Catalog (22 Rules)

| Rule ID | Subcategory | Severity | Status Conditions | Description & Google Search Central Reference |
| :--- | :--- | :--- | :--- | :--- |
| `TECH_HTTP_4XX` | `http_status` | High | Fail on 4xx | Flags client error status codes (400, 403, 404, 410) preventing indexing. |
| `TECH_HTTP_5XX` | `http_status` | Critical | Fail on 5xx | Flags server error codes (500, 502, 503) indicating server unavailability or crash. |
| `TECH_HTTP_429` | `http_status` | High | Fail on 429 | Flags rate-limiting (429 Too Many Requests) that throttles Googlebot crawls. |
| `TECH_HTTP_UNSUPPORTED_CONTENT` | `http_status` | Medium | Warning on non-HTML | Flags non-HTML content types (e.g., application/octet-stream, binary) crawled as webpages. |
| `TECH_META_ROBOTS_DIRECTIVES` | `robots` | Varies | Warning on noindex/none | Flags pages containing `noindex`, `none`, or `noimageindex` directives excluding them from SERPs. |
| `TECH_X_ROBOTS_TAG` | `indexability` | Varies | Warning/Fail on header | Evaluates `X-Robots-Tag` HTTP response headers for `noindex` or `unavailable_after`. |
| `TECH_ROBOTS_FETCH_STATUS` | `robots_txt` | Medium | Warning on 5xx/403 | Evaluates fetch status of `/robots.txt` (warns if inaccessible or throwing 5xx). |
| `TECH_ROBOTS_DISALLOW` | `robots_txt` | Medium | Warning on blocked | Flags crawled URLs matching `Disallow` rules in `robots.txt`. |
| `TECH_ROBOTS_SITEMAP_DECLARATION` | `robots_txt` | Low | Warning if missing | Advises on declaring XML sitemaps within `robots.txt` for crawl discovery. |
| `TECH_SITEMAP_AVAILABILITY` | `sitemap` | Medium | Warning if no sitemaps | Checks whether at least one accessible XML sitemap was discovered for the audit domain. |
| `TECH_SITEMAP_PARSE_ERROR` | `sitemap` | High | Fail on parse failure | Flags invalid XML syntax, truncated payloads, or unparseable sitemap indexes. |
| `TECH_SITEMAP_URL_STATUS` | `sitemap` | High | Fail on non-200 | Flags URLs listed in sitemaps that return 4xx, 5xx, or failed fetch statuses. |
| `TECH_SITEMAP_NOINDEX_CONFLICT` | `sitemap` | High | Fail on conflict | Flags conflicting signals where a sitemap URL declares a `noindex` directive. |
| `TECH_SITEMAP_CANONICAL_CONFLICT` | `sitemap` | Medium | Warning on conflict | Flags sitemap URLs pointing canonical tags away to an alternate target URL. |
| `TECH_REDIRECT_CHAIN` | `redirects` | Medium | Warning on hops >= 2 | Flags redirect chains requiring 2 or more hops to reach final destination. |
| `TECH_REDIRECT_LOOP` | `redirects` | Critical | Fail on circular | Flags circular redirect loops preventing crawlers from reaching content. |
| `TECH_REDIRECT_FAILURE` | `redirects` | High | Fail on dead-end | Flags 3xx redirects pointing to 4xx/5xx URLs or failing to resolve. |
| `TECH_CANONICAL_TARGET_STATUS` | `canonical` | High | Fail on non-200 | Flags canonical links specifying a target URL that returns 4xx or 5xx. |
| `TECH_CANONICAL_CONFLICT` | `canonical` | Medium | Warning on self vs diff | Flags discrepancies where canonical points to a different valid URL. |
| `TECH_CANONICAL_MULTIPLE` | `canonical` | High | Fail on count > 1 | Flags pages declaring multiple conflicting `<link rel="canonical">` tags. |
| `TECH_HTTPS_USAGE` | `https` | High | Fail on HTTP scheme | Flags insecure HTTP URLs on production websites. |
| `TECH_HTTPS_DOWNGRADE` | `https` | Critical | Fail on HTTPS->HTTP | Flags insecure redirects that downgrade from HTTPS to HTTP. |
