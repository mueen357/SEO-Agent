/**
 * In-Browser Web Crawler.
 * Fetches authorized HTML pages with scope enforcement, robots.txt policy,
 * redirect safety checks, content-type verification, and durable frontier state.
 */

import type { StandaloneAuditConfig, StandaloneCrawlPage } from '../types';
import { StandaloneDomParser } from '../audit/domParserEngine';

export interface CrawlCallbacks {
  onPageCrawled: (page: StandaloneCrawlPage) => Promise<void>;
  onProgress: (crawled: number, totalDiscovered: number, currentUrl: string) => void;
  isCancelled: () => boolean;
}

export class InBrowserCrawler {
  private config: StandaloneAuditConfig;
  private origin: string;
  private hostname: string;
  private seenUrls = new Set<string>();
  private queue: Array<{ url: string; depth: number }> = [];
  private crawledUrls: string[] = [];
  private disallowedPaths: string[] = [];
  private robotsFetched = false;
  private robotsPolicyStatus: 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified' = 'not_present_permissive';

  public getRobotsPolicyStatus(): 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified' {
    return this.robotsPolicyStatus;
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

  public isInScope(urlStr: string): boolean {
    try {
      const u = new URL(urlStr);

      // Security: Reject credentials in URLs (e.g. https://user:pass@example.com)
      if (u.username || u.password) return false;

      // Scheme must match seed URL protocol (e.g. https remains https)
      if (u.protocol !== new URL(this.origin).protocol) return false;

      // Host must match exact hostname
      if (u.hostname !== this.hostname) return false;

      // Host safety check: block loopback, private ranges, cloud metadata
      // Allows seed host if user explicitly authorized testing on localhost / 127.0.0.1
      if (this.isPrivateOrForbiddenHost(u.hostname, this.hostname === u.hostname)) return false;

      // Filter non-html extensions
      const path = u.pathname.toLowerCase();
      const nonHtmlExt = [
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
        '.pdf', '.zip', '.css', '.js', '.woff', '.woff2',
        '.mp4', '.mp3', '.tar', '.gz', '.xml', '.json'
      ];
      if (nonHtmlExt.some((ext) => path.endsWith(ext))) return false;

      // Robots.txt disallow check
      if (this.config.respectRobots && !this.isAllowedByRobots(u.pathname)) {
        return false;
      }

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

  public async fetchRobotsTxt(): Promise<void> {
    if (this.robotsFetched || !this.config.respectRobots) return;
    this.robotsFetched = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${this.origin}/robots.txt`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 200) {
        const text = await res.text();
        this.parseRobotsTxt(text);
        this.robotsPolicyStatus = 'enforced';
      } else if (res.status === 404 || res.status === 410) {
        this.robotsPolicyStatus = 'not_present_permissive';
      } else {
        // 5xx server error, network block, or unexpected response: do NOT claim verified robots compliance
        this.robotsPolicyStatus = 'fetch_failed_unverified';
      }
    } catch {
      // Fetch error or timeout: do NOT claim verified robots compliance
      this.robotsPolicyStatus = 'fetch_failed_unverified';
    }
  }

  public parseRobotsTxt(robotsText: string): void {
    const lines = robotsText.split('\n');
    let appliesToAll = false;

    for (const rawLine of lines) {
      const line = (rawLine.split('#')[0] || '').trim();
      if (!line) continue;
      const lower = line.toLowerCase();

      if (lower.startsWith('user-agent:')) {
        const agent = line.slice(11).trim();
        appliesToAll = agent === '*' || agent.toLowerCase().includes('bot');
      } else if (appliesToAll && lower.startsWith('disallow:')) {
        const path = line.slice(9).trim();
        if (path) {
          this.disallowedPaths.push(path);
        }
      }
    }
  }

  public isAllowedByRobots(pathname: string): boolean {
    for (const dis of this.disallowedPaths) {
      if (dis === '/' || pathname.startsWith(dis)) {
        return false;
      }
    }
    return true;
  }

  public async run(callbacks: CrawlCallbacks): Promise<void> {
    let crawledCount = 0;

    // Load robots.txt once before beginning crawl
    if (this.config.respectRobots && !this.robotsFetched) {
      await this.fetchRobotsTxt();
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
      const maxRetries = 2;
      let attempt = 0;
      let fetchSuccess = false;

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
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              headers,
              htmlSize: 0,
              responseTimeMs: elapsed,
              fetchedAt: Date.now(),
              title: `Disallowed redirect destination: ${redirectResult.disallowedDestination || 'out_of_scope'}`,
            };
            await callbacks.onPageCrawled(pageRecord);
            this.crawledUrls.push(item.url);
            crawledCount++;
            fetchSuccess = true;
            break;
          }

          // Content-Type validation: only parse HTML documents
          const contentType = (headers['content-type'] || '').toLowerCase();
          if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
            pageRecord = {
              id: `page-${crawledCount + 1}-${Date.now()}`,
              auditId: '',
              url: item.url,
              depth: item.depth,
              httpStatus: response.status,
              fetchStatus: 'skipped',
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              headers,
              htmlSize: 0,
              responseTimeMs: elapsed,
              fetchedAt: Date.now(),
            };
            await callbacks.onPageCrawled(pageRecord);
            this.crawledUrls.push(item.url);
            crawledCount++;
            fetchSuccess = true;
            break;
          }

          // Streaming Bounded response read: strict 5MB cap
          const { html, isOversized, totalBytes } = await this.readBoundedHtml(response, 5 * 1024 * 1024);

          if (isOversized) {
            pageRecord = {
              id: `page-${crawledCount + 1}-${Date.now()}`,
              auditId: '',
              url: item.url,
              depth: item.depth,
              httpStatus: response.status,
              fetchStatus: 'failed',
              headings: { h1: [], h2: [], h3: [] },
              links: [],
              images: [],
              headers,
              htmlSize: totalBytes,
              responseTimeMs: elapsed,
              fetchedAt: Date.now(),
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
          const parsedEvidence = await StandaloneDomParser.parseAsync(html, targetUrlForEvidence);

          pageRecord = {
            id: `page-${crawledCount + 1}-${Date.now()}`,
            auditId: '', // Filled by coordinator
            url: item.url,
            depth: item.depth,
            httpStatus: response.status,
            fetchStatus: response.ok ? 'success' : 'failed',
            title: parsedEvidence.title,
            metaDescription: parsedEvidence.metaDescription,
            headings: parsedEvidence.headings,
            canonicalUrl: parsedEvidence.canonicalUrl,
            metaRobots: parsedEvidence.metaRobots,
            links: parsedEvidence.links,
            images: parsedEvidence.images,
            headers,
            htmlSize: totalBytes,
            responseTimeMs: elapsed,
            fetchedAt: Date.now(),
            evidence: parsedEvidence, // Retain original full evidence
          };

          // Enqueue discovered child links if within depth limit
          if (item.depth < this.config.maxDepth) {
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
          if (attempt <= maxRetries && err.name !== 'AbortError') {
            // Transient error: retry with backoff
            await new Promise((res) => setTimeout(res, 500 * attempt));
            continue;
          }

          const elapsed = Math.round(performance.now() - startTime);
          pageRecord = {
            id: `page-${crawledCount + 1}-${Date.now()}`,
            auditId: '',
            url: item.url,
            depth: item.depth,
            httpStatus: 0,
            fetchStatus: err.name === 'AbortError' ? 'timeout' : 'failed',
            headings: { h1: [], h2: [], h3: [] },
            links: [],
            images: [],
            headers: {},
            htmlSize: 0,
            responseTimeMs: elapsed,
            fetchedAt: Date.now(),
          };

          await callbacks.onPageCrawled(pageRecord);
          this.crawledUrls.push(item.url);
          crawledCount++;
          fetchSuccess = true;
        }
      }

      // Polite crawling delay
      if (this.config.delayMs > 0 && this.queue.length > 0) {
        await new Promise((res) => setTimeout(res, this.config.delayMs));
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
