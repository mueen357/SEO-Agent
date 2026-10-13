# Phase 1 — Task 1.4A: Crawler Security Review & SSRF Defenses

## 1. Threat Model & Security Posture

Web crawlers by definition fetch untrusted, third-party remote endpoints supplied by users or discovered dynamically through hyperlinks, redirects, and sitemaps. 

Without rigorous network protections, an attacker could manipulate the crawler to probe internal microservices, access cloud instance metadata (`169.254.169.254`), abuse open redirects, trigger denial of service via decompression bombs, or perform DNS rebinding (TOCTOU) attacks.

Phase 1.4A implements a multi-layered defense-in-depth security perimeter.

---

## 2. SSRF Protections & Network Boundary

### Strict IP Address Validation (`is_public_ip`)
Every resolved IP address is validated against both IPv4 and IPv6 prohibited ranges:
- **Private RFC 1918:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- **Loopback:** `127.0.0.0/8`, `::1/128`
- **Link-Local & Cloud Metadata:** `169.254.0.0/16`, specifically AWS/GCP/Azure metadata `169.254.169.254` and `169.254.169.123`
- **IPv6 Link-Local & Unique Local:** `fe80::/10`, `fc00::/7`
- **IPv4-Mapped IPv6:** `::ffff:0:0/96` (e.g. `::ffff:127.0.0.1`, `::ffff:169.254.169.254`) are unwrapped and checked as IPv4
- **Shared Address Space (CGNAT):** `100.64.0.0/10`
- **Benchmarking & Documentation:** `198.18.0.0/15`, `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`
- **Multicast & Reserved:** `224.0.0.0/4`, `240.0.0.0/4`

### DNS Pinning & DNS Rebinding Protection (`ValidatedDNSResolver`)
- Standard URL validation at request creation is insufficient because DNS records can change between pre-flight check and socket connection (Time-of-Check to Time-of-Use / DNS rebinding).
- Outbound socket connections use `ValidatedDNSResolver(aiohttp.abc.AbstractResolver)`:
  - Validates **every single candidate IP address** returned by `getaddrinfo()`.
  - **Rejects the entire resolution** with `SSRFSecurityError` if ANY candidate address is in a prohibited range.
  - Ensures a multi-homed domain returning `[public_ip, 127.0.0.1]` is immediately rejected.
- Connectors retain strict TLS certificate validation (`ssl=True`) and SNI hostname checking.
- Environment proxy inheritance is disabled (`trust_env=False`).

---

## 3. Manual Redirect Validation & Hop-by-Hop Enforcement

- **Automatic redirect following is disabled** (`allow_redirects=False`).
- Each redirect hop (301, 302, 303, 307, 308) is inspected manually:
  1. `Location` header is parsed and normalized against the current URL.
  2. Protocol must be `http` or `https`.
  3. Port is restricted strictly to 80 and 443.
  4. Scope boundary is checked: cross-host redirects outside the target hostname are rejected (`scope_blocked`).
  5. Redirect loop detection: visited URL set detects cycles immediately (`network_error`).
  6. Maximum redirect hops enforced (default: 5).

---

## 4. Resource Exhaustion & Denial of Service Defenses

1. **Response Size Limits:**
   - Pre-check `Content-Length`: if header > 5 MB (`max_response_bytes`), fetch aborted immediately.
   - Streaming byte cap: chunks are streamed with cumulative byte counters. If streamed bytes exceed 5 MB, socket connection is aborted immediately (`size_exceeded`).
2. **XML Entity Attacks & Decompression Bombs:**
   - Sitemaps are parsed exclusively using `defusedxml.ElementTree` (immune to entity expansion / Billion Laughs attack).
   - Gzip-compressed sitemaps (`.xml.gz`) enforce maximum decompression bounds.
   - Sitemap index recursion is bounded to depth 3 with maximum 20 sitemaps and 1,000 URLs.
3. **Rate Limiting & Politeness:**
   - Requests per second strictly enforced with asynchronous sleeps between requests.
   - `Crawl-delay` directives in `robots.txt` respected up to 10 seconds.
   - Per-host concurrency fixed at 1.

---

## 5. Security Verification Status

All 54 test cases in the test suite pass, including:
- Rejection of private IPv4 and IPv6 addresses.
- Rejection of cloud metadata IP addresses (`169.254.169.254`).
- DNS rebinding prevention via `ValidatedDNSResolver`.
- Redirect loops, cross-host redirects, and oversized responses handled cleanly.
