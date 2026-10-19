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
    const candidates: Array<{ url: string; isDeclared: boolean }> = [];
    const declaredUrlsSet = new Set<string>();

    // 1. Robots.txt declared sitemaps
    for (const sm of robotsSitemaps) {
      const trimmed = sm.trim();
      if (trimmed && !declaredUrlsSet.has(trimmed)) {
        declaredUrlsSet.add(trimmed);
        candidates.push({ url: trimmed, isDeclared: true });
      }
    }

    // 2. Standard conventional sitemap locations (only if authorizedOrigin is present)
    if (this.authorizedOrigin) {
      const defaultSitemap = `${this.authorizedOrigin}/sitemap.xml`;
      const defaultIndex = `${this.authorizedOrigin}/sitemap_index.xml`;
      if (!declaredUrlsSet.has(defaultSitemap)) {
        candidates.push({ url: defaultSitemap, isDeclared: false });
      }
      if (!declaredUrlsSet.has(defaultIndex)) {
        candidates.push({ url: defaultIndex, isDeclared: false });
      }
    }

    const visited = new Set<string>();
    const sitemapsDiscovered: StandaloneSitemapEntry[] = [];
    const allUrlsSet = new Set<string>();
    const errors: string[] = [];
    let indexCount = 0;

    for (const item of candidates) {
      if (visited.size >= this.maxSitemaps) break;
      await this.crawlSitemapRecursive(
        item.url,
        0,
        visited,
        sitemapsDiscovered,
        allUrlsSet,
        errors,
        item.isDeclared
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
    errors: string[],
    isDeclared: boolean = false
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
          isDeclared,
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
          isDeclared,
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
            isDeclared,
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
          isDeclared,
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
          isDeclared,
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
          isDeclared,
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
          isDeclared,
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
          errors,
          isDeclared
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
          isDeclared,
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
   * Safely parses XML sitemap string using DOMParser where available,
   * enforcing genuine XML well-formedness and rejecting malformed nested XML.
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

    // Always enforce genuine well-formedness verification
    const wf = validateXmlWellFormedness(xml);
    if (!wf.wellFormed) {
      return {
        status: 'parse_error',
        isIndex: false,
        urls: [],
        childSitemaps: [],
        errorMessage: wf.error || 'XML document is not well-formed',
      };
    }

    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const parserError =
          doc.getElementsByTagName('parsererror')[0] ||
          doc.getElementsByTagNameNS('*', 'parsererror')[0] ||
          doc.querySelector('parsererror') ||
          (doc.documentElement?.localName?.toLowerCase() === 'parsererror' ? doc.documentElement : null);

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

    // Strict fallback for environments without DOMParser
    return this.parseXmlStrictFallback(xml, sitemapUrl);
  }

  /**
   * Strict fallback parsing when DOMParser is absent; enforces genuine XML well-formedness.
   * Never fabricates a valid parse on malformed nested XML or broken tags.
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
    const wf = validateXmlWellFormedness(xml);
    if (!wf.wellFormed || !wf.rootTag) {
      return {
        status: 'parse_error',
        isIndex: false,
        urls: [],
        childSitemaps: [],
        errorMessage: wf.error || 'XML document is not well-formed',
      };
    }

    const isIndex = wf.rootTag === 'sitemapindex';
    const isUrlSet = wf.rootTag === 'urlset';

    if (!isIndex && !isUrlSet) {
      return {
        status: 'parse_error',
        isIndex: false,
        urls: [],
        childSitemaps: [],
        errorMessage: `Unrecognized XML root element '<${wf.rootTag}>'; expected <urlset> or <sitemapindex>`,
      };
    }

    if (isIndex) {
      const childSitemaps: string[] = [];
      const sitemapBlocks = xml.matchAll(/<([a-zA-Z_:][a-zA-Z0-9._:-]*:)?sitemap\b[^>]*>([\s\S]*?)<\/\1?sitemap>/gi);
      for (const match of sitemapBlocks) {
        const block = match[2];
        if (!block) continue;
        const locMatch = block.match(/<([a-zA-Z_:][a-zA-Z0-9._:-]*:)?loc\b[^>]*>([\s\S]*?)<\/\1?loc>/i);
        if (locMatch && locMatch[2]) {
          let loc = locMatch[2].trim();
          if (loc.startsWith('<![CDATA[') && loc.endsWith(']]>')) {
            loc = loc.slice(9, -3).trim();
          } else {
            loc = decodeXmlEntities(loc);
          }
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
    const urlBlocks = xml.matchAll(/<([a-zA-Z_:][a-zA-Z0-9._:-]*:)?url\b[^>]*>([\s\S]*?)<\/\1?url>/gi);
    for (const match of urlBlocks) {
      const block = match[2];
      if (!block) continue;
      const locMatch = block.match(/<([a-zA-Z_:][a-zA-Z0-9._:-]*:)?loc\b[^>]*>([\s\S]*?)<\/\1?loc>/i);
      if (locMatch && locMatch[2]) {
        let loc = locMatch[2].trim();
        if (loc.startsWith('<![CDATA[') && loc.endsWith(']]>')) {
          loc = loc.slice(9, -3).trim();
        } else {
          loc = decodeXmlEntities(loc);
        }
        if (loc) {
          try {
            urls.push(normalizeSitemapUrl(new URL(loc, sitemapUrl).href));
          } catch {}
        }
      }
      if (!lastModified) {
        const lmMatch = block.match(/<([a-zA-Z_:][a-zA-Z0-9._:-]*:)?lastmod\b[^>]*>([\s\S]*?)<\/\1?lastmod>/i);
        if (lmMatch && lmMatch[2]) {
          let lm = lmMatch[2].trim();
          if (lm.startsWith('<![CDATA[') && lm.endsWith(']]>')) {
            lm = lm.slice(9, -3).trim();
          } else {
            lm = decodeXmlEntities(lm);
          }
          lastModified = lm;
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
 * Decodes XML predefined entities and character references.
 */
export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export interface XmlWellFormednessCheck {
  wellFormed: boolean;
  rootTag?: string;
  error?: string;
}

/**
 * Validates genuine XML well-formedness per W3C XML 1.0.
 * Strictly verifies tag stacks, nesting, unclosed tags, entity references, and prohibits multiple roots.
 */
export function validateXmlWellFormedness(xml: string): XmlWellFormednessCheck {
  const trimmed = xml.trim();
  if (!trimmed) {
    return { wellFormed: false, error: 'Empty XML document' };
  }

  let i = 0;
  const len = trimmed.length;

  // Optional XML declaration <?xml ... ?>
  if (trimmed.startsWith('<?xml', 0)) {
    const declEnd = trimmed.indexOf('?>', 5);
    if (declEnd === -1) {
      return { wellFormed: false, error: 'Unterminated XML declaration' };
    }
    i = declEnd + 2;
  }

  const tagStack: Array<{ tag: string; original: string }> = [];
  let rootTag: string | undefined = undefined;
  let rootClosed = false;

  while (i < len) {
    const ch = trimmed[i];
    if (!ch) {
      break;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Comments: <!-- ... -->
    if (trimmed.startsWith('<!--', i)) {
      const commentEnd = trimmed.indexOf('-->', i + 4);
      if (commentEnd === -1) {
        return { wellFormed: false, error: 'Unclosed XML comment' };
      }
      const commentInner = trimmed.slice(i + 4, commentEnd);
      if (commentInner.includes('--')) {
        return { wellFormed: false, error: 'Malformed XML comment contains disallowed sequence "--"' };
      }
      i = commentEnd + 3;
      continue;
    }

    // CDATA: <![CDATA[ ... ]]>
    if (trimmed.startsWith('<![CDATA[', i)) {
      if (tagStack.length === 0) {
        return { wellFormed: false, error: 'CDATA section outside of root element' };
      }
      const cdataEnd = trimmed.indexOf(']]>', i + 9);
      if (cdataEnd === -1) {
        return { wellFormed: false, error: 'Unclosed CDATA section' };
      }
      i = cdataEnd + 3;
      continue;
    }

    // Disallowed DTD / DOCTYPE / ENTITY
    if (trimmed.startsWith('<!', i)) {
      return { wellFormed: false, error: 'Disallowed XML markup declaration / DOCTYPE' };
    }

    // Processing Instructions: <? ... ?>
    if (trimmed.startsWith('<?', i)) {
      const piEnd = trimmed.indexOf('?>', i + 2);
      if (piEnd === -1) {
        return { wellFormed: false, error: 'Unterminated processing instruction' };
      }
      i = piEnd + 2;
      continue;
    }

    // Closing Tag: </tag>
    if (trimmed.startsWith('</', i)) {
      const closeIdx = trimmed.indexOf('>', i + 2);
      if (closeIdx === -1) {
        return { wellFormed: false, error: 'Unclosed closing tag' };
      }
      const rawTagName = trimmed.slice(i + 2, closeIdx).trim();
      if (!/^[a-zA-Z_:][a-zA-Z0-9._:-]*$/.test(rawTagName)) {
        return { wellFormed: false, error: `Invalid closing tag name: </${rawTagName}>` };
      }
      const localName = rawTagName.split(':').pop()!.toLowerCase();
      if (tagStack.length === 0) {
        return { wellFormed: false, error: `Unexpected closing tag </${rawTagName}> with empty tag stack` };
      }
      const top = tagStack.pop()!;
      if (top.tag !== localName) {
        return {
          wellFormed: false,
          error: `Mismatched closing tag </${rawTagName}>; expected </${top.original}>`,
        };
      }
      if (tagStack.length === 0) {
        rootClosed = true;
      }
      i = closeIdx + 1;
      continue;
    }

    // Opening Tag or Self-Closing Tag: <tag ...> or <tag ... />
    if (trimmed[i] === '<') {
      if (rootClosed) {
        return { wellFormed: false, error: 'Multiple root elements; XML documents must have exactly one root element' };
      }
      const tagEnd = trimmed.indexOf('>', i + 1);
      if (tagEnd === -1) {
        return { wellFormed: false, error: 'Unclosed opening tag' };
      }
      const tagContent = trimmed.slice(i + 1, tagEnd).trim();
      if (tagContent.includes('<')) {
        return { wellFormed: false, error: 'Malformed tag syntax; nested "<" before closing ">"' };
      }

      const isSelfClosing = tagContent.endsWith('/');
      const cleanContent = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent;

      const nameMatch = cleanContent.match(/^([a-zA-Z_:][a-zA-Z0-9._:-]*)/);
      if (!nameMatch || !nameMatch[1]) {
        return { wellFormed: false, error: `Malformed tag name in <${tagContent}>` };
      }
      const rawTagName: string = nameMatch[1];
      const localName = rawTagName.split(':').pop()!.toLowerCase();

      // Validate attributes syntax
      const attrString = cleanContent.slice(rawTagName.length).trim();
      if (attrString) {
        const attrRegex = /([a-zA-Z_:][a-zA-Z0-9._:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        const seenAttrs = new Set<string>();

        while ((match = attrRegex.exec(attrString)) !== null) {
          const attrKey = match[1];
          if (!attrKey) {
            continue;
          }
          const attrName = attrKey.toLowerCase();
          if (seenAttrs.has(attrName)) {
            return { wellFormed: false, error: `Duplicate attribute "${attrKey}" in tag <${rawTagName}>` };
          }
          seenAttrs.add(attrName);
          lastIndex = attrRegex.lastIndex;
        }

        const remainder = attrString.slice(lastIndex).trim();
        if (remainder.length > 0) {
          return { wellFormed: false, error: `Malformed attribute syntax in tag <${rawTagName}>: "${remainder}"` };
        }
      }

      if (tagStack.length === 0) {
        if (rootTag !== undefined) {
          return { wellFormed: false, error: 'Multiple root elements found in XML document' };
        }
        rootTag = localName;
      }

      if (!isSelfClosing) {
        tagStack.push({ tag: localName, original: rawTagName });
      } else if (tagStack.length === 0) {
        rootClosed = true;
      }

      i = tagEnd + 1;
      continue;
    }

    // Text content outside root
    if (tagStack.length === 0) {
      if (rootClosed) {
        return { wellFormed: false, error: 'Disallowed characters after root element close' };
      }
      return { wellFormed: false, error: 'Text content found outside root element' };
    }

    // Entity check in text content
    if (trimmed[i] === '&') {
      const semiIdx = trimmed.indexOf(';', i + 1);
      const nextLt = trimmed.indexOf('<', i + 1);
      if (semiIdx === -1 || (nextLt !== -1 && nextLt < semiIdx)) {
        return { wellFormed: false, error: 'Unescaped "&" in XML text content; must use &amp; or entity reference' };
      }
      const ent = trimmed.slice(i + 1, semiIdx);
      const isValidEntity =
        ent === 'amp' ||
        ent === 'lt' ||
        ent === 'gt' ||
        ent === 'quot' ||
        ent === 'apos' ||
        /^#\d+$/.test(ent) ||
        /^#x[0-9a-fA-F]+$/.test(ent);

      if (!isValidEntity) {
        return { wellFormed: false, error: `Disallowed or undeclared entity reference "&${ent};"` };
      }
      i = semiIdx + 1;
      continue;
    }

    i++;
  }

  if (tagStack.length > 0) {
    const unclosed = tagStack[tagStack.length - 1];
    return { wellFormed: false, error: `Unclosed tag <${unclosed ? unclosed.original : 'unknown'}> at end of document` };
  }

  if (!rootTag) {
    return { wellFormed: false, error: 'No XML root element found' };
  }

  return { wellFormed: true, rootTag };
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

