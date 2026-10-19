/**
 * In-Browser Web Crawler.
 * Fetches authorized HTML pages with scope enforcement, robots.txt policy,
 * redirect safety checks, content-type verification, and durable frontier state.
 */

import type {
  StandaloneAuditConfig,
  StandaloneCrawlPage,
  StandaloneContentCategory,
  StandaloneRobotsEvidence,
  StandaloneSitemapEvidence,
  RedirectHop,
} from '../types';
import { normalizeRobotsEvidence, normalizeSitemapEvidence, normalizeSitemapEntry } from '../types';
import { StandaloneDomParser } from '../audit/domParserEngine';
import { StandaloneSitemapParser, isSsrfTarget, readBoundedResponseBody } from './sitemapParser';

export interface ControlledRedirectResult {
  response: Response;
  finalUrl: string;
  redirectCount: number;
  redirectChain: RedirectHop[];
  disallowedRedirect: boolean;
  disallowedDestination?: string;
  redirectLimitReached: boolean;
  loopDetected: boolean;
  failureCategory?: string;
}

export interface CrawlCallbacks {
  onPageCrawled: (page: StandaloneCrawlPage) => Promise<void>;
  onProgress: (crawled: number, totalDiscovered: number, currentUrl: string) => void;
  isCancelled: () => boolean;
}

export interface RobotsRule {
  path: string;
  allow: boolean;
}

/**
 * Normalizes a path/query according to RFC 9309 §2.2.2 & RFC 3986 §2.3.
 * Decodes unreserved characters and uppercases percent-encoded hex sequences.
 */
export function normalizeRobotsPath(p: string): string {
  let norm = p.replace(/%[0-9a-fA-F]{2}/g, (match) => match.toUpperCase());
  norm = norm.replace(/%([0-9A-F]{2})/g, (match, hex) => {
    const code = parseInt(hex, 16);
    if (
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) || // a-z
      (code >= 0x30 && code <= 0x39) || // 0-9
      code === 0x2d || // -
      code === 0x2e || // .
      code === 0x5f || // _
      code === 0x7e    // ~
    ) {
      return String.fromCharCode(code);
    }
    return match;
  });
  return norm;
}

/**
 * Explicitly classifies an HTTP response or crawl outcome into canonical categories.
 */
export function classifyResponse(
  httpStatus: number,
  fetchStatus: string,
  headers?: Record<string, string>,
  errorCode?: string,
  htmlSize?: number
): StandaloneContentCategory {
  if (
    fetchStatus === 'timeout' ||
    httpStatus === 0 ||
    errorCode === 'FETCH_NETWORK_ERROR' ||
    errorCode === 'FETCH_TIMEOUT' ||
    errorCode === 'FETCH_PERMISSION_DENIED'
  ) {
    return 'NETWORK_FAILURE';
  }
  if (errorCode === 'FETCH_PARSE_FAILED') {
    return 'PARSE_FAILURE';
  }
  if (httpStatus >= 400 || httpStatus === 429) {
    return 'HTTP_ERROR';
  }
  const ct = (headers?.['content-type'] || '').toLowerCase();
  if (ct && ct.trim()) {
    if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) {
      return 'HTML_DOCUMENT';
    }
    return 'NON_HTML_RESOURCE';
  }
  if (htmlSize !== undefined && htmlSize > 0) {
    return 'HTML_DOCUMENT';
  }
  return 'UNKNOWN_CONTENT_TYPE';
}

export class InBrowserCrawler {
  private config: StandaloneAuditConfig;
  private origin: string;
  private hostname: string;
  private seenUrls = new Set<string>();
  private queue: Array<{ url: string; depth: number }> = [];
  private crawledUrls: string[] = [];
  private disallowedPaths: string[] = [];
  private allowDirectives: string[] = [];
  private disallowDirectives: string[] = [];
  private sitemapDeclarations: string[] = [];
  private rules: RobotsRule[] = [];
  private selectedUserAgent: string = '*';
  private robotsFetched = false;
  private robotsPolicyStatus: 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified' | 'forbidden' | 'server_error_disallow' = 'not_present_permissive';
  private robotsFailureReason:
    | 'none'
    | 'http_401_403'
    | 'http_429'
    | 'http_5xx'
    | 'connection_refused'
    | 'timeout'
    | 'redirect_blocked'
    | 'oversized'
    | 'malformed_content' = 'none';
  private robotsFailureMessage: string = '';
  private robotsEvidence?: StandaloneRobotsEvidence;
  private sitemapEvidence?: StandaloneSitemapEvidence;

