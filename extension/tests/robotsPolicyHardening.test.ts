import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InBrowserCrawler } from '../standalone/crawler/inBrowserCrawler';
import { validateXmlWellFormedness } from '../standalone/crawler/sitemapParser';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';
import { StandaloneRulesEngine } from '../standalone/audit/clientRules';
import type { StandaloneAuditConfig } from '../standalone/types';

describe('Robots.txt Policy Hardening & RFC 9309 Enforcement', () => {
  const baseConfig: StandaloneAuditConfig = {
    maxPages: 5,
    maxDepth: 2,
    concurrency: 1,
    delayMs: 0,
    respectRobots: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    StandaloneAuditStorage.clearInMemoryForTesting();
  });

  describe('1. Conservative Robots Failure Policy', () => {
    it('blocks crawling on network error (HTTP status 0 / connection refused)', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.httpStatus).toBe(0);
      expect(evidence.fetchStatus).toBe('error');
      expect(evidence.policyOutcome).toBe('fetch_failed_unverified');

      expect(crawler.isAllowedByRobots('https://example.com/any-page')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('connection_refused');
    });

    it('blocks crawling on fetch timeout (AbortError)', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr);

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.policyOutcome).toBe('fetch_failed_unverified');
      expect(crawler.isAllowedByRobots('https://example.com/some/path')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('timeout');
    });

    it('blocks crawling on HTTP 503 Server Unavailable per RFC 9309 §2.3.1.4', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' })
      );

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.httpStatus).toBe(503);
      expect(crawler.isAllowedByRobots('https://example.com/')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('http_5xx');
    });

    it('blocks crawling on HTTP 429 Rate Limited', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Too Many Requests', { status: 429, statusText: 'Too Many Requests' })
      );

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.httpStatus).toBe(429);
      expect(evidence.fetchStatus).toBe('rate_limited');
      expect(crawler.isAllowedByRobots('https://example.com/page')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('http_429');
    });

    it('blocks crawling on HTTP 403 / 401 Access Denied per RFC 9309 §2.3.1.3', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Forbidden', { status: 403, statusText: 'Forbidden' })
      );

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.httpStatus).toBe(403);
      expect(evidence.fetchStatus).toBe('forbidden');
      expect(crawler.isAllowedByRobots('https://example.com/page')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('http_401_403');
    });

    it('permits crawling on HTTP 404 / 410 Absent robots.txt per RFC 9309 §2.3.1.2', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      );

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.httpStatus).toBe(404);
      expect(evidence.fetchStatus).toBe('not_found');
      expect(evidence.policyOutcome).toBe('not_present_permissive');
      expect(crawler.isAllowedByRobots('https://example.com/any-page')).toBe(true);
    });

    it('rejects oversized robots.txt exceeding 512KB budget', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      const hugeContent = 'User-agent: *\nDisallow: /test/\n' + ' '.repeat(513 * 1024);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(hugeContent, {
          status: 200,
          headers: { 'content-type': 'text/plain', 'content-length': String(hugeContent.length) },
        })
      );

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.fetchStatus).toBe('error');
      expect(evidence.parserStatus).toBe('oversized');
      expect(evidence.policyOutcome).toBe('fetch_failed_unverified');
      expect(crawler.isAllowedByRobots('https://example.com/page')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('oversized');
    });

    it('rejects binary Content-Type (image/png) returned for robots.txt', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.fetchStatus).toBe('error');
      expect(evidence.parserStatus).toBe('malformed');
      expect(crawler.isAllowedByRobots('https://example.com/page')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('malformed_content');
    });
  });

  describe('2. Controlled Redirects & SSRF Defenses', () => {
    it('blocks robots.txt redirect to cross-origin destination', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 301,
          headers: { location: 'https://attacker.com/robots.txt' },
        })
      );

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.fetchStatus).toBe('error');
      expect(evidence.policyOutcome).toBe('fetch_failed_unverified');
      expect(crawler.isAllowedByRobots('https://example.com/')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('redirect_blocked');
    });

    it('blocks robots.txt redirect to cloud metadata / private IPv4', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      );

      const evidence = await crawler.fetchRobotsTxt();
      expect(evidence.policyOutcome).toBe('fetch_failed_unverified');
      expect(crawler.isAllowedByRobots('https://example.com/')).toBe(false);
      expect(crawler.getRobotsFailureReason()).toBe('redirect_blocked');
    });
  });

  describe('3. RFC 9309 Parser Compliance', () => {
    it('supports consecutive User-agent lines in group header', () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      const robotsTxt = `
        User-agent: Googlebot
        User-agent: websiteauditbot
        Disallow: /bot-private/
        Allow: /bot-private/public-doc

        User-agent: *
        Disallow: /admin/
      `;
      crawler.parseRobotsTxt(robotsTxt);

      // websiteauditbot group should be matched, NOT the '*' group
      expect(crawler.isAllowedByRobots('/bot-private/secret')).toBe(false);
      expect(crawler.isAllowedByRobots('/bot-private/public-doc')).toBe(true);
      // /admin/ is disallowed in '*' group, but not in websiteauditbot group!
      expect(crawler.isAllowedByRobots('/admin/')).toBe(true);
    });

    it('does not erase earlier disallow directives on empty Disallow per RFC 9309 §2.2.2', () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      const robotsTxt = `
        User-agent: *
        Disallow: /admin/
        Disallow:
      `;
      crawler.parseRobotsTxt(robotsTxt);

      expect(crawler.isAllowedByRobots('/admin/test')).toBe(false);
      expect(crawler.isAllowedByRobots('/other')).toBe(true);
    });

    it('matches rules against URL query string per RFC 9309 §2.2.3', () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      const robotsTxt = `
        User-agent: *
        Disallow: /search?*
        Allow: /search?id=123
      `;
      crawler.parseRobotsTxt(robotsTxt);

      expect(crawler.isAllowedByRobots('https://example.com/search')).toBe(true);
      expect(crawler.isAllowedByRobots('https://example.com/search?q=test')).toBe(false);
      expect(crawler.isAllowedByRobots('https://example.com/search?id=123')).toBe(true);
    });

    it('enforces longest-match precedence and allow-wins tie break', () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      const robotsTxt = `
        User-agent: *
        Allow: /p
        Disallow: /page/special

        # Tie-breaker at length 12:
        Allow: /item/detail
        Disallow: /item/detail
      `;
      crawler.parseRobotsTxt(robotsTxt);

      // Longest match: /page/special (13 chars) beats /p (2 chars)
      expect(crawler.isAllowedByRobots('/page/special/sub')).toBe(false);
      expect(crawler.isAllowedByRobots('/page/other')).toBe(true);

      // Tie breaker: Allow beats Disallow when path lengths match exactly
      expect(crawler.isAllowedByRobots('/item/detail')).toBe(true);
    });

    it('normalizes percent-encoding hex and case-insensitivity', () => {
      const crawler = new InBrowserCrawler('https://example.com/', baseConfig);
      const robotsTxt = `
        User-agent: *
        Disallow: /data%2fa/
      `;
      crawler.parseRobotsTxt(robotsTxt);

      expect(crawler.isAllowedByRobots('/data%2Fa/file')).toBe(false);
      expect(crawler.isAllowedByRobots('/data%2fa/file')).toBe(false);
    });
  });

  describe('4. Genuine W3C XML 1.0 Well-Formedness Validation', () => {
    it('accepts well-formed XML sitemap with CDATA and standard entities', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <!-- Valid Sitemap with CDATA -->
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc><![CDATA[https://example.com/page?id=1&amp;view=card]]></loc>
            <lastmod>2026-10-19</lastmod>
            <changefreq>daily</changefreq>
          </url>
        </urlset>`;

      const res = validateXmlWellFormedness(xml);
      expect(res.wellFormed).toBe(true);
      expect(res.rootTag).toBe('urlset');
    });

    it('rejects XML with unclosed tags', () => {
      const malformedXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/unclosed
          </url>
        </urlset>`;

      const res = validateXmlWellFormedness(malformedXml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('Mismatched closing tag');
    });

    it('rejects XML with mismatched closing tag', () => {
      const mismatchedXml = `<urlset><url><loc>https://example.com</url></loc></urlset>`;
      const res = validateXmlWellFormedness(mismatchedXml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('Mismatched closing tag');
    });

    it('rejects XML with multiple root elements', () => {
      const multiRootXml = `<urlset><url><loc>https://example.com/1</loc></url></urlset><urlset><url><loc>https://example.com/2</loc></url></urlset>`;
      const res = validateXmlWellFormedness(multiRootXml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('Multiple root elements');
    });

    it('rejects XML with disallowed DTD / DOCTYPE injection', () => {
      const dtdXml = `<!DOCTYPE urlset SYSTEM "http://evil.com/evil.dtd"><urlset><url><loc>https://example.com</loc></url></urlset>`;
      const res = validateXmlWellFormedness(dtdXml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('Disallowed XML markup declaration');
    });

    it('rejects XML with unescaped bare ampersand in text content', () => {
      const badAmpXml = `<urlset><url><loc>https://example.com/page?a=1&b=2</loc></url></urlset>`;
      const res = validateXmlWellFormedness(badAmpXml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('Unescaped "&"');
    });

    it('rejects XML with duplicate attributes on a single tag', () => {
      const dupAttrXml = `<urlset xmlns="http://www.sitemaps.org" xmlns="http://duplicate.org"><url><loc>https://example.com</loc></url></urlset>`;
      const res = validateXmlWellFormedness(dupAttrXml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('Duplicate attribute');
    });

    it('rejects XML comments containing disallowed sequence "--"', () => {
      const badCommentXml = `<!-- bad--comment --><urlset><url><loc>https://example.com</loc></url></urlset>`;
      const res = validateXmlWellFormedness(badCommentXml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('disallowed sequence "--"');
    });
  });

  describe('5. Sitemap Availability & Declaration Semantics', () => {
    it('reports low-severity NO_SITEMAP_FOUND when conventional /sitemap.xml probe is 404', () => {
      const findings = StandaloneRulesEngine.evaluateAudit(
        [
          {
            id: 'page-1',
            auditId: 'test-1',
            url: 'https://example.com/',
            depth: 0,
            httpStatus: 200,
            fetchStatus: 'success',
            title: 'Home Page',
            headings: { h1: ['Welcome'], h2: [], h3: [] },
            links: [],
            images: [],
            headers: { 'content-type': 'text/html' },
            htmlSize: 1000,
            responseTimeMs: 50,
            fetchedAt: Date.now(),
            isInSitemap: false,
            contentTypeCategory: 'HTML_DOCUMENT',
          },
        ],
        'test-1',
        {
          sitemapEvidence: {
            sitemaps: [
              {
                url: 'https://example.com/sitemap.xml',
                status: 'fetch_error',
                fetchStatus: 'fetch_error',
                httpStatus: 404,
                isDeclared: false,
              },
            ],
            urls: [],
          },
        }
      );

      const sitemapFinding = findings.findings.find(
        (f) => f.ruleId === 'TECH_SITEMAP_AVAILABILITY'
      );
      expect(sitemapFinding).toBeDefined();
      expect(sitemapFinding?.status).toBe('warning');
      expect(sitemapFinding?.severity).toBe('low');
      expect(sitemapFinding?.title).toBe('No XML sitemaps discovered');
    });

    it('reports high-severity DECLARED_SITEMAP_BROKEN when robots-declared sitemap is 404', () => {
      const findings = StandaloneRulesEngine.evaluateAudit(
        [
          {
            id: 'page-1',
            auditId: 'test-2',
            url: 'https://example.com/',
            depth: 0,
            httpStatus: 200,
            fetchStatus: 'success',
            title: 'Home Page',
            headings: { h1: ['Welcome'], h2: [], h3: [] },
            links: [],
            images: [],
            headers: { 'content-type': 'text/html' },
            htmlSize: 1000,
            responseTimeMs: 50,
            fetchedAt: Date.now(),
            isInSitemap: false,
            contentTypeCategory: 'HTML_DOCUMENT',
          },
        ],
        'test-2',
        {
          robotsEvidence: {
            robotsUrl: 'https://example.com/robots.txt',
            httpStatus: 200,
            fetchStatus: 'found',
            parserStatus: 'valid',
            selectedUserAgent: '*',
            allowDirectives: [],
            disallowDirectives: [],
            sitemapDeclarations: ['https://example.com/custom-sitemap.xml'],
            policyOutcome: 'enforced',
          },
          sitemapEvidence: {
            sitemaps: [
              {
                url: 'https://example.com/custom-sitemap.xml',
                status: 'fetch_error',
                fetchStatus: 'fetch_error',
                httpStatus: 404,
                isDeclared: true,
              },
            ],
            urls: [],
          },
        }
      );

      const sitemapFinding = findings.findings.find(
        (f) => f.ruleId === 'TECH_SITEMAP_AVAILABILITY'
      );
      expect(sitemapFinding).toBeDefined();
      expect(sitemapFinding?.status).toBe('fail');
      expect(sitemapFinding?.severity).toBe('high');
      expect(sitemapFinding?.title).toBe('Declared XML sitemap broken or inaccessible');
    });

    it('reports high-severity SITEMAP_PRESENT_INVALID_XML when XML well-formedness fails', () => {
      const findings = StandaloneRulesEngine.evaluateAudit(
        [
          {
            id: 'page-1',
            auditId: 'test-3',
            url: 'https://example.com/',
            depth: 0,
            httpStatus: 200,
            fetchStatus: 'success',
            title: 'Home Page',
            headings: { h1: ['Welcome'], h2: [], h3: [] },
            links: [],
            images: [],
            headers: { 'content-type': 'text/html' },
            htmlSize: 1000,
            responseTimeMs: 50,
            fetchedAt: Date.now(),
            isInSitemap: false,
            contentTypeCategory: 'HTML_DOCUMENT',
          },
        ],
        'test-3',
        {
          sitemapEvidence: {
            sitemaps: [
              {
                url: 'https://example.com/sitemap.xml',
                status: 'parse_error',
                fetchStatus: 'fetched',
                parseStatus: 'parse_error',
                httpStatus: 200,
                isDeclared: false,
              },
            ],
            urls: [],
          },
        }
      );

      const sitemapFinding = findings.findings.find(
        (f) => f.ruleId === 'TECH_SITEMAP_AVAILABILITY'
      );
      expect(sitemapFinding).toBeDefined();
      expect(sitemapFinding?.status).toBe('fail');
      expect(sitemapFinding?.severity).toBe('high');
      expect(sitemapFinding?.title).toBe('XML sitemaps present but invalid XML');
    });

    it('records not_evaluated on TECH_ROBOTS_SITEMAP_DECLARATION when robots fetch was rate limited', () => {
      const findings = StandaloneRulesEngine.evaluateAudit(
        [
          {
            id: 'page-1',
            auditId: 'test-4',
            url: 'https://example.com/',
            depth: 0,
            httpStatus: 200,
            fetchStatus: 'success',
            title: 'Home Page',
            headings: { h1: ['Welcome'], h2: [], h3: [] },
            links: [],
            images: [],
            headers: { 'content-type': 'text/html' },
            htmlSize: 1000,
            responseTimeMs: 50,
            fetchedAt: Date.now(),
            isInSitemap: false,
            contentTypeCategory: 'HTML_DOCUMENT',
          },
        ],
        'test-4',
        {
          robotsEvidence: {
            robotsUrl: 'https://example.com/robots.txt',
            httpStatus: 429,
            fetchStatus: 'rate_limited',
            parserStatus: 'not_present',
            selectedUserAgent: '*',
            allowDirectives: [],
            disallowDirectives: [],
            sitemapDeclarations: [],
            policyOutcome: 'fetch_failed_unverified',
          },
        }
      );

      const robotsFinding = findings.findings.find(
        (f) => f.ruleId === 'TECH_ROBOTS_SITEMAP_DECLARATION'
      );
      expect(robotsFinding).toBeUndefined(); // no finding pushed when not_evaluated

      const ledgerRecord = findings.ledgerRecords.find(
        (r) => r.canonicalRuleId === 'TECH_ROBOTS_SITEMAP_DECLARATION'
      );
      expect(ledgerRecord).toBeDefined();
      expect(ledgerRecord?.executionStatus).toBe('not_evaluated');
      expect(ledgerRecord?.result).toBe('unknown');
    });
  });
});
