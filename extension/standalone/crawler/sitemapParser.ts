/**
 * Safe, Bounded Client-Side XML Sitemap Discovery and Parsing Engine.
 * Complies with Sitemaps Protocol 0.9 and protects against XXE, SSRF,
 * unbounded memory exhaustion, and unauthorized origin escapes.
 */

import type { StandaloneSitemapEntry, StandaloneSitemapEvidence } from '../types';
import { normalizeSitemapEntry, normalizeSitemapEvidence } from '../types';

export interface SitemapParserConfig {
  authorizedOrigin?: string;
  origin?: string;
  targetUrl?: string;
  maxSitemaps?: number;
  maxSitemapUrls?: number;
  maxUrlsPerSitemap?: number;
  maxTotalUrls?: number;
  maxDepth?: number;
  fetchTimeoutMs?: number;
  timeoutMs?: number;
  maxByteSize?: number;
  maxRedirects?: number;
}

/**
 * Detects XML entity expansion / XXE vectors before parsing.
 */
export function hasUnsafeXmlEntities(xml: string): boolean {
  const trimmed = xml.trimStart();
  return /<!DOCTYPE\b/i.test(trimmed) || /<!ENTITY\b/i.test(trimmed);
}

/**
 * Checks whether a hostname points to a private, loopback, or cloud metadata address.
 */
export function isPrivateOrMetadataHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (lower === '127.0.0.1' || lower === '0.0.0.0' || lower === '::1') return true;
  if (lower === '169.254.169.254' || lower === 'metadata.google.internal' || lower === 'instance-data') return true;

  const parts = lower.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const p0 = parts[0];
    const p1 = parts[1];
    if (p0 === 10) return true;
    if (p0 === 127) return true;
    if (p0 === 169 && p1 === 254) return true;
    if (p0 === 172 && p1 !== undefined && p1 >= 16 && p1 <= 31) return true;
    if (p0 === 192 && p1 === 168) return true;
    if (p0 === 0) return true;
  }
  return false;
}

/**
 * Validates against SSRF targets, embedded credentials, and cloud metadata.
 */
