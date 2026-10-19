/**
 * Safe, Bounded Client-Side XML Sitemap Discovery and Parsing Engine.
 * Complies with Sitemaps Protocol 0.9 and protects against XXE / Entity Expansion attacks.
 */

import type { StandaloneSitemapEntry, StandaloneSitemapEvidence } from '../types';

export interface SitemapParserConfig {
  maxSitemaps?: number;
  maxSitemapUrls?: number;
  maxUrlsPerSitemap?: number;
  maxTotalUrls?: number;
  maxDepth?: number;
  fetchTimeoutMs?: number;
  timeoutMs?: number;
  maxByteSize?: number;
}

/**
 * Detects XML entity expansion / XXE vectors.
 */
export function hasUnsafeXmlEntities(xml: string): boolean {
  const trimmed = xml.trimStart();
  return /<!DOCTYPE\b/i.test(trimmed) || /<!ENTITY\b/i.test(trimmed);
}

/**
 * Normalizes URL from sitemaps, trimming trailing slash unless it is the root path.
 */
export function normalizeSitemapUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return urlStr.replace(/\/+$/, '') || urlStr;
  }
}

export class StandaloneSitemapParser {
  private origin: string;
  private hostname: string;
  private maxSitemaps: number;
  private maxSitemapUrls: number;
  private maxUrlsPerSitemap: number;
  private maxDepth: number;
  private fetchTimeoutMs: number;
  private maxByteSize: number;

  constructor(targetUrlOrConfig?: string | SitemapParserConfig, maybeConfig?: SitemapParserConfig) {
    let targetUrl = '';
    let config: SitemapParserConfig = {};

    if (typeof targetUrlOrConfig === 'string') {
      targetUrl = targetUrlOrConfig;
      config = maybeConfig || {};
    } else if (typeof targetUrlOrConfig === 'object' && targetUrlOrConfig !== null) {
      config = targetUrlOrConfig;
    }

    try {
      if (targetUrl) {
        const u = new URL(targetUrl);
        this.origin = u.origin;
        this.hostname = u.hostname.toLowerCase();
      } else {
        this.origin = '';
        this.hostname = '';
      }
    } catch {
      this.origin = targetUrl || '';
      this.hostname = (targetUrl || '').toLowerCase();
    }

    this.maxSitemaps = config.maxSitemaps ?? 10;
    this.maxSitemapUrls = config.maxSitemapUrls ?? (config as any).maxTotalUrls ?? 2000;
    this.maxUrlsPerSitemap = config.maxUrlsPerSitemap ?? 500;
    this.maxDepth = config.maxDepth ?? 3;
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? (config as any).timeoutMs ?? 5000;
    this.maxByteSize = config.maxByteSize ?? 2 * 1024 * 1024; // 2MB cap
  }

  public isInScope(url: string): boolean {
    if (!this.hostname) return true;
    try {
      const u = new URL(url);
      return u.hostname.toLowerCase() === this.hostname;
    } catch {
      return false;
    }
  }

  /**
   * Discovers and parses sitemaps from seed URLs with optional base origin.
   */
  public async discoverAndParse(
    seedSitemapUrls: string[],
    baseOrigin?: string
  ): Promise<StandaloneSitemapEvidence> {
    if (baseOrigin && !this.origin) {
      this.origin = baseOrigin;
      try {
        this.hostname = new URL(baseOrigin).hostname.toLowerCase();
      } catch {}
    }
    return this.discoverSitemaps(seedSitemapUrls);
  }

