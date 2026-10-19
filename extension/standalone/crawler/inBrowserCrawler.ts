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
} from '../types';
import { StandaloneDomParser } from '../audit/domParserEngine';
import { StandaloneSitemapParser } from './sitemapParser';

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
  private robotsPolicyStatus: 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified' = 'not_present_permissive';
  private robotsEvidence?: StandaloneRobotsEvidence;
  private sitemapEvidence?: StandaloneSitemapEvidence;

  public getRobotsPolicyStatus(): 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified' {
    return this.robotsPolicyStatus;
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

  public async fetchRobotsTxt(): Promise<StandaloneRobotsEvidence> {
    if (this.robotsFetched && this.robotsEvidence) {
      return this.robotsEvidence;
    }
    this.robotsFetched = true;
    const robotsUrl = `${this.origin}/robots.txt`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(robotsUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const status = res.status;
      if (status === 200) {
        const text = await res.text();
        this.parseRobotsTxt(text);
        this.robotsPolicyStatus = 'enforced';
        this.robotsEvidence = {
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
        };
      } else if (status === 404 || status === 410) {
        this.robotsPolicyStatus = 'not_present_permissive';
        this.robotsEvidence = {
          robotsUrl,
          httpStatus: status,
          fetchStatus: 'not_found',
          parserStatus: 'not_present',
          selectedUserAgent: '*',
          allowDirectives: [],
          disallowDirectives: [],
          sitemapDeclarations: [],
          policyOutcome: 'not_present_permissive',
        };
      } else if (status === 403 || status === 401) {
        this.robotsPolicyStatus = 'fetch_failed_unverified';
        this.robotsEvidence = {
          robotsUrl,
          httpStatus: status,
          fetchStatus: 'forbidden',
          parserStatus: 'not_present',
          selectedUserAgent: '*',
          allowDirectives: [],
          disallowDirectives: [],
          sitemapDeclarations: [],
          policyOutcome: 'fetch_failed_unverified',
        };
      } else {
        this.robotsPolicyStatus = 'fetch_failed_unverified';
        this.robotsEvidence = {
          robotsUrl,
          httpStatus: status,
          fetchStatus: 'error',
          parserStatus: 'not_present',
          selectedUserAgent: '*',
          allowDirectives: [],
          disallowDirectives: [],
          sitemapDeclarations: [],
          policyOutcome: 'fetch_failed_unverified',
        };
      }
    } catch {
      this.robotsPolicyStatus = 'fetch_failed_unverified';
      this.robotsEvidence = {
        robotsUrl,
        httpStatus: 0,
        fetchStatus: 'error',
        parserStatus: 'not_present',
        selectedUserAgent: '*',
        allowDirectives: [],
        disallowDirectives: [],
        sitemapDeclarations: [],
        policyOutcome: 'fetch_failed_unverified',
      };
    }

    return this.robotsEvidence!;
  }

  public parseRobotsTxt(robotsText: string): void {
    const lines = robotsText.split('\n');
    let hasSpecificGroup = false;

    this.allowDirectives = [];
    this.disallowDirectives = [];
    this.sitemapDeclarations = [];
    this.rules = [];

    // Pass 1: detect if a dedicated bot user-agent block exists
    for (const rawLine of lines) {
      const clean = (rawLine.split('#')[0] || '').trim();
      if (!clean) continue;
      const lower = clean.toLowerCase();
      if (lower.startsWith('user-agent:')) {
        const agent = clean.slice(11).trim().toLowerCase();
        if (agent === 'websiteauditbot' || agent.includes('websiteaudit')) {
          hasSpecificGroup = true;
          break;
        }
      }
    }

    const targetAgent = hasSpecificGroup ? 'websiteauditbot' : '*';
    this.selectedUserAgent = targetAgent;

    let inTargetGroup = false;

    for (const rawLine of lines) {
      const clean = (rawLine.split('#')[0] || '').trim();
      if (!clean) continue;
      const lower = clean.toLowerCase();

      if (lower.startsWith('user-agent:')) {
        const agent = clean.slice(11).trim().toLowerCase();
        inTargetGroup = agent === targetAgent || (!hasSpecificGroup && agent === '*');
      } else if (lower.startsWith('sitemap:')) {
        const smUrl = clean.slice(8).trim();
        if (smUrl && !this.sitemapDeclarations.includes(smUrl)) {
          this.sitemapDeclarations.push(smUrl);
        }
      } else if (inTargetGroup) {
        if (lower.startsWith('disallow:')) {
          const path = clean.slice(9).trim();
          if (path) {
            this.disallowDirectives.push(path);
            this.rules.push({ path, allow: false });
          }
        } else if (lower.startsWith('allow:')) {
          const path = clean.slice(6).trim();
          if (path) {
            this.allowDirectives.push(path);
            this.rules.push({ path, allow: true });
          }
        }
      }
    }
  }

  /**
   * RFC 9309 compliant path matching with longest-match precedence and wildcard support.
   */
  public isAllowedByRobots(urlOrPath: string): boolean {
    if (this.rules.length === 0) {
      return true;
    }

    let pathname = urlOrPath;
    try {
      if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
        pathname = new URL(urlOrPath).pathname;
      }
    } catch {
      pathname = urlOrPath;
    }

    const matchingRules = this.rules.filter((rule) => {
      if (!rule.path) return false;
      if (rule.path === '/') return true;

      let pattern = rule.path;
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
        return regex.test(pathname);
      }
      if (hasEndAnchor) {
        return pathname === pattern;
      }
      return pathname.startsWith(pattern);
    });

    if (matchingRules.length === 0) {
      return true;
    }

    // Sort descending by path length. On length tie, Allow takes precedence.
    matchingRules.sort((a, b) => {
      if (b.path.length !== a.path.length) {
        return b.path.length - a.path.length;
      }
      return a.allow ? -1 : 1;
    });

    return matchingRules[0]?.allow ?? true;
  }

  public async discoverSitemaps(): Promise<StandaloneSitemapEvidence> {
    const seedSitemapUrls: string[] = [];
    const sitemaps = this.robotsEvidence?.sitemapDeclarations || this.robotsEvidence?.sitemapsDeclared || [];
    if (sitemaps.length > 0) {
      seedSitemapUrls.push(...sitemaps);
    }
    // Standard sitemap fallback location
    seedSitemapUrls.push(`${this.origin}/sitemap.xml`);

    const parser = new StandaloneSitemapParser({
      maxSitemaps: 10,
      maxDepth: 3,
      maxUrlsPerSitemap: 500,
      maxSitemapUrls: 2000,
      fetchTimeoutMs: 5000,
    });

    const evidence = await parser.discoverAndParse(seedSitemapUrls, this.origin);
    this.sitemapEvidence = evidence;

    // Enqueue discovered in-scope sitemap URLs up to maxPages budget
    const discoveredUrls = evidence.urls || evidence.allSitemapUrls || [];
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

    return evidence;
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
      const pathname = new URL(item.url).pathname;
      if (this.config.respectRobots && !this.isAllowedByRobots(pathname)) {
        pageRecord = {
          id: `page-${crawledCount + 1}-${Date.now()}`,
          auditId: '',
          url: item.url,
          depth: item.depth,
          httpStatus: 0,
          fetchStatus: 'robots_blocked',
          errorCode: 'FETCH_ROBOTS_BLOCKED' as any,
          errorMessage: 'URL blocked by robots.txt disallow rule',
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
            pageRecord = {
              id: `page-${crawledCount + 1}-${Date.now()}`,
              auditId: '',
              url: item.url,
              depth: item.depth,
              httpStatus: response.status || 301,
              fetchStatus: 'skipped',
              errorCode: 'FETCH_REDIRECT_BLOCKED',
              errorMessage: `Redirect blocked: ${redirectResult.disallowedDestination || 'out_of_scope'}`,
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              headers,
              htmlSize: 0,
              responseTimeMs: elapsed,
              fetchedAt: Date.now(),
              isInSitemap,
              contentTypeCategory: 'HTTP_ERROR',
              title: `Disallowed redirect destination: ${redirectResult.disallowedDestination || 'out_of_scope'}`,
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
  ): Promise<{
    response: Response;
    finalUrl: string;
    redirectCount: number;
    disallowedRedirect: boolean;
    disallowedDestination?: string;
  }> {
    let currentUrl = initialUrl;
    let redirectCount = 0;
    const maxRedirects = 3;

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
          return {
            response,
            finalUrl: currentUrl,
            redirectCount,
            disallowedRedirect: true,
            disallowedDestination: 'missing_location_header',
          };
        }

        let targetUrl: string;
        try {
          targetUrl = new URL(location, currentUrl).href;
        } catch {
          return {
            response,
            finalUrl: currentUrl,
            redirectCount,
            disallowedRedirect: true,
            disallowedDestination: location,
          };
        }

        // Strictly validate redirect destination BEFORE fetching!
        const normTarget = this.normalizeUrl(targetUrl);
        if (!this.isInScope(normTarget)) {
          return {
            response,
            finalUrl: currentUrl,
            redirectCount,
            disallowedRedirect: true,
            disallowedDestination: targetUrl,
          };
        }

        redirectCount++;
        currentUrl = normTarget;
        continue;
      }

      // Handle transparent browser redirect if any
      if (response.redirected && response.url) {
        const normFinal = this.normalizeUrl(response.url);
        if (!this.isInScope(normFinal)) {
          return {
            response,
            finalUrl: response.url,
            redirectCount,
            disallowedRedirect: true,
            disallowedDestination: response.url,
          };
        }
        currentUrl = normFinal;
      }

      return {
        response,
        finalUrl: currentUrl,
        redirectCount,
        disallowedRedirect: false,
      };
    }

    return {
      response: new Response(null, { status: 310, statusText: 'Too many redirects' }),
      finalUrl: currentUrl,
      redirectCount,
      disallowedRedirect: true,
      disallowedDestination: 'too_many_redirects',
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