export function isSsrfTarget(urlStr: string, authorizedOrigin?: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();

    // Always block cloud metadata endpoints
    if (host === '169.254.169.254' || host === 'metadata.google.internal' || host === 'instance-data') {
      return true;
    }

    // Block embedded credentials (e.g. https://user:pass@example.com)
    if (u.username || u.password) {
      return true;
    }

    // If matching authorized origin, allow (e.g., local dev fixture like http://127.0.0.1:4321)
    if (authorizedOrigin) {
      try {
        const authUrl = new URL(authorizedOrigin);
        if (authUrl.hostname.toLowerCase() === host) {
          return false;
        }
      } catch {}
    }

    return isPrivateOrMetadataHost(host);
  } catch {
    return true;
  }
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
  public origin: string;
  public authorizedOrigin: string;
  public hostname: string;
  private maxSitemaps: number;
  private maxSitemapUrls: number;
  private maxUrlsPerSitemap: number;
  private maxDepth: number;
  private fetchTimeoutMs: number;
  private maxByteSize: number;
  private maxRedirects: number;

  constructor(targetUrlOrConfig?: string | SitemapParserConfig, maybeConfig?: SitemapParserConfig) {
    let targetUrl = '';
    let config: SitemapParserConfig = {};

    if (typeof targetUrlOrConfig === 'string') {
      targetUrl = targetUrlOrConfig;
      config = maybeConfig || {};
    } else if (typeof targetUrlOrConfig === 'object' && targetUrlOrConfig !== null) {
      config = targetUrlOrConfig;
      targetUrl = config.authorizedOrigin || config.origin || config.targetUrl || '';
    }

    try {
      if (targetUrl) {
        const u = new URL(targetUrl);
        this.authorizedOrigin = u.origin;
        this.origin = u.origin;
        this.hostname = u.hostname.toLowerCase();
      } else {
        this.authorizedOrigin = '';
        this.origin = '';
        this.hostname = '';
      }
    } catch {
      this.authorizedOrigin = targetUrl || '';
      this.origin = targetUrl || '';
      this.hostname = (targetUrl || '').toLowerCase();
    }

    this.maxSitemaps = config.maxSitemaps ?? 10;
    this.maxSitemapUrls = config.maxSitemapUrls ?? (config as any).maxTotalUrls ?? 2000;
    this.maxUrlsPerSitemap = config.maxUrlsPerSitemap ?? 500;
    this.maxDepth = config.maxDepth ?? 3;
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? (config as any).timeoutMs ?? 5000;
    this.maxByteSize = config.maxByteSize ?? 2 * 1024 * 1024; // 2MB cap
    this.maxRedirects = config.maxRedirects ?? 3;
  }

  /**
   * Enforces exact user-authorized origin scope, including scheme and port.
   */
  public isInScope(url: string): boolean {
    if (!this.authorizedOrigin) return false;
    try {
      const u = new URL(url);
      if (u.username || u.password) return false;
      return u.origin.toLowerCase() === this.authorizedOrigin.toLowerCase();
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
    if (baseOrigin && !this.authorizedOrigin) {
      try {
        const u = new URL(baseOrigin);
        this.authorizedOrigin = u.origin;
        this.origin = u.origin;
        this.hostname = u.hostname.toLowerCase();
      } catch {
        this.authorizedOrigin = baseOrigin;
        this.origin = baseOrigin;
        this.hostname = baseOrigin.toLowerCase();
      }
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

    // 2. Standard conventional sitemap locations (only if authorizedOrigin is present)
    if (this.authorizedOrigin) {
      const defaultSitemap = `${this.authorizedOrigin}/sitemap.xml`;
      const defaultIndex = `${this.authorizedOrigin}/sitemap_index.xml`;
      if (!candidates.includes(defaultSitemap)) candidates.push(defaultSitemap);
      if (!candidates.includes(defaultIndex)) candidates.push(defaultIndex);
    }

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

    return normalizeSitemapEvidence({
      sitemapsDiscovered,
      sitemaps: sitemapsDiscovered,
      allSitemapUrls,
      urls: allSitemapUrls,
      totalDiscoveredUrlsCount: allSitemapUrls.length,
      indexCount,
      hasErrors: errors.length > 0 || sitemapsDiscovered.some((s) => s.status !== 'valid' && s.status !== 'out_of_scope'),
      errors,
    })!;
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

    // Exact origin scope enforcement (Section 4)
    if (!this.isInScope(sitemapUrl)) {
      records.push(
        normalizeSitemapEntry({
          sitemapUrl,
          url: sitemapUrl,
          status: 'out_of_scope',
          fetchStatus: 'out_of_scope',
          parseStatus: 'not_parsed',
          errorMessage: `Sitemap URL '${sitemapUrl}' is outside authorized origin scope '${this.authorizedOrigin}' (fetch skipped)`,
          urlsCount: 0,
          urls: [],
          isIndex: false,
        })
      );
      errors.push(`Discovered external sitemap declaration '${sitemapUrl}' outside authorized origin scope (fetch skipped)`);
      return;
    }

    // SSRF target check
    if (isSsrfTarget(sitemapUrl, this.authorizedOrigin)) {
      records.push(
        normalizeSitemapEntry({
          sitemapUrl,
          url: sitemapUrl,
          status: 'unauthorized',
          fetchStatus: 'fetch_error',
          parseStatus: 'not_parsed',
          errorMessage: `Sitemap URL '${sitemapUrl}' rejected as potential SSRF / private destination`,
          urlsCount: 0,
          urls: [],
          isIndex: false,
        })
      );
      errors.push(`Sitemap request to disallowed destination blocked: ${sitemapUrl}`);
      return;
    }

    let response: Response;
    let finalUrl = sitemapUrl;
    let rawText: string;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

    try {
      const fetchResult = await this.fetchSitemapWithControlledRedirect(sitemapUrl, controller.signal);
      response = fetchResult.response;
      finalUrl = fetchResult.finalUrl;

      if (!response.ok) {
        records.push(
          normalizeSitemapEntry({
            sitemapUrl,
            url: sitemapUrl,
            status: 'fetch_error',
            fetchStatus: 'fetch_error',
            parseStatus: 'not_parsed',
            httpStatus: response.status,
            errorMessage: `HTTP ${response.status} ${response.statusText}`,
            urlsCount: 0,
            urls: [],
          })
        );
        errors.push(`Failed to fetch ${sitemapUrl}: HTTP ${response.status}`);
        return;
      }

      // Bounded Streaming Response Reading (Section 5)
      rawText = await this.readBoundedResponseBody(response, controller.signal);
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('aborted');
      const errorMsg = isTimeout
        ? `Fetch timeout (${Math.round(this.fetchTimeoutMs / 1000)}s)`
        : err.message || 'Fetch failed';

      records.push(
        normalizeSitemapEntry({
          sitemapUrl,
          url: sitemapUrl,
          status: 'fetch_error',
          fetchStatus: 'fetch_error',
          parseStatus: 'not_parsed',
          errorMessage: errorMsg,
          urlsCount: 0,
          urls: [],
        })
      );
      errors.push(`Error fetching ${sitemapUrl}: ${errorMsg}`);
      return;
    } finally {
      clearTimeout(timeoutId);
    }

    // XXE and Entity Expansion Protection (Section 6)
    if (this.hasUnsafeXmlEntities(rawText)) {
      records.push(
        normalizeSitemapEntry({
          sitemapUrl,
          url: sitemapUrl,
          status: 'parse_error',
          fetchStatus: 'fetched',
          parseStatus: 'parse_error',
          httpStatus: response.status,
          errorMessage: 'Potentially malicious XML entity or DOCTYPE declaration rejected (XXE defense)',
          urlsCount: 0,
          urls: [],
        })
      );
      errors.push(`Sitemap ${sitemapUrl} contains disallowed DOCTYPE/ENTITY declarations`);
      return;
    }

    const parsed = this.parseXmlSafely(rawText, finalUrl);
    if (parsed.status === 'parse_error') {
      records.push(
        normalizeSitemapEntry({
          sitemapUrl,
          url: sitemapUrl,
          status: 'parse_error',
          fetchStatus: 'fetched',
          parseStatus: 'parse_error',
          httpStatus: response.status,
          errorMessage: parsed.errorMessage || 'Invalid XML syntax or unsupported schema',
          urlsCount: 0,
          urls: [],
        })
      );
      errors.push(`Parse error in ${sitemapUrl}: ${parsed.errorMessage}`);
      return;
    }

    if (parsed.isIndex) {
      records.push(
        normalizeSitemapEntry({
          sitemapUrl,
          url: sitemapUrl,
          status: 'valid',
          fetchStatus: 'fetched',
          parseStatus: 'parsed',
          httpStatus: response.status,
          urlsCount: parsed.childSitemaps.length,
          urls: [],
          isIndex: true,
          childSitemaps: parsed.childSitemaps,
        })
      );

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
      const seenInThisSitemap = new Set<string>();

      for (const u of parsed.urls) {
        if (this.isInScope(u) && !seenInThisSitemap.has(u)) {
          seenInThisSitemap.add(u);
          validUrls.push(u);
          allUrls.add(u);
        }
      }

      records.push(
        normalizeSitemapEntry({
          sitemapUrl,
          url: sitemapUrl,
          status: 'valid',
          fetchStatus: 'fetched',
          parseStatus: 'parsed',
          httpStatus: response.status,
          urlsCount: validUrls.length,
          urls: validUrls.slice(0, this.maxUrlsPerSitemap),
          isIndex: false,
          lastModified: parsed.lastModified,
        })
      );
    }
  }

  /**
   * Manually handles HTTP redirects up to maxRedirects, strictly verifying each destination before requesting.
   */
  private async fetchSitemapWithControlledRedirect(
    initialUrl: string,
    signal: AbortSignal
  ): Promise<{ response: Response; finalUrl: string }> {
    let currentUrl = initialUrl;
    let redirectsCount = 0;

    while (true) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (!this.isInScope(currentUrl)) {
        throw new Error(`Sitemap URL '${currentUrl}' is outside authorized origin scope '${this.authorizedOrigin}'`);
      }
      if (isSsrfTarget(currentUrl, this.authorizedOrigin)) {
        throw new Error(`Sitemap request to disallowed destination blocked: ${currentUrl}`);
      }

      const res = await fetch(currentUrl, {
        method: 'GET',
        signal,
        redirect: 'manual',
        headers: {
          Accept: 'application/xml, text/xml, */*;q=0.8',
        },
      });

      // Redirect handling (301, 302, 307, 308, etc.)
      if (res.status >= 300 && res.status < 400) {
        redirectsCount++;
        if (redirectsCount > this.maxRedirects) {
          throw new Error(`Sitemap redirect limit exceeded (${this.maxRedirects})`);
        }

        const location = res.headers.get('location');
        if (!location) {
          throw new Error(`HTTP ${res.status} redirect without Location header`);
        }

        const nextUrl = new URL(location, currentUrl).href;

        // CRITICAL SECURITY: Verify redirect destination BEFORE making the next request
        if (!this.isInScope(nextUrl)) {
          throw new Error(`Redirect to out-of-scope origin blocked: ${nextUrl}`);
        }
        if (isSsrfTarget(nextUrl, this.authorizedOrigin)) {
          throw new Error(`Redirect to unsafe private/metadata destination blocked: ${nextUrl}`);
        }

        currentUrl = nextUrl;
        continue;
      }

      return { response: res, finalUrl: currentUrl };
    }
  }

  /**
   * Reads response body with strict byte-size budget streaming.
   * Cancels underlying reader and aborts cleanly if byte limit is exceeded.
   */
  public async readBoundedResponseBody(
    response: Response,
    signal?: AbortSignal
  ): Promise<string> {
    return readBoundedResponseBody(response, this.maxByteSize, signal);
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
   * Safely parses XML sitemap string using DOMParser where available.
   * Rejects malformed XML, unclosed tags, and unapproved root elements.
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
    if (this.hasUnsafeXmlEntities(xml)) {
      return {
        status: 'parse_error',
        isIndex: false,
        urls: [],
        childSitemaps: [],
        errorMessage: 'Potentially malicious XML entity or DOCTYPE declaration rejected (XXE defense)',
      };
    }

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
          errorMessage: `Unrecognized XML root element '<${rootTag}>'; expected <urlset> or <sitemapindex>`,
        };
      } catch (err: any) {
        return {
          status: 'parse_error',
          isIndex: false,
          urls: [],
          childSitemaps: [],
          errorMessage: err.message || 'XML parsing exception',
        };
      }
    }

    // Fallback for headless environments without DOMParser: strictly enforce well-formedness
    return this.parseXmlStrictFallback(xml, sitemapUrl);
  }

  /**
   * Strict fallback parsing when DOMParser is absent; does not accept malformed XML.
   */
  public parseXmlStrictFallback(
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
    const trimmed = xml.trim();
    const isIndex = /<sitemapindex\b[^>]*>[\s\S]*<\/sitemapindex>/i.test(trimmed);
    const isUrlSet = /<urlset\b[^>]*>[\s\S]*<\/urlset>/i.test(trimmed);

    if (!isIndex && !isUrlSet) {
      return {
        status: 'parse_error',
        isIndex: false,
        urls: [],
        childSitemaps: [],
        errorMessage: 'Document is not a well-formed XML sitemap; missing matching <urlset> or <sitemapindex> tags',
      };
    }

    if (isIndex) {
      const childSitemaps: string[] = [];
      const sitemapBlocks = trimmed.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi);
      for (const match of sitemapBlocks) {
        const block = match[1];
        if (!block) continue;
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

    const urls: string[] = [];
    let lastModified: string | undefined;
    const urlBlocks = trimmed.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi);
    for (const match of urlBlocks) {
      const block = match[1];
      if (!block) continue;
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

/**
 * Reads response body with strict byte-size budget streaming.
 * Cancels underlying reader and aborts cleanly if byte limit is exceeded.
 */
export async function readBoundedResponseBody(
  response: Response,
  maxByteSize: number = 2 * 1024 * 1024,
  signal?: AbortSignal
): Promise<string> {
  const cl = response.headers.get('content-length');
  if (cl && parseInt(cl, 10) > maxByteSize) {
    throw new Error(`Sitemap Content-Length (${cl} bytes) exceeds maximum allowed size (${maxByteSize} bytes)`);
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let totalBytes = 0;
    const chunks: string[] = [];

    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          throw new DOMException('Aborted', 'AbortError');
        }

        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxByteSize) {
            await reader.cancel();
            throw new Error(`Sitemap response body stream exceeds maximum allowed size (${maxByteSize} bytes)`);
          }
          chunks.push(decoder.decode(value, { stream: true }));
        }
      }
      chunks.push(decoder.decode());
      return chunks.join('');
    } catch (err) {
      try {
        await reader.cancel();
      } catch {}
      throw err;
    }
  } else {
    const text = await response.text();
    const byteLen = new TextEncoder().encode(text).length;
    if (byteLen > maxByteSize) {
      throw new Error(`Sitemap response body exceeds maximum allowed size (${maxByteSize} bytes)`);
    }
    return text;
  }
}

