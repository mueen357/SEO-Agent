/**
 * In-Browser Web Crawler.
 * Fetches authorized HTML pages with scope enforcement, concurrency throttling, and cancellation support.
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

  constructor(seedUrl: string, config: StandaloneAuditConfig) {
    this.config = config;
    const parsed = new URL(seedUrl);
    this.origin = parsed.origin;
    this.hostname = parsed.hostname;
    this.queue.push({ url: this.normalizeUrl(seedUrl), depth: 0 });
    this.seenUrls.add(this.normalizeUrl(seedUrl));
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
      // Scheme must match seed URL protocol (e.g. https remains https)
      if (u.protocol !== new URL(this.origin).protocol) return false;

      // Host must match exact hostname
      if (u.hostname !== this.hostname) return false;

      // SSRF defense: block private IP ranges and metadata hostnames
      if (this.isPrivateOrForbiddenHost(u.hostname)) return false;

      // Filter non-html extensions
      const path = u.pathname.toLowerCase();
      const nonHtmlExt = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf', '.zip', '.css', '.js', '.woff', '.woff2'];
      if (nonHtmlExt.some((ext) => path.endsWith(ext))) return false;

      return true;
    } catch {
      return false;
    }
  }

  public isPrivateOrForbiddenHost(host: string): boolean {
    const h = host.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h === 'metadata.google.internal' || h === '169.254.169.254') {
      return true;
    }
    // Simple private IPv4 check
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) {
      return true;
    }
    return false;
  }

  public async run(callbacks: CrawlCallbacks): Promise<void> {
    let crawledCount = 0;

    while (this.queue.length > 0 && crawledCount < this.config.maxPages) {
      if (callbacks.isCancelled()) {
        break;
      }

      const item = this.queue.shift();
      if (!item) break;

      callbacks.onProgress(crawledCount, this.seenUrls.size, item.url);

      const startTime = performance.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s fetch timeout

      let pageRecord: StandaloneCrawlPage;

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

        const html = await response.text();
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
      } catch (err: any) {
        clearTimeout(timeoutId);
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
      }

      await callbacks.onPageCrawled(pageRecord);
      crawledCount++;

      // Polite crawling delay
      if (this.config.delayMs > 0 && this.queue.length > 0) {
        await new Promise((res) => setTimeout(res, this.config.delayMs));
      }
    }
  }
}
