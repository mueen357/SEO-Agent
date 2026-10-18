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

      if (res.ok) {
        const text = await res.text();
        this.parseRobotsTxt(text);
      }
    } catch {
      // Default to permissive crawl if robots.txt cannot be fetched or does not exist
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
          const response = await fetch(item.url, {
            method: 'GET',
            headers: {
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const elapsed = Math.round(performance.now() - startTime);

          // Collect response headers
          const headers: Record<string, string> = {};
          response.headers.forEach((val, key) => {
            headers[key.toLowerCase()] = val;
          });

          // Check redirect destination safety
          if (response.redirected && response.url) {
            const finalNorm = this.normalizeUrl(response.url);
            if (!this.isInScope(finalNorm)) {
              // Disallowed cross-origin or out-of-scope redirect destination!
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

          // Bounded response size: cap at 5MB
          const rawHtml = await response.text();
          const MAX_SIZE = 5 * 1024 * 1024;
          const html = rawHtml.length > MAX_SIZE ? rawHtml.slice(0, MAX_SIZE) : rawHtml;

          const parsedEvidence = StandaloneDomParser.parse(html, item.url);

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
            htmlSize: html.length,
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
}