  /**
   * Discovers and parses sitemaps from robots declarations and conventional sitemap locations.
   */
  public async discoverSitemaps(
    robotsSitemaps: string[] = []
  ): Promise<StandaloneSitemapEvidence> {
    const candidates: string[] = [];

    // 1. Robots.txt declared sitemaps
    for (const sm of robotsSitemaps) {
      const trimmed = sm.trim();
      if (trimmed && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    }

    // 2. Standard conventional sitemap locations
    const defaultSitemap = `${this.origin}/sitemap.xml`;
    const defaultIndex = `${this.origin}/sitemap_index.xml`;
    if (!candidates.includes(defaultSitemap)) candidates.push(defaultSitemap);
    if (!candidates.includes(defaultIndex)) candidates.push(defaultIndex);

    const visited = new Set<string>();
    const sitemapsDiscovered: StandaloneSitemapEntry[] = [];
    const allUrlsSet = new Set<string>();
    const errors: string[] = [];
    let indexCount = 0;

    for (const sitemapUrl of candidates) {
      if (visited.size >= this.maxSitemaps) break;
      await this.crawlSitemapRecursive(
        sitemapUrl,
        0,
        visited,
        sitemapsDiscovered,
        allUrlsSet,
        errors
      );
    }

    for (const sm of sitemapsDiscovered) {
      if (sm.isIndex) indexCount++;
    }

    const allSitemapUrls = Array.from(allUrlsSet).slice(0, this.maxSitemapUrls);

    return {
      sitemapsDiscovered,
      sitemaps: sitemapsDiscovered,
      allSitemapUrls,
      urls: allSitemapUrls,
      totalDiscoveredUrlsCount: allSitemapUrls.length,
      indexCount,
      hasErrors: errors.length > 0 || sitemapsDiscovered.some((s) => s.status !== 'valid'),
      errors,
    };
  }

  private async crawlSitemapRecursive(
    sitemapUrl: string,
    depth: number,
    visited: Set<string>,
    records: StandaloneSitemapEntry[],
    allUrls: Set<string>,
    errors: string[]
  ): Promise<void> {
    if (depth > this.maxDepth || visited.has(sitemapUrl)) return;
    if (visited.size >= this.maxSitemaps) return;

    visited.add(sitemapUrl);

    // Host scope validation
    if (!this.isInScope(sitemapUrl)) {
      records.push({
        sitemapUrl,
        status: 'fetch_error',
        errorMessage: 'Sitemap URL is outside crawl host scope',
        urlsCount: 0,
        urls: [],
      });
      errors.push(`Sitemap ${sitemapUrl} is out of scope`);
      return;
    }

    let response: Response;
    let rawText: string;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

      response = await fetch(sitemapUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/xml, text/xml, */*;q=0.8',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        records.push({
          sitemapUrl,
          status: 'fetch_error',
          httpStatus: response.status,
          errorMessage: `HTTP ${response.status} ${response.statusText}`,
          urlsCount: 0,
          urls: [],
        });
        errors.push(`Failed to fetch ${sitemapUrl}: HTTP ${response.status}`);
        return;
      }

      // Check Content-Length if provided
      const cl = response.headers.get('content-length');
      if (cl && parseInt(cl, 10) > this.maxByteSize) {
        records.push({
          sitemapUrl,
          status: 'fetch_error',
          httpStatus: response.status,
          errorMessage: `Sitemap exceeds ${Math.round(this.maxByteSize / 1024 / 1024)}MB size limit`,
          urlsCount: 0,
          urls: [],
        });
        errors.push(`Sitemap ${sitemapUrl} exceeds size limit`);
        return;
      }

      rawText = await response.text();
      if (rawText.length > this.maxByteSize) {
        records.push({
          sitemapUrl,
          status: 'fetch_error',
          httpStatus: response.status,
          errorMessage: 'Sitemap response body exceeds size limit',
          urlsCount: 0,
          urls: [],
        });
        errors.push(`Sitemap ${sitemapUrl} exceeds size limit`);
        return;
      }
    } catch (err: any) {
      records.push({
        sitemapUrl,
        status: 'fetch_error',
        errorMessage: err.name === 'AbortError' ? 'Fetch timeout (5s)' : err.message || 'Fetch failed',
        urlsCount: 0,
        urls: [],
      });
      errors.push(`Error fetching ${sitemapUrl}: ${err.message || 'Network error'}`);
      return;
    }

    // XXE and Entity Expansion Protection
    if (this.hasUnsafeXmlEntities(rawText)) {
      records.push({
        sitemapUrl,
        status: 'parse_error',
        httpStatus: response.status,
        errorMessage: 'Potentially malicious XML entity or DOCTYPE declaration rejected (XXE defense)',
        urlsCount: 0,
        urls: [],
      });
      errors.push(`Sitemap ${sitemapUrl} contains disallowed DOCTYPE/ENTITY declarations`);
      return;
    }

    const parsed = this.parseXmlSafely(rawText, sitemapUrl);
    if (parsed.status === 'parse_error') {
      records.push({
        sitemapUrl,
        status: 'parse_error',
        httpStatus: response.status,
        errorMessage: parsed.errorMessage || 'Invalid XML syntax or unsupported schema',
        urlsCount: 0,
        urls: [],
      });
      errors.push(`Parse error in ${sitemapUrl}: ${parsed.errorMessage}`);
      return;
    }

    if (parsed.isIndex) {
      records.push({
        sitemapUrl,
        status: 'valid',
        httpStatus: response.status,
        urlsCount: parsed.childSitemaps.length,
        urls: [],
        isIndex: true,
        childSitemaps: parsed.childSitemaps,
      });

      for (const nestedUrl of parsed.childSitemaps) {
        if (visited.size >= this.maxSitemaps) break;
        await this.crawlSitemapRecursive(
          nestedUrl,
          depth + 1,
          visited,
          records,
          allUrls,
          errors
        );
      }
    } else {
      const validUrls: string[] = [];
      for (const u of parsed.urls) {
        if (this.isInScope(u)) {
          validUrls.push(u);
          allUrls.add(u);
        }
      }

      records.push({
        sitemapUrl,
        status: 'valid',
        httpStatus: response.status,
        urlsCount: validUrls.length,
        urls: validUrls.slice(0, this.maxUrlsPerSitemap),
        isIndex: false,
        lastModified: parsed.lastModified,
      });
    }
  }

  /**
  * Detects XML entity expansion / XXE vectors.
  */
  public hasUnsafeXmlEntities(xml: string): boolean {
    return hasUnsafeXmlEntities(xml);
  }

  /**
   * Parses XML sitemap string into structured representation.
   */
  public parseXml(
    xml: string,
    sitemapUrl: string
  ): {
    type: 'urlset' | 'sitemapindex' | 'unknown' | 'error';
    status: 'valid' | 'parse_error';
    isIndex: boolean;
    urls: string[];
    sitemapUrls: string[];
    childSitemaps: string[];
    lastModified?: string;
    errorMessage?: string;
  } {
    const res = this.parseXmlSafely(xml, sitemapUrl);
    const type = res.isIndex ? 'sitemapindex' : res.status === 'valid' ? 'urlset' : 'error';
    const normalizedUrls = res.urls.map((u) => normalizeSitemapUrl(u));
    return {
      type,
      status: res.status,
      isIndex: res.isIndex,
      urls: normalizedUrls,
      sitemapUrls: res.childSitemaps,
      childSitemaps: res.childSitemaps,
      lastModified: res.lastModified,
      errorMessage: res.errorMessage,
    };
  }

  /**
   * Safely parses XML sitemap string using DOMParser where available,
   * with regex fallback for headless / service worker execution.
   */
  public parseXmlSafely(
    xml: string,
    sitemapUrl: string
  ): {
    status: 'valid' | 'parse_error';
    isIndex: boolean;
    urls: string[];
    childSitemaps: string[];
    lastModified?: string;
    errorMessage?: string;
  } {
    // Attempt parsing with DOMParser if available
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
          return {
            status: 'parse_error',
            isIndex: false,
            urls: [],
            childSitemaps: [],
            errorMessage: parserError.textContent?.slice(0, 200) || 'XML parser error',
          };
        }

        const rootTag = doc.documentElement?.localName?.toLowerCase() || '';

        if (rootTag === 'sitemapindex') {
          const sitemapNodes = Array.from(doc.getElementsByTagNameNS('*', 'sitemap'));
          const childSitemaps: string[] = [];
          for (const sm of sitemapNodes) {
            const locNode = sm.getElementsByTagNameNS('*', 'loc')[0];
            const loc = locNode?.textContent?.trim();
            if (loc) {
              try {
                childSitemaps.push(new URL(loc, sitemapUrl).href);
              } catch {}
            }
          }
          return {
            status: 'valid',
            isIndex: true,
            urls: [],
            childSitemaps,
          };
        }

        if (rootTag === 'urlset') {
          const urlNodes = Array.from(doc.getElementsByTagNameNS('*', 'url'));
          const urls: string[] = [];
          let lastModified: string | undefined;

          for (const uNode of urlNodes) {
            const locNode = uNode.getElementsByTagNameNS('*', 'loc')[0];
            const loc = locNode?.textContent?.trim();
            if (loc) {
              try {
                urls.push(normalizeSitemapUrl(new URL(loc, sitemapUrl).href));
              } catch {}
            }
            if (!lastModified) {
              const lmNode = uNode.getElementsByTagNameNS('*', 'lastmod')[0];
              if (lmNode?.textContent?.trim()) {
                lastModified = lmNode.textContent.trim();
              }
            }
          }
          return {
            status: 'valid',
            isIndex: false,
            urls,
            childSitemaps: [],
            lastModified,
          };
        }

        return {
          status: 'parse_error',
          isIndex: false,
          urls: [],
          childSitemaps: [],
          errorMessage: `Unrecognized XML root element '<${rootTag}>'`,
        };
      } catch (err: any) {
        // Fall back to regex parsing below
      }
    }

    // Regex fallback parser
    return this.parseXmlRegexFallback(xml, sitemapUrl);
  }

