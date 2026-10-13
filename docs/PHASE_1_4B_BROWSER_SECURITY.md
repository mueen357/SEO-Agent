# Phase 1.4B — Browser Network Security & SSRF Defense

## 1. The Challenge of Untrusted Browser Rendering

Playwright Chromium does not share the Python application's socket stack. When Chromium navigates to an untrusted URL, it independently initiates outbound network requests for:
- HTML documents and IFRAMEs
- External JavaScript files and web workers
- CSS stylesheets and web fonts
- Image assets, media streams, and favicons
- Background `fetch()`, `XMLHttpRequest`, and WebSocket connections
- Service worker cache requests
- HTTP redirects (301, 302, 307, 308)

Relying solely on Playwright's `page.route()` interception is insufficient as a security boundary because Chromium internal requests, certain WebSockets, service workers, and low-level DNS resolutions can bypass high-level DevTools route hooks.

---

## 2. Multi-Layered Security Architecture

### Layer 1: Validating Egress Proxy (`app/renderer/egress_proxy.py`)
- A custom, asynchronous forward HTTP and `CONNECT` proxy (`ValidatingEgressProxy`) binds locally to `127.0.0.1`.
- **Destination Verification:** For every incoming HTTP request or HTTPS `CONNECT` tunnel:
  1. Resolves the target hostname using the system's DNS resolver.
  2. Evaluates the resolved IPv4/IPv6 address against `is_public_ip()`.
  3. Rejects loopback (`127.0.0.0/8`, `::1`), private networks (RFC 1918 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`), link-local/APIPA (`169.254.0.0/16`, `fe80::/10`), IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`), and cloud metadata IP (`169.254.169.254`).
  4. Restricts outbound destination ports strictly to approved HTTP (80) and HTTPS (443) ports.
  5. Returns `HTTP 403 Forbidden` if any destination check fails, terminating the tunnel immediately.
- **Proxy Configuration:** Injected into Chromium context via `proxy={"server": f"http://127.0.0.1:{proxy_port}"}`.

### Layer 2: Chromium Hardening & Context Restrictions (`app/renderer/browser_security.py`)
- **TLS Certificate Verification:** `ignore_https_errors=False` is strictly maintained. Chromium enforces valid TLS certificates and aborts connections to invalid or expired certificates.
- **Downloads Disabled:** `accept_downloads=False` prevents malicious payload downloads.
- **Permissions Denied:** `permissions=[]` denies geolocation, notifications, camera, microphone, and clipboard access.
- **Service Workers Blocked:** `service_workers="block"` isolates the context from persistent background workers.
- **Profile Isolation:** Fresh, ephemeral browser context per audit. Never mounts or accesses the user's host Chrome profile.
- **Hardened CLI Arguments:**
  - `--no-default-browser-check`
  - `--disable-background-networking`
  - `--disable-sync`
  - `--disable-translate`
  - `--disable-component-update`
  - `--metrics-recording-only`
  - `--no-first-run`
  - `--safebrowsing-disable-auto-update`
  - `--disable-local-storage` (where ephemeral storage is preferred)

### Layer 3: Secondary Route Filtering (Defense-in-Depth)
- `BrowserSecurityManager.setup_route_interception()` attaches `context.route("**/*")` to inspect all DevTools-level requests, immediately aborting non-HTTP schemes (e.g., `file://`, `data:`, `blob:`, `chrome://`, `chrome-extension://`).

---

## 3. Host Isolation Reality & Default Security Posture

### The Windows Host Isolation Constraint
True multi-tenant containerized network isolation requires Linux kernel network namespaces (`netns`), cgroups, or container network interfaces (CNI) with strict outbound firewall rules (e.g., iptables/nftables) that physically drop packets bound for private subnets.

On a standard Windows development or production workstation without dedicated Docker/container sandboxing:
- Chromium processes run as host child processes.
- While the validating egress proxy blocks outbound connections routed through it, a malicious exploit in Chromium or direct egress bypass could theoretically attempt unproxied connections if Chromium is misconfigured.

### The Honest Security Default
To prevent false security claims:
1. **Public-Site Dynamic Rendering is DISABLED by Default:**
   - Setting: `RENDERER_ALLOW_PUBLIC_RENDERING = False` in `app/config.py`.
2. **Safe Fallback (`RENDER_UNAVAILABLE`):**
   - When public rendering is disabled, the system reports `render_strategy="RENDER_UNAVAILABLE"` and `render_reason="Public website JavaScript rendering is disabled by default on uncontained host. Network container isolation required."`.
   - The crawler continues with safe, complete HTTP-only crawling without failing or hallucinating dynamic content.
3. **Verified Offline Testing:**
   - Full Chromium rendering is thoroughly tested and verified using deterministic offline HTML/JS fixtures and safe localhost test servers running within the test boundary.