  public getRobotsPolicyStatus(): 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified' | 'forbidden' | 'server_error_disallow' {
    return this.robotsPolicyStatus;
  }

  public getRobotsFailureReason(): string {
    return this.robotsFailureReason;
  }

  public getRobotsFailureMessage(): string {
    return this.robotsFailureMessage;
  }

  public getRobotsEvidence(): StandaloneRobotsEvidence | undefined {
    return this.robotsEvidence;
  }

  public getSitemapEvidence(): StandaloneSitemapEvidence | undefined {
    return this.sitemapEvidence;
  }

  constructor(
    seedUrl: string,
    config: StandaloneAuditConfig,
    existingQueue?: Array<{ url: string; depth: number }>,
    existingSeen?: string[]
  ) {
    this.config = config;
    const parsed = new URL(seedUrl);
    this.origin = parsed.origin;
    this.hostname = parsed.hostname;

    if (existingQueue && existingQueue.length > 0) {
      this.queue = [...existingQueue];
      this.seenUrls = new Set(existingSeen || existingQueue.map((q) => q.url));
    } else {
      const normSeed = this.normalizeUrl(seedUrl);
      this.queue.push({ url: normSeed, depth: 0 });
      this.seenUrls.add(normSeed);
    }
  }

  public getPendingQueue(): Array<{ url: string; depth: number }> {
    return [...this.queue];
  }

  public getDiscoveredUrls(): string[] {
    return Array.from(this.seenUrls);
  }

  public getCrawledUrls(): string[] {
    return [...this.crawledUrls];
  }

  public normalizeUrl(rawUrl: string): string {
    try {
      const u = new URL(rawUrl);
      u.hash = ''; // Strip fragments
      let norm = u.origin + u.pathname;
      if (norm.length > 1 && norm.endsWith('/')) {
        norm = norm.slice(0, -1);
      }
      return norm + (u.search || '');
    } catch {
      return rawUrl;
    }
  }

  public isUrlInSitemap(urlStr: string): boolean {
    const urls = this.sitemapEvidence?.urls || this.sitemapEvidence?.allSitemapUrls;
    if (!urls || urls.length === 0) return false;
    const norm = this.normalizeUrl(urlStr);
    return urls.some((u: string) => this.normalizeUrl(u) === norm);
  }

  public isInScope(urlStr: string): boolean {
    try {
      const u = new URL(urlStr);

      // Security: Reject credentials in URLs (e.g. https://user:pass@example.com)
      if (u.username || u.password) return false;

      // Exact origin match: scheme, hostname, and effective port must match seed origin!
      if (u.origin !== this.origin) return false;

      // Host safety check: block loopback, private ranges, cloud metadata
      // Allows seed host if user explicitly authorized testing on localhost / 127.0.0.1
      if (this.isPrivateOrForbiddenHost(u.hostname, this.hostname === u.hostname)) return false;

      // Filter non-html static asset extensions (images, media, fonts, archives)
      const path = u.pathname.toLowerCase();
      const nonHtmlExt = [
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
        '.zip', '.css', '.js', '.woff', '.woff2',
        '.mp4', '.mp3', '.tar', '.gz', '.pdf'
      ];
      if (nonHtmlExt.some((ext) => path.endsWith(ext))) return false;

      return true;
    } catch {
      return false;
    }
  }

  public isPrivateOrForbiddenHost(host: string, allowSeedHost: boolean = false): boolean {
    const h = host.toLowerCase();
    // Cloud metadata endpoints are NEVER permitted under any circumstances
    if (h === 'metadata.google.internal' || h === '169.254.169.254') {
      return true;
    }
    // Allow local test host only if the user explicitly authorized this exact seed host
    if (allowSeedHost && (h === 'localhost' || h === '127.0.0.1')) {
      return false;
    }
    if (h === 'localhost' || h.endsWith('.local')) {
      return true;
    }
    // Simple private IPv4 check
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) {
      return true;
    }
    return false;
  }

  /**
   * Manually handles HTTP redirects up to maxRedirects (3), strictly verifying each destination before requesting.
   * Ensures destination remains on the exact authorized origin and does not target private ranges / SSRF.
   *
   * SECURITY TRADEOFF NOTE:
   * RFC 9309 §2.3.1.5 recommends following at least 5 hops of redirects for robots.txt.
   * However, Website Audit Agent intentionally restricts robots.txt redirects to a maximum of 3 hops
   * and enforces strict same-origin isolation. This security tradeoff prioritizes browser sandboxing,
   * SSRF mitigation, and protection against redirect loop exhaustion over traversing extensive or
   * cross-origin redirect chains.
   */
  private async fetchRobotsTxtWithControlledRedirect(
    robotsUrl: string,
    signal: AbortSignal
  ): Promise<{ response: Response; finalUrl: string }> {
    let currentUrl = robotsUrl;
    let redirectsCount = 0;
    const maxRedirects = 3;

    while (true) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const u = new URL(currentUrl);
      if (u.origin.toLowerCase() !== this.origin.toLowerCase()) {
        throw new Error(`Robots.txt URL '${currentUrl}' is outside authorized origin scope '${this.origin}'`);
      }
      if (isSsrfTarget(currentUrl, this.origin)) {
        throw new Error(`Robots.txt request to disallowed destination blocked: ${currentUrl}`);
      }

      const res = await fetch(currentUrl, {
        method: 'GET',
        signal,
        redirect: 'manual',
        headers: {
          Accept: 'text/plain, */*;q=0.8',
        },
      });

      // Redirect handling (301, 302, 307, 308)
      if (res.status >= 300 && res.status < 400) {
        redirectsCount++;
        if (redirectsCount > maxRedirects) {
          throw new Error(`Robots.txt redirect limit exceeded (${maxRedirects})`);
        }

        const location = res.headers.get('location');
        if (!location) {
          throw new Error(`HTTP ${res.status} redirect without Location header`);
        }

        const nextUrl = new URL(location, currentUrl).href;

        // Security check: Must remain on authorized origin and not SSRF
        const nextU = new URL(nextUrl);
        if (nextU.origin.toLowerCase() !== this.origin.toLowerCase()) {
          throw new Error(`Robots.txt redirect to out-of-scope origin blocked: ${nextUrl}`);
        }
        if (isSsrfTarget(nextUrl, this.origin)) {
          throw new Error(`Robots.txt redirect to unsafe private/metadata destination blocked: ${nextUrl}`);
        }

        currentUrl = nextUrl;
        continue;
      }

      return { response: res, finalUrl: currentUrl };
    }
  }

  public async fetchRobotsTxt(): Promise<StandaloneRobotsEvidence> {
    if (this.robotsFetched && this.robotsEvidence) {
      return this.robotsEvidence;
    }
    this.robotsFetched = true;
    const robotsUrl = `${this.origin}/robots.txt`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const { response: res } = await this.fetchRobotsTxtWithControlledRedirect(robotsUrl, controller.signal);
      const status = res.status;

      if (status === 200) {
        // Response Content-Type handling: Check for disallowed binary content
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const isBinary =
          contentType.includes('image/') ||
          contentType.includes('video/') ||
          contentType.includes('audio/') ||
          contentType.includes('application/pdf') ||
          contentType.includes('application/zip') ||
          contentType.includes('application/octet-stream');

        if (isBinary) {
          this.robotsPolicyStatus = 'fetch_failed_unverified';
          this.robotsFailureReason = 'malformed_content';
          this.robotsFailureMessage = `Disallowed binary Content-Type: ${contentType}`;
          this.robotsEvidence = normalizeRobotsEvidence({
            robotsUrl,
            httpStatus: 200,
            fetchStatus: 'error',
            parserStatus: 'malformed',
            selectedUserAgent: '*',
            allowDirectives: [],
            disallowDirectives: [],
            sitemapDeclarations: [],
            policyOutcome: 'fetch_failed_unverified',
          })!;
          return this.robotsEvidence;
        }

        // Bounded streaming read (512KB cap per RFC 9309 §2.2)
        const text = await readBoundedResponseBody(res, 512 * 1024, controller.signal);
        this.parseRobotsTxt(text);
        this.robotsPolicyStatus = 'enforced';
        this.robotsFailureReason = 'none';
        this.robotsFailureMessage = '';
        this.robotsEvidence = normalizeRobotsEvidence({
          robotsUrl,
          httpStatus: 200,
          fetchStatus: 'found',
          parserStatus: text.trim() ? 'valid' : 'empty',
          selectedUserAgent: this.selectedUserAgent,
          allowDirectives: [...this.allowDirectives],
          disallowDirectives: [...this.disallowDirectives],
          sitemapDeclarations: [...this.sitemapDeclarations],
          rawContent: text,
          policyOutcome: 'enforced',
        })!;
      } else if (status === 404 || status === 410) {
        // RFC 9309 §2.3.1.2: 404/410 explicitly confirms robots.txt is unavailable/not present -> permissive access
        this.robotsPolicyStatus = 'not_present_permissive';
        this.robotsFailureReason = 'none';
        this.robotsFailureMessage = '';
        this.robotsEvidence = normalizeRobotsEvidence({
          robotsUrl,
          httpStatus: status,
          fetchStatus: 'not_found',
          parserStatus: 'not_present',
          selectedUserAgent: '*',
          allowDirectives: [],
          disallowDirectives: [],
          sitemapDeclarations: [],
          policyOutcome: 'not_present_permissive',
        })!;
      } else if (status === 403 || status === 401) {
        // RFC 9309 §2.3.1.3: 401/403 access denied -> full disallow
        this.robotsPolicyStatus = 'forbidden';
        this.robotsFailureReason = 'http_401_403';
        this.robotsFailureMessage = `Robots.txt access denied (HTTP ${status})`;
        this.robotsEvidence = normalizeRobotsEvidence({
          robotsUrl,
          httpStatus: status,
          fetchStatus: 'forbidden',
          parserStatus: 'not_present',
          selectedUserAgent: '*',
          allowDirectives: [],
          disallowDirectives: [],
          sitemapDeclarations: [],
          policyOutcome: 'forbidden',
        })!;
      } else if (status === 429) {
        // PRODUCT SECURITY POLICY NOTE:
        // While RFC 9309 §2.3.1.2 permits crawlers to treat unhandled 400-499 responses as "resource unavailable"
        // (allowing unrestricted access), Website Audit Agent deliberately implements a strict fail-closed policy
        // for HTTP 429 (rate-limited). This prevents client audits from hammering servers that are actively rate-limiting requests.
        this.robotsPolicyStatus = 'fetch_failed_unverified';
        this.robotsFailureReason = 'http_429';
        this.robotsFailureMessage = 'Robots.txt rate limited (HTTP 429)';
        this.robotsEvidence = normalizeRobotsEvidence({
          robotsUrl,
          httpStatus: 429,
          fetchStatus: 'rate_limited',
          parserStatus: 'not_present',
          selectedUserAgent: '*',
          allowDirectives: [],
          disallowDirectives: [],
          sitemapDeclarations: [],
          policyOutcome: 'fetch_failed_unverified',
        })!;
      } else {
        // RFC 9309 §2.3.1.4: 5xx server errors require full disallow.
        // PRODUCT POLICY NOTE: Any other unhandled status or non-404 4xx also fails closed for safety.
        this.robotsPolicyStatus = 'fetch_failed_unverified';
        this.robotsFailureReason = 'http_5xx';
        this.robotsFailureMessage = `Robots.txt unavailable due to server error (HTTP ${status})`;
        this.robotsEvidence = normalizeRobotsEvidence({
          robotsUrl,
          httpStatus: status,
          fetchStatus: 'error',
          parserStatus: 'not_present',
          selectedUserAgent: '*',
          allowDirectives: [],
          disallowDirectives: [],
          sitemapDeclarations: [],
          policyOutcome: 'fetch_failed_unverified',
        })!;
      }
    } catch (err: any) {
      this.robotsPolicyStatus = 'fetch_failed_unverified';
      const isOversized = err?.message?.includes('exceeds maximum allowed size');
      const isTimeout =
        err?.name === 'AbortError' ||
        err?.message?.toLowerCase().includes('aborted') ||
        err?.message?.toLowerCase().includes('timeout');
      const isRedirect =
        err?.message?.toLowerCase().includes('redirect') ||
        err?.message?.toLowerCase().includes('scope') ||
        err?.message?.toLowerCase().includes('destination');

      if (isOversized) {
        this.robotsFailureReason = 'oversized';
        this.robotsFailureMessage = 'Robots.txt response exceeded maximum allowed size (512KB)';
      } else if (isTimeout) {
        this.robotsFailureReason = 'timeout';
        this.robotsFailureMessage = 'Request timeout after 4000ms';
      } else if (isRedirect) {
        this.robotsFailureReason = 'redirect_blocked';
        this.robotsFailureMessage = err?.message || 'Robots.txt redirect blocked';
      } else {
        this.robotsFailureReason = 'connection_refused';
        this.robotsFailureMessage = err?.message || 'Network error: Failed to fetch';
      }

      this.robotsEvidence = normalizeRobotsEvidence({
        robotsUrl,
        httpStatus: 0,
        fetchStatus: 'error',
        parserStatus: isOversized ? 'oversized' : 'not_present',
        selectedUserAgent: '*',
        allowDirectives: [],
        disallowDirectives: [],
        sitemapDeclarations: [],
        policyOutcome: 'fetch_failed_unverified',
      })!;
    } finally {
      clearTimeout(timeoutId);
    }

    return this.robotsEvidence!;
  }

  public parseRobotsTxt(robotsText: string): void {
    this.robotsFetched = true;
    this.robotsPolicyStatus = 'enforced';
    this.robotsFailureReason = 'none';
    this.robotsFailureMessage = '';
    this.allowDirectives = [];
    this.disallowDirectives = [];
    this.sitemapDeclarations = [];
    this.rules = [];
    this.robotsPolicyStatus = 'enforced';

    const lines = robotsText.split('\n');

    interface Group {
      userAgents: string[];
      rules: RobotsRule[];
      allow: string[];
      disallow: string[];
    }

    const groups: Group[] = [];
    let currentGroup: Group | null = null;
    let inDirectives = false;

    for (const rawLine of lines) {
      const clean = (rawLine.split('#')[0] || '').trim();
      if (!clean) {
        // Blank line terminates group directives per RFC 9309 §2.2.1
        if (currentGroup && inDirectives) {
          currentGroup = null;
          inDirectives = false;
        }
        continue;
      }

      const colonIdx = clean.indexOf(':');
      if (colonIdx === -1) {
        // Malformed line without colon -> ignore per RFC 9309
        continue;
      }

      const field = clean.slice(0, colonIdx).trim().toLowerCase();
      const value = clean.slice(colonIdx + 1).trim();

      if (field === 'sitemap') {
        if (value && !this.sitemapDeclarations.includes(value)) {
          this.sitemapDeclarations.push(value);
        }
        continue;
      }

      if (field === 'user-agent') {
        const agent = value.toLowerCase();
        // If we were reading directives and see another user-agent, that starts a new group
        if (inDirectives || !currentGroup) {
          currentGroup = {
            userAgents: [agent],
            rules: [],
            allow: [],
            disallow: [],
          };
          groups.push(currentGroup);
          inDirectives = false;
        } else {
          // Consecutive user-agent line in the same group header
          if (!currentGroup.userAgents.includes(agent)) {
            currentGroup.userAgents.push(agent);
          }
        }
        continue;
      }

      if (currentGroup) {
        inDirectives = true;
        if (field === 'disallow') {
          if (!value) {
            // RFC 9309 §2.2.2: An empty Disallow value indicates that access is allowed.
            // Per RFC semantics, an empty Disallow rule MUST NOT erase unrelated earlier nonempty Disallow rules.
            currentGroup.rules.push({ path: '', allow: true });
          } else {
            currentGroup.disallow.push(value);
            currentGroup.rules.push({ path: value, allow: false });
          }
        } else if (field === 'allow') {
          if (value) {
            currentGroup.allow.push(value);
            currentGroup.rules.push({ path: value, allow: true });
          }
        }
      }
    }

    // Group selection per RFC 9309 §2.2.1:
    // If a specific group matches our bot name, select it.
    // Otherwise fallback to '*' group.
    const targetBot = 'websiteauditbot';
    const specificGroups = groups.filter((g) =>
      g.userAgents.some((a) => a === targetBot || a.includes('websiteaudit'))
    );

    if (specificGroups.length > 0) {
      this.selectedUserAgent = targetBot;
      for (const g of specificGroups) {
        this.allowDirectives.push(...g.allow);
        this.disallowDirectives.push(...g.disallow);
        this.rules.push(...g.rules);
      }
    } else {
      const wildcardGroups = groups.filter((g) => g.userAgents.includes('*'));
      if (wildcardGroups.length > 0) {
        this.selectedUserAgent = '*';
        for (const g of wildcardGroups) {
          this.allowDirectives.push(...g.allow);
          this.disallowDirectives.push(...g.disallow);
          this.rules.push(...g.rules);
        }
      } else {
        this.selectedUserAgent = '*';
      }
    }
  }

  /**
   * RFC 9309 compliant path matching with longest-match precedence, query-string support,
   * percent-encoded normalization, and conservative failure policy.
   */
  public isAllowedByRobots(urlOrPath: string): boolean {
    // 1. RFC 9309 §2.3.1.3: 401/403 on robots.txt MUST assume full disallow
    if (
      this.robotsPolicyStatus === 'forbidden' ||
      this.robotsEvidence?.fetchStatus === 'forbidden' ||
      this.robotsEvidence?.httpStatus === 401 ||
      this.robotsEvidence?.httpStatus === 403
    ) {
      return false;
    }

    // 2. RFC 9309 §2.3.1.4: 5xx on robots.txt MUST assume full disallow
    if (
      this.robotsEvidence?.httpStatus &&
      this.robotsEvidence.httpStatus >= 500 &&
      this.robotsEvidence.httpStatus < 600
    ) {
      return false;
    }

    // 3. Rate limited (429) MUST assume full disallow
    if (
      this.robotsEvidence?.httpStatus === 429 ||
      this.robotsEvidence?.fetchStatus === 'rate_limited'
    ) {
      return false;
    }

    // 4. Conservative failure policy: Network failures, timeouts, connection refused,
    // redirect violations, oversized files, or unverified fetch MUST assume full disallow.
    // Unknown access must not silently become unrestricted crawling!
    if (
      this.robotsPolicyStatus === 'fetch_failed_unverified' ||
      this.robotsEvidence?.policyOutcome === 'fetch_failed_unverified' ||
      this.robotsEvidence?.fetchStatus === 'error' ||
      (this.robotsEvidence && this.robotsEvidence.httpStatus === 0)
    ) {
      return false;
    }

    // 5. RFC 9309 §2.3.1.2: 404/410 absent robots.txt -> unrestricted access
    if (
      this.robotsPolicyStatus === 'not_present_permissive' ||
      this.robotsEvidence?.policyOutcome === 'not_present_permissive' ||
      this.robotsEvidence?.httpStatus === 404 ||
      this.robotsEvidence?.httpStatus === 410
    ) {
      return true;
    }

    // 6. If respectRobots is enabled but robots has not been fetched, conservative default is false
    if (!this.robotsFetched && this.config.respectRobots) {
      return false;
    }

    // 7. If rules array is empty after valid 200 parse, access is allowed per RFC 9309
    if (this.rules.length === 0) {
      return true;
    }

    let targetPath = urlOrPath;
    try {
      if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
        const u = new URL(urlOrPath);
        targetPath = u.pathname + (u.search || '');
      }
    } catch {
      targetPath = urlOrPath;
    }
    if (!targetPath.startsWith('/')) {
      targetPath = '/' + targetPath;
    }

    const normalizedTarget = normalizeRobotsPath(targetPath);

    const matchingRules = this.rules.filter((rule) => {
      if (rule.path === '') {
        // Empty Disallow: directive allows all access per RFC 9309 §2.2.2
        return true;
      }
      if (rule.path === '/') return true;

      let pattern = normalizeRobotsPath(rule.path);
      let hasEndAnchor = false;
      if (pattern.endsWith('$')) {
        hasEndAnchor = true;
        pattern = pattern.slice(0, -1);
      }

      if (pattern.includes('*')) {
        const escaped = pattern
          .split('*')
          .map((p) => p.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&'))
          .join('.*');
        const regex = new RegExp('^' + escaped + (hasEndAnchor ? '$' : ''));
        return regex.test(normalizedTarget) || regex.test(targetPath);
      }

      if (hasEndAnchor) {
        return normalizedTarget === pattern || targetPath === pattern;
      }

      return normalizedTarget.startsWith(pattern) || targetPath.startsWith(pattern);
    });

    if (matchingRules.length === 0) {
      return true;
    }

    // RFC 9309 §2.2.2:
    // Longest path match wins.
    // On path length tie, Allow takes precedence over Disallow.
    matchingRules.sort((a, b) => {
      const lenA = a.path.length;
      const lenB = b.path.length;
      if (lenB !== lenA) {
        return lenB - lenA;
      }
      return a.allow ? -1 : 1;
    });

    return matchingRules[0]?.allow ?? true;
  }

  public async discoverSitemaps(): Promise<StandaloneSitemapEvidence> {
    const candidateSitemapUrls: string[] = [];
    const declared = this.robotsEvidence?.sitemapDeclarations || this.robotsEvidence?.sitemapsDeclared || [];
    if (declared.length > 0) {
      candidateSitemapUrls.push(...declared);
    }
    const defaultSitemap = `${this.origin}/sitemap.xml`;
    if (!candidateSitemapUrls.includes(defaultSitemap)) {
      candidateSitemapUrls.push(defaultSitemap);
    }

    // MANDATORY CRAWL POLICY GATE:
    // If robots policy is blocking (forbidden, fetch_failed_unverified, 5xx, 429, timeout, connection refused, oversized, redirect blocked),
    // ZERO sitemap network requests must be issued!
    const isRobotsBlockingAll =
      this.config.respectRobots &&
      (this.robotsPolicyStatus === 'forbidden' ||
        this.robotsPolicyStatus === 'fetch_failed_unverified' ||
        this.robotsEvidence?.policyOutcome === 'forbidden' ||
        this.robotsEvidence?.policyOutcome === 'fetch_failed_unverified' ||
        this.robotsEvidence?.httpStatus === 429 ||
        (this.robotsEvidence?.httpStatus !== undefined &&
          this.robotsEvidence.httpStatus >= 500 &&
          this.robotsEvidence.httpStatus < 600) ||
        this.robotsEvidence?.httpStatus === 401 ||
        this.robotsEvidence?.httpStatus === 403 ||
        this.robotsEvidence?.httpStatus === 0);

    if (isRobotsBlockingAll) {
      const blockedEntries = candidateSitemapUrls.map((u) => ({
        sitemapUrl: u,
        url: u,
        status: 'unauthorized',
        fetchStatus: 'not_fetched',
        parseStatus: 'not_parsed',
        errorMessage: `Sitemap discovery blocked by robots.txt policy (${this.robotsFailureReason || this.robotsPolicyStatus})`,
        urlsCount: 0,
        urlCount: 0,
        urls: [],
        isIndex: false,
        childSitemaps: [],
      }));

      this.sitemapEvidence = normalizeSitemapEvidence({
        sitemaps: blockedEntries,
        urls: [],
        allSitemapUrls: [],
        totalDiscoveredUrlsCount: 0,
        indexCount: 0,
        hasErrors: true,
        errors: [`Sitemap discovery blocked by robots.txt policy (${this.robotsFailureReason || this.robotsPolicyStatus})`],
      })!;
      return this.sitemapEvidence;
    }

    // When robots policy is enforced (e.g. 200) or permissive (404/410),
    // filter individual candidate sitemap URLs against robots rules before issuing any network requests:
    const allowedSitemapUrls: string[] = [];
    const blockedEntries: any[] = [];

    for (const sUrl of candidateSitemapUrls) {
      if (this.config.respectRobots && !this.isAllowedByRobots(sUrl)) {
        blockedEntries.push({
          sitemapUrl: sUrl,
          url: sUrl,
          status: 'unauthorized',
          fetchStatus: 'not_fetched',
          parseStatus: 'not_parsed',
          errorMessage: 'Disallowed by robots.txt policy',
          urlsCount: 0,
          urlCount: 0,
          urls: [],
          isIndex: false,
          childSitemaps: [],
        });
      } else {
        allowedSitemapUrls.push(sUrl);
      }
    }

    if (allowedSitemapUrls.length === 0) {
      this.sitemapEvidence = normalizeSitemapEvidence({
        sitemaps: blockedEntries,
        urls: [],
        allSitemapUrls: [],
        totalDiscoveredUrlsCount: 0,
        indexCount: 0,
        hasErrors: true,
        errors: ['All candidate sitemaps disallowed by robots.txt policy'],
      })!;
      return this.sitemapEvidence;
    }

    const parser = new StandaloneSitemapParser(this.origin, {
      maxSitemaps: 10,
      maxDepth: 3,
      maxUrlsPerSitemap: 500,
      maxSitemapUrls: 2000,
      fetchTimeoutMs: 5000,
    });

    const parsedEvidence = await parser.discoverAndParse(allowedSitemapUrls, this.origin);
    const normalized = normalizeSitemapEvidence(parsedEvidence)!;
    if (blockedEntries.length > 0) {
      normalized.sitemaps.push(...blockedEntries.map(normalizeSitemapEntry));
      normalized.sitemapsDiscovered = normalized.sitemaps;
    }
    this.sitemapEvidence = normalized;

    // Enqueue discovered in-scope sitemap URLs up to maxPages budget
    const discoveredUrls = this.sitemapEvidence.urls || [];
    for (const sitemapUrl of discoveredUrls) {
      const norm = this.normalizeUrl(sitemapUrl);
      if (this.isInScope(norm) && !this.seenUrls.has(norm)) {
        this.seenUrls.add(norm);
        this.queue.push({ url: norm, depth: 1 });
        if (this.queue.length >= this.config.maxPages) {
          break;
        }
      }
    }

    return this.sitemapEvidence;
  }

  public async run(callbacks: CrawlCallbacks): Promise<void> {
    let crawledCount = 0;

    // Load robots.txt once before beginning crawl
    if (this.config.respectRobots && !this.robotsFetched) {
      await this.fetchRobotsTxt();
    }

    // Discover and parse XML sitemaps once before beginning crawl
    if (!this.sitemapEvidence) {
      await this.discoverSitemaps();
    }

    while (this.queue.length > 0 && crawledCount < this.config.maxPages) {
      if (callbacks.isCancelled()) {
        break;
      }

      const item = this.queue.shift();
      if (!item) break;

      callbacks.onProgress(crawledCount, this.seenUrls.size, item.url);

      const startTime = performance.now();
      let pageRecord: StandaloneCrawlPage;
      const isInSitemap = this.isUrlInSitemap(item.url);

      // Robots.txt disallow enforcement: NEVER bypass robots.txt, NEVER fetch blocked URLs!
      if (this.config.respectRobots && !this.isAllowedByRobots(item.url)) {
        let status = 0;
        let fetchStatus: StandaloneCrawlPage['fetchStatus'] = 'robots_blocked';
        let errorCode: any = 'FETCH_ROBOTS_BLOCKED';
        let errorMessage = 'URL blocked by robots.txt policy';

        if (this.robotsFailureReason === 'connection_refused') {
          fetchStatus = 'failed';
          errorCode = 'FETCH_NETWORK_ERROR';
          errorMessage = `Network error: ${this.robotsFailureMessage || 'Failed to fetch'}`;
        } else if (this.robotsFailureReason === 'timeout') {
          fetchStatus = 'timeout';
          errorCode = 'FETCH_TIMEOUT';
          errorMessage = 'Request timeout after 4000ms';
        } else if (this.robotsFailureReason === 'http_429') {
          fetchStatus = 'failed';
          errorCode = 'FETCH_ROBOTS_BLOCKED';
          errorMessage = 'Robots.txt rate limited (HTTP 429)';
        } else if (this.robotsFailureReason === 'http_5xx') {
          fetchStatus = 'failed';
          errorCode = 'FETCH_ROBOTS_BLOCKED';
          errorMessage = this.robotsFailureMessage || 'Robots.txt server error (HTTP 5xx)';
        } else if (this.robotsFailureReason === 'http_401_403') {
          fetchStatus = 'robots_blocked';
          errorCode = 'FETCH_ROBOTS_BLOCKED';
          errorMessage = this.robotsFailureMessage || 'Robots.txt access denied';
        } else if (this.robotsFailureReason === 'oversized') {
          fetchStatus = 'failed';
          errorCode = 'FETCH_ROBOTS_BLOCKED';
          errorMessage = 'Robots.txt response exceeded size limit (>512KB)';
        } else if (this.robotsFailureReason === 'redirect_blocked') {
          fetchStatus = 'failed';
          errorCode = 'FETCH_ROBOTS_BLOCKED';
          errorMessage = this.robotsFailureMessage || 'Robots.txt redirect blocked';
        } else if (this.robotsFailureReason === 'malformed_content') {
          fetchStatus = 'failed';
          errorCode = 'FETCH_ROBOTS_BLOCKED';
          errorMessage = this.robotsFailureMessage || 'Robots.txt content malformed';
        }

        pageRecord = {
          id: `page-${crawledCount + 1}-${Date.now()}`,
          auditId: '',
          url: item.url,
          requestedUrl: item.url,
          finalUrl: item.url,
          redirectChain: [],
          redirectCount: 0,
          redirectLoopDetected: false,
          canonicalHrefs: [],
          canonicalCount: 0,
          depth: item.depth,
          httpStatus: status,
          fetchStatus,
          errorCode,
          errorMessage,
          title: 'URL Disallowed by robots.txt',
          headings: { h1: [], h2: [], h3: [] },
          links: [],
          images: [],
          headers: {},
          htmlSize: 0,
          responseTimeMs: 0,
          fetchedAt: Date.now(),
          isInSitemap,
          contentTypeCategory: 'NETWORK_FAILURE',
        };
        await callbacks.onPageCrawled(pageRecord);
        this.crawledUrls.push(item.url);
        crawledCount++;
        continue;
      }

      const maxRetries = 2;
      let attempt = 0;
      let fetchSuccess = false;

      // Pre-flight host permission verification if chrome.permissions API is available
      if (typeof chrome !== 'undefined' && chrome.permissions?.contains) {
        const originPattern = `${new URL(item.url).origin}/*`;
        const hasPerm = await new Promise<boolean>((resolve) => {
          chrome.permissions.contains({ origins: [originPattern] }, (res) => resolve(Boolean(res)));
        });
        if (!hasPerm) {
          pageRecord = {
            id: `page-${crawledCount + 1}-${Date.now()}`,
            auditId: '',
            url: item.url,
            requestedUrl: item.url,
            finalUrl: item.url,
            redirectChain: [],
            redirectCount: 0,
            redirectLoopDetected: false,
            canonicalHrefs: [],
            canonicalCount: 0,
            depth: item.depth,
            httpStatus: 0,
            fetchStatus: 'failed',
            errorCode: 'FETCH_PERMISSION_DENIED',
            errorMessage: `Host permission denied for origin: ${new URL(item.url).origin}`,
            title: 'Permission Denied',
            headings: { h1: [], h2: [], h3: [] },
            links: [],
            images: [],
            headers: {},
            htmlSize: 0,
            responseTimeMs: 0,
            fetchedAt: Date.now(),
            isInSitemap,
            contentTypeCategory: 'NETWORK_FAILURE',
          };
          await callbacks.onPageCrawled(pageRecord);
          this.crawledUrls.push(item.url);
          crawledCount++;
          continue;
        }
      }

      while (attempt <= maxRetries && !fetchSuccess && !callbacks.isCancelled()) {
        attempt++;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        try {
          const redirectResult = await this.fetchWithControlledRedirect(item.url, controller.signal);
          clearTimeout(timeoutId);
          const elapsed = Math.round(performance.now() - startTime);
          const response = redirectResult.response;

          // Collect response headers
          const headers: Record<string, string> = {};
          response.headers.forEach((val, key) => {
            headers[key.toLowerCase()] = val;
          });

          // Check redirect destination safety
          if (redirectResult.disallowedRedirect) {
            const isLoop = redirectResult.loopDetected;
            pageRecord = {
              id: `page-${crawledCount + 1}-${Date.now()}`,
              auditId: '',
              url: item.url,
              requestedUrl: item.url,
              finalUrl: redirectResult.finalUrl || item.url,
              redirectChain: redirectResult.redirectChain || [],
              redirectCount: redirectResult.redirectCount || 0,
              redirectLoopDetected: isLoop,
              canonicalHrefs: [],
              canonicalCount: 0,
              depth: item.depth,
              httpStatus: response.status || (isLoop ? 310 : 301),
              fetchStatus: isLoop ? 'redirect_loop' : 'skipped',
              errorCode: isLoop ? 'FETCH_REDIRECT_LOOP' : 'FETCH_REDIRECT_BLOCKED',
              errorMessage: isLoop ? 'Redirect loop detected' : `Redirect blocked: ${redirectResult.disallowedDestination || 'out_of_scope'}`,
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              headers,
              htmlSize: 0,
              responseTimeMs: elapsed,
              fetchedAt: Date.now(),
              isInSitemap,
              contentTypeCategory: 'HTTP_ERROR',
              title: isLoop ? 'Circular Redirect Loop' : `Disallowed redirect destination: ${redirectResult.disallowedDestination || 'out_of_scope'}`,
            };
            await callbacks.onPageCrawled(pageRecord);
            this.crawledUrls.push(item.url);
            crawledCount++;
            fetchSuccess = true;
            break;
          }

          // Content-Type classification: explicitly distinguish HTML from non-HTML / error / unknown
          let contentTypeCategory = classifyResponse(
            response.status,
            response.ok ? 'success' : 'failed',
            headers
          );

          // If response is explicitly a non-HTML resource (PDF, image, audio, video, zip, json), do not buffer large body or invoke DOM parser!
          if (contentTypeCategory === 'NON_HTML_RESOURCE') {
            const ctHeader = headers['content-type'] || '';
            pageRecord = {
              id: `page-${crawledCount + 1}-${Date.now()}`,
              auditId: '',
              url: item.url,
              requestedUrl: item.url,
              finalUrl: redirectResult.finalUrl || item.url,
              redirectChain: redirectResult.redirectChain || [],
              redirectCount: redirectResult.redirectCount || 0,
              redirectLoopDetected: redirectResult.loopDetected || false,
              canonicalHrefs: [],
              canonicalCount: 0,
              depth: item.depth,
              httpStatus: response.status,
              fetchStatus: response.ok ? 'success' : 'failed',
              contentTypeCategory,
              isInSitemap,
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              headers,
              htmlSize: 0,
              responseTimeMs: elapsed,
              fetchedAt: Date.now(),
              title: `Non-HTML Resource (${ctHeader || 'binary'})`,
            };
            await callbacks.onPageCrawled(pageRecord);
            this.crawledUrls.push(item.url);
            crawledCount++;
            fetchSuccess = true;
            break;
          }

          // Streaming Bounded response read: strict 5MB cap
          const { html, isOversized, totalBytes } = await this.readBoundedHtml(response, 5 * 1024 * 1024);

          // If content-type was unknown/omitted, sniff body to verify if it is an HTML document
          if (contentTypeCategory === 'UNKNOWN_CONTENT_TYPE') {
            if (html && /<(?:!doctype\s+html|html|head|body)\b/i.test(html)) {
              contentTypeCategory = 'HTML_DOCUMENT';
            } else {
              pageRecord = {
                id: `page-${crawledCount + 1}-${Date.now()}`,
                auditId: '',
                url: item.url,
                requestedUrl: item.url,
                finalUrl: redirectResult.finalUrl || item.url,
                redirectChain: redirectResult.redirectChain || [],
                redirectCount: redirectResult.redirectCount || 0,
                redirectLoopDetected: redirectResult.loopDetected || false,
                canonicalHrefs: [],
                canonicalCount: 0,
                depth: item.depth,
                httpStatus: response.status,
                fetchStatus: response.ok ? 'success' : 'failed',
                contentTypeCategory: 'UNKNOWN_CONTENT_TYPE',
                isInSitemap,
                headings: { h1: [], h2: [], h3: [] },
                links: [],
                images: [],
                headers,
                htmlSize: totalBytes,
                responseTimeMs: elapsed,
                fetchedAt: Date.now(),
                title: 'Unknown Content-Type',
              };
              await callbacks.onPageCrawled(pageRecord);
              this.crawledUrls.push(item.url);
              crawledCount++;
              fetchSuccess = true;
              break;
            }
          }

          if (isOversized) {
            pageRecord = {
              id: `page-${crawledCount + 1}-${Date.now()}`,
              auditId: '',
              url: item.url,
              requestedUrl: item.url,
              finalUrl: redirectResult.finalUrl || item.url,
              redirectChain: redirectResult.redirectChain || [],
              redirectCount: redirectResult.redirectCount || 0,
              redirectLoopDetected: redirectResult.loopDetected || false,
              canonicalHrefs: [],
              canonicalCount: 0,
              depth: item.depth,
              httpStatus: response.status,
              fetchStatus: 'failed',
              errorCode: 'FETCH_BODY_TOO_LARGE',
              errorMessage: `Response exceeded 5MB size limit (${Math.round(totalBytes / 1024 / 1024)}MB)`,
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              headers,
              htmlSize: totalBytes,
              responseTimeMs: elapsed,
              fetchedAt: Date.now(),
              isInSitemap,
              contentTypeCategory: 'HTML_DOCUMENT',
              title: `Oversized Response Exceeded 5MB Limit (${Math.round(totalBytes / 1024 / 1024)}MB)`,
            };
            await callbacks.onPageCrawled(pageRecord);
            this.crawledUrls.push(item.url);
            crawledCount++;
            fetchSuccess = true;
            break;
          }

          // Asynchronous parsing via native DOMParser or bounded offscreen service
          const targetUrlForEvidence = redirectResult.finalUrl || item.url;
          let parsedEvidence;
          try {
            parsedEvidence = await StandaloneDomParser.parseAsync(html, targetUrlForEvidence);
          } catch (parseErr: any) {
            pageRecord = {
              id: `page-${crawledCount + 1}-${Date.now()}`,
              auditId: '',
              url: item.url,
              requestedUrl: item.url,
              finalUrl: redirectResult.finalUrl || item.url,
              redirectChain: redirectResult.redirectChain || [],
              redirectCount: redirectResult.redirectCount || 0,
              redirectLoopDetected: redirectResult.loopDetected || false,
              canonicalHrefs: [],
              canonicalCount: 0,
              depth: item.depth,
              httpStatus: response.status,
              fetchStatus: 'failed',
              errorCode: 'FETCH_PARSE_FAILED',
              errorMessage: `DOM parsing failed: ${parseErr?.message || 'unknown error'}`,
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              headers,
              htmlSize: totalBytes,
              responseTimeMs: elapsed,
              fetchedAt: Date.now(),
              isInSitemap,
              contentTypeCategory: 'PARSE_FAILURE',
              title: 'Parse Failed',
            };
            await callbacks.onPageCrawled(pageRecord);
            this.crawledUrls.push(item.url);
            crawledCount++;
            fetchSuccess = true;
            break;
          }

          pageRecord = {
            id: `page-${crawledCount + 1}-${Date.now()}`,
            auditId: '', // Filled by coordinator
            url: item.url,
            requestedUrl: item.url,
            finalUrl: redirectResult.finalUrl || item.url,
            redirectChain: redirectResult.redirectChain || [],
            redirectCount: redirectResult.redirectCount || 0,
            redirectLoopDetected: redirectResult.loopDetected || false,
            canonicalHrefs: parsedEvidence.canonicalHrefs || (parsedEvidence.canonicalUrl ? [parsedEvidence.canonicalUrl] : []),
            canonicalCount: typeof parsedEvidence.canonicalCount === 'number' ? parsedEvidence.canonicalCount : (parsedEvidence.canonicalUrl ? 1 : 0),
            depth: item.depth,
            httpStatus: response.status,
            fetchStatus: response.ok ? 'success' : 'failed',
            errorMessage: response.ok ? undefined : `HTTP ${response.status} response`,
            title: parsedEvidence.title,
            metaDescription: parsedEvidence.metaDescription,
            headings: parsedEvidence.headings,
            headingCounts: parsedEvidence.headingCounts,
            h1RawCount: parsedEvidence.h1RawCount,
            h1HasContent: parsedEvidence.h1HasContent,
            canonicalUrl: parsedEvidence.canonicalUrl,
            metaRobots: parsedEvidence.metaRobots,
            htmlLang: parsedEvidence.htmlLang,
            links: parsedEvidence.links,
            internalOutlinksCount: parsedEvidence.internalOutlinksCount,
            externalOutlinksCount: parsedEvidence.externalOutlinksCount,
            emptyAnchorCount: parsedEvidence.emptyAnchorCount,
            images: parsedEvidence.images,
            imageCount: parsedEvidence.imageCount,
            missingAltCount: parsedEvidence.missingAltCount,
            emptyAltCount: parsedEvidence.emptyAltCount,
            headers,
            htmlSize: totalBytes,
            responseTimeMs: elapsed,
            fetchedAt: Date.now(),
            isInSitemap,
            contentTypeCategory: 'HTML_DOCUMENT',
            evidence: parsedEvidence, // Retain original full evidence
          };

          // Enqueue discovered child links if within depth limit and fetch was successful
          if (response.ok && item.depth < (this.config.maxDepth ?? 3) && parsedEvidence?.links) {
            for (const rawLink of parsedEvidence.links) {
              const norm = this.normalizeUrl(rawLink);
              if (this.isInScope(norm) && !this.seenUrls.has(norm)) {
                this.seenUrls.add(norm);
                this.queue.push({ url: norm, depth: item.depth + 1 });
              }
            }
          }

          await callbacks.onPageCrawled(pageRecord);
          this.crawledUrls.push(item.url);
          crawledCount++;
          fetchSuccess = true;
        } catch (err: any) {
          clearTimeout(timeoutId);
          if (attempt <= maxRetries && err.name !== 'AbortError' && err.name !== 'SecurityError') {
            // Transient error: retry with backoff
            await new Promise((res) => setTimeout(res, 500 * attempt));
            continue;
          }

          const elapsed = Math.round(performance.now() - startTime);

          let errorCode: import('../types').StandaloneFetchErrorCode = 'FETCH_NETWORK_ERROR';
          let errorMessage = 'Network error: Failed to fetch (connection refused or unreachable)';

          if (err.name === 'AbortError') {
            errorCode = 'FETCH_TIMEOUT';
            errorMessage = 'Request timed out after 10000ms';
          } else if (
            err.name === 'SecurityError' ||
            /permission/i.test(err?.message || '') ||
            /denied/i.test(err?.message || '') ||
            /not allowed/i.test(err?.message || '')
          ) {
            errorCode = 'FETCH_PERMISSION_DENIED';
            errorMessage = 'Host permission not granted or browser security restriction';
          }

          pageRecord = {
            id: `page-${crawledCount + 1}-${Date.now()}`,
            auditId: '',
            url: item.url,
            depth: item.depth,
            httpStatus: 0,
            fetchStatus: err.name === 'AbortError' ? 'timeout' : 'failed',
            errorCode,
            errorMessage,
            title: errorCode,
            headings: { h1: [], h2: [], h3: [] },
            links: [],
            images: [],
            headers: {},
            htmlSize: 0,
            responseTimeMs: elapsed,
            fetchedAt: Date.now(),
            isInSitemap,
            contentTypeCategory: 'NETWORK_FAILURE',
          };

          await callbacks.onPageCrawled(pageRecord);
          this.crawledUrls.push(item.url);
          crawledCount++;
          fetchSuccess = true;
        }
      }

      // Polite crawling delay
      if ((this.config.delayMs ?? 0) > 0 && this.queue.length > 0) {
        await new Promise((res) => setTimeout(res, this.config.delayMs ?? 0));
      }
    }
  }

  /**
   * Fetches an initial URL with strictly controlled manual redirect validation.
   * Ensures no unauthorized or out-of-scope requests are made.
   */
  public async fetchWithControlledRedirect(
    initialUrl: string,
    signal: AbortSignal
  ): Promise<ControlledRedirectResult> {
    let currentUrl = initialUrl;
    let redirectCount = 0;
    const maxRedirects = 3;
    const redirectChain: RedirectHop[] = [];
    const visitedUrls = new Set<string>();
    visitedUrls.add(this.normalizeUrl(initialUrl));

    while (redirectCount <= maxRedirects) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
        signal,
      });

      // Handle 3xx manual redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          redirectChain.push({
            url: currentUrl,
            status: response.status,
            fromUrl: currentUrl,
            httpStatus: response.status,
            isBlocked: true,
            blockReason: 'missing_location',
          });
          return {
            response,
            finalUrl: currentUrl,
            redirectCount: redirectCount + 1,
            redirectChain,
            disallowedRedirect: true,
            disallowedDestination: 'missing_location_header',
            redirectLimitReached: false,
            loopDetected: false,
            failureCategory: 'missing_location',
          };
        }

        let targetUrl: string;
        try {
          targetUrl = new URL(location, currentUrl).href;
        } catch {
          redirectChain.push({
            url: currentUrl,
            status: response.status,
            fromUrl: currentUrl,
            toUrl: location,
            httpStatus: response.status,
            location: location,
            locationHeader: location,
            isBlocked: true,
            blockReason: 'invalid_url',
          });
          return {
            response,
            finalUrl: currentUrl,
            redirectCount: redirectCount + 1,
            redirectChain,
            disallowedRedirect: true,
            disallowedDestination: location,
            redirectLimitReached: false,
            loopDetected: false,
            failureCategory: 'invalid_url',
          };
        }

        const normTarget = this.normalizeUrl(targetUrl);

        // Circular redirect loop check: detect repeated normalized URL BEFORE fetching next hop!
        if (visitedUrls.has(normTarget)) {
          redirectChain.push({
            url: currentUrl,
            status: response.status,
            fromUrl: currentUrl,
            toUrl: normTarget,
            httpStatus: response.status,
            location: location,
            locationHeader: location,
            isBlocked: true,
            blockReason: 'redirect_loop',
          });
          return {
            response,
            finalUrl: normTarget,
            redirectCount: redirectCount + 1,
            redirectChain,
            disallowedRedirect: true,
            disallowedDestination: normTarget,
            redirectLimitReached: false,
            loopDetected: true,
            failureCategory: 'redirect_loop',
          };
        }

        // Scope and SSRF destination safety check BEFORE requesting next hop!
        if (!this.isInScope(normTarget) || isSsrfTarget(normTarget, this.origin)) {
          redirectChain.push({
            url: currentUrl,
            status: response.status,
            fromUrl: currentUrl,
            toUrl: normTarget,
            httpStatus: response.status,
            location: location,
            locationHeader: location,
            isBlocked: true,
            blockReason: 'disallowed_scope_or_origin',
          });
          return {
            response,
            finalUrl: currentUrl,
            redirectCount: redirectCount + 1,
            redirectChain,
            disallowedRedirect: true,
            disallowedDestination: targetUrl,
            redirectLimitReached: false,
            loopDetected: false,
            failureCategory: 'disallowed_destination',
          };
        }

        // Redirect hop count check (max 3 redirects)
        if (redirectCount >= maxRedirects) {
          redirectChain.push({
            url: currentUrl,
            status: response.status,
            fromUrl: currentUrl,
            toUrl: normTarget,
            httpStatus: response.status,
            location: location,
            locationHeader: location,
            isBlocked: true,
            blockReason: 'too_many_redirects',
          });
          return {
            response,
            finalUrl: currentUrl,
            redirectCount: redirectCount + 1,
            redirectChain,
            disallowedRedirect: true,
            disallowedDestination: 'too_many_redirects',
            redirectLimitReached: true,
            loopDetected: false,
            failureCategory: 'too_many_redirects',
          };
        }

        redirectChain.push({
          url: currentUrl,
          status: response.status,
          fromUrl: currentUrl,
          toUrl: normTarget,
          httpStatus: response.status,
          location: location,
          locationHeader: location,
          isBlocked: false,
        });
        redirectCount++;
        visitedUrls.add(normTarget);
        currentUrl = normTarget;
        continue;
      }

      // Handle transparent browser redirect if any
      if (response.redirected && response.url) {
        const normFinal = this.normalizeUrl(response.url);
        if (!this.isInScope(normFinal) || isSsrfTarget(normFinal, this.origin)) {
          return {
            response,
            finalUrl: response.url,
            redirectCount: redirectCount + 1,
            redirectChain,
            disallowedRedirect: true,
            disallowedDestination: response.url,
            redirectLimitReached: false,
            loopDetected: false,
            failureCategory: 'disallowed_destination',
          };
        }
        currentUrl = normFinal;
      }

      return {
        response,
        finalUrl: currentUrl,
        redirectCount,
        redirectChain,
        disallowedRedirect: false,
        redirectLimitReached: false,
        loopDetected: false,
      };
    }

    return {
      response: new Response(null, { status: 310, statusText: 'Too many redirects' }),
      finalUrl: currentUrl,
      redirectCount,
      redirectChain,
      disallowedRedirect: true,
      disallowedDestination: 'too_many_redirects',
      redirectLimitReached: true,
      loopDetected: false,
      failureCategory: 'too_many_redirects',
    };
  }

  /**
   * Reads response body with a strict streaming byte cap.
   * Prevents buffering oversized (e.g. >5MB) payloads into memory.
   */
  public async readBoundedHtml(
    response: Response,
    maxBytes: number = 5 * 1024 * 1024
  ): Promise<{ html: string; isOversized: boolean; totalBytes: number }> {
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      let totalBytes = 0;
      const chunks: Uint8Array[] = [];
      let isOversized = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > maxBytes) {
            isOversized = true;
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }

      if (isOversized) {
        return { html: '', isOversized: true, totalBytes };
      }

      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      const html = new TextDecoder('utf-8', { fatal: false }).decode(combined);
      return { html, isOversized: false, totalBytes };
    }

    // Fallback for mocked or non-streaming environments (e.g. jsdom)
    const rawHtml = await response.text();
    const totalBytes = rawHtml.length;
    if (totalBytes > maxBytes) {
      return { html: '', isOversized: true, totalBytes };
    }
    return { html: rawHtml, isOversized: false, totalBytes };
  }
}