  /**
   * Deterministic regex fallback parsing for environments without DOMParser.
   */
  public parseXmlRegexFallback(
    xml: string,
    sitemapUrl: string
  ): {
    status: 'valid' | 'parse_error';
    isIndex: boolean;
    urls: string[];
    childSitemaps: string[];
    lastModified?: string;
    errorMessage?: string;
  } {
    const isIndex = /<sitemapindex\b/i.test(xml);
    const isUrlSet = /<urlset\b/i.test(xml);

    if (!isIndex && !isUrlSet) {
      return {
        status: 'parse_error',
        isIndex: false,
        urls: [],
        childSitemaps: [],
        errorMessage: 'Document contains neither <urlset> nor <sitemapindex> root elements',
      };
    }

    if (isIndex) {
      const childSitemaps: string[] = [];
      const sitemapBlocks = xml.matchAll(/<sitemap\b[\s\S]*?<\/sitemap>/gi);
      for (const match of sitemapBlocks) {
        const block = match[0];
        const locMatch = block.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
        if (locMatch && locMatch[1]) {
          const loc = locMatch[1].trim();
          if (loc) {
            try {
              childSitemaps.push(new URL(loc, sitemapUrl).href);
            } catch {}
          }
        }
      }
      return {
        status: 'valid',
        isIndex: true,
        urls: [],
        childSitemaps,
      };
    }

    // Urlset
    const urls: string[] = [];
    let lastModified: string | undefined;
    const urlBlocks = xml.matchAll(/<url\b[\s\S]*?<\/url>/gi);
    for (const match of urlBlocks) {
      const block = match[0];
      const locMatch = block.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
      if (locMatch && locMatch[1]) {
        const loc = locMatch[1].trim();
        if (loc) {
          try {
            urls.push(normalizeSitemapUrl(new URL(loc, sitemapUrl).href));
          } catch {}
        }
      }
      if (!lastModified) {
        const lmMatch = block.match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i);
        if (lmMatch && lmMatch[1]) {
          lastModified = lmMatch[1].trim();
        }
      }
    }

    return {
      status: 'valid',
      isIndex: false,
      urls,
      childSitemaps: [],
      lastModified,
    };
  }
}
