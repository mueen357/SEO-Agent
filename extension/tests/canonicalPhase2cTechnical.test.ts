/**
 * Phase 2C Comprehensive Technical SEO & Crawl Policy Hardening Test Suite.
 *
 * Verifies:
 * 1. Robots Crawl Gate:
 *    - Blocking robots policy (503, timeout, 401/403, 429, Disallow: /) issues 0 sitemap & 0 page GETs.
 *    - TECH_SITEMAP_AVAILABILITY records not_evaluated (no false warnings or false failures).
 * 2. Empty Disallow Semantics (RFC 9309 §2.2.2 non-destructive behavior).
 * 3. XML Qualified Names (QName) case-sensitivity and prefix-sensitivity in validateXmlWellFormedness.
 * 4. All 7 Newly Implemented Canonical Technical SEO Rules:
 *    - TECH_REDIRECT_CHAIN
 *    - TECH_REDIRECT_LOOP
 *    - TECH_REDIRECT_FAILURE
 *    - TECH_CANONICAL_TARGET_STATUS
 *    - TECH_CANONICAL_CONFLICT
 *    - TECH_CANONICAL_MULTIPLE
 *    - TECH_HTTPS_DOWNGRADE
 * 5. Rule Implementation Counts:
 *    - Exactly 40 canonical implemented rules (16 On-Page, 22 Technical, 2 Sitewide).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StandaloneRulesEngine, type StandaloneAuditContext } from '../standalone/audit/clientRules';
import { InBrowserCrawler } from '../standalone/crawler/inBrowserCrawler';
import { validateXmlWellFormedness } from '../standalone/crawler/sitemapParser';
import { CANONICAL_IMPLEMENTED_RULES } from '../standalone/audit/ruleMapping';
import type {
  StandaloneCrawlPage,
  StandaloneRobotsEvidence,
  StandaloneSitemapEvidence,
  RedirectHop,
} from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  overrides: Partial<StandaloneCrawlPage> = {}
): StandaloneCrawlPage {
  return {
    id,
    auditId: 'audit-phase2c-test',
    url,
    depth: 1,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    htmlSize: 2048,
    fetchedAt: Date.now(),
    fetchStatus: 'success',
    httpStatus: 200,
    responseTimeMs: 25,
    title: 'Valid Document Title for Search Ranking',
    metaDescription: 'A valid meta description between 70 and 160 characters designed for search engine snippets.',
    canonicalUrl: url,
    canonicalCount: 1,
    canonicalHrefs: [url],
    headings: { h1: ['Main Topic Heading'], h2: ['Section One'], h3: [] },
    htmlLang: 'en',
    links: [],
    images: [],
    isInSitemap: false,
    contentTypeCategory: 'HTML_DOCUMENT',
    redirectCount: 0,
    redirectChain: [],
    ...overrides,
  };
}

describe('Phase 2C: Canonical Technical SEO Rules & Crawl Policy Hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. RULE IMPLEMENTATION INVENTORY
  // =========================================================================
  describe('1. Rule Implementation Totals', () => {
    it('implements exactly 40 canonical rules (16 On-Page, 22 Technical, 2 Sitewide)', () => {
      expect(CANONICAL_IMPLEMENTED_RULES.size).toBe(40);

      const onPage = [
        'ONPAGE_TITLE_PRESENT',
        'ONPAGE_TITLE_LENGTH',
        'ONPAGE_TITLE_REPETITIVE',
        'ONPAGE_META_DESC_PRESENT',
        'ONPAGE_META_DESC_LENGTH',
        'ONPAGE_H1_PRESENCE',
        'ONPAGE_H1_MULTIPLE',
        'ONPAGE_H1_EMPTY',
        'ONPAGE_HEADING_HIERARCHY',
        'ONPAGE_CANONICAL_PRESENCE',
        'ONPAGE_CANONICAL_VALID',
        'ONPAGE_IMAGE_ALT_MISSING',
        'ONPAGE_IMAGE_ALT_EMPTY',
        'ONPAGE_INTERNAL_OUTLINKS',
        'ONPAGE_EMPTY_ANCHOR_TEXT',
        'ONPAGE_HTML_LANG',
      ];

      const technical = [
        'TECH_HTTP_4XX',
        'TECH_HTTP_5XX',
        'TECH_HTTP_429',
        'TECH_HTTP_UNSUPPORTED_CONTENT',
        'TECH_META_ROBOTS_DIRECTIVES',
        'TECH_X_ROBOTS_TAG',
        'TECH_HTTPS_USAGE',
        'TECH_ROBOTS_FETCH_STATUS',
        'TECH_ROBOTS_DISALLOW',
        'TECH_ROBOTS_SITEMAP_DECLARATION',
        'TECH_SITEMAP_AVAILABILITY',
        'TECH_SITEMAP_PARSE_ERROR',
        'TECH_SITEMAP_URL_STATUS',
        'TECH_SITEMAP_NOINDEX_CONFLICT',
        'TECH_SITEMAP_CANONICAL_CONFLICT',
        // Newly implemented in Phase 2C:
        'TECH_REDIRECT_CHAIN',
        'TECH_REDIRECT_LOOP',
        'TECH_REDIRECT_FAILURE',
        'TECH_CANONICAL_TARGET_STATUS',
        'TECH_CANONICAL_CONFLICT',
        'TECH_CANONICAL_MULTIPLE',
        'TECH_HTTPS_DOWNGRADE',
      ];

      const sitewide = [
        'SITE_TITLE_DUPLICATE',
        'SITE_NO_OBSERVED_INTERNAL_INLINKS',
      ];

      expect(onPage.length).toBe(16);
      expect(technical.length).toBe(22);
      expect(sitewide.length).toBe(2);
      expect(onPage.length + technical.length + sitewide.length).toBe(40);

      for (const r of onPage) {
        expect(CANONICAL_IMPLEMENTED_RULES.has(r)).toBe(true);
      }
      for (const r of technical) {
        expect(CANONICAL_IMPLEMENTED_RULES.has(r)).toBe(true);
      }
      for (const r of sitewide) {
        expect(CANONICAL_IMPLEMENTED_RULES.has(r)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. ROBOTS CRAWL GATE & SITEMAP PROBING
  // =========================================================================
  describe('2. Robots Crawl Gate & Probing Protection', () => {
    it('issues ZERO sitemap requests when robots.txt returns 503 Service Unavailable', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const crawler = new InBrowserCrawler('https://example.com/', {
        maxPages: 5,
        respectRobots: true,
      });

      // Simulate 503 robots response
      (crawler as any).robotsPolicyStatus = 'fetch_failed_unverified';
      (crawler as any).robotsEvidence = {
        robotsUrl: 'https://example.com/robots.txt',
        httpStatus: 503,
        fetchStatus: 'server_error',
        policyOutcome: 'fetch_failed_unverified',
      };
      (crawler as any).robotsFailureReason = 'HTTP 503';

      const sitemapEvidence = await crawler.discoverSitemaps();

      // Zero fetch calls must be made!
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(sitemapEvidence.sitemaps?.length).toBeGreaterThan(0);
      expect(sitemapEvidence.sitemaps?.[0]?.status).toBe('unauthorized');
      expect(sitemapEvidence.sitemaps?.[0]?.fetchStatus).toBe('not_fetched');
      expect(sitemapEvidence.hasErrors).toBe(true);
    });

    it('issues ZERO sitemap requests when robots.txt returns 401 Unauthorized or 403 Forbidden', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const crawler = new InBrowserCrawler('https://example.com/', {
        maxPages: 5,
        respectRobots: true,
      });

      (crawler as any).robotsPolicyStatus = 'forbidden';
      (crawler as any).robotsEvidence = {
        robotsUrl: 'https://example.com/robots.txt',
        httpStatus: 403,
        fetchStatus: 'forbidden',
        policyOutcome: 'forbidden',
      };

      const sitemapEvidence = await crawler.discoverSitemaps();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(sitemapEvidence.sitemaps?.[0]?.status).toBe('unauthorized');
      expect(sitemapEvidence.sitemaps?.[0]?.fetchStatus).toBe('not_fetched');
    });

    it('issues ZERO sitemap requests when robots.txt returns 429 Too Many Requests', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const crawler = new InBrowserCrawler('https://example.com/', {
        maxPages: 5,
        respectRobots: true,
      });

      (crawler as any).robotsEvidence = {
        robotsUrl: 'https://example.com/robots.txt',
        httpStatus: 429,
        fetchStatus: 'rate_limited',
        policyOutcome: 'fetch_failed_unverified',
      };

      const sitemapEvidence = await crawler.discoverSitemaps();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(sitemapEvidence.sitemaps?.[0]?.status).toBe('unauthorized');
    });

    it('issues ZERO sitemap requests when robots.txt disallows /sitemap.xml', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const crawler = new InBrowserCrawler('https://example.com/', {
        maxPages: 5,
        respectRobots: true,
      });

      // Valid 200 robots with Disallow: /sitemap.xml
      crawler.parseRobotsTxt(`User-agent: *\nDisallow: /sitemap.xml\n`);
      (crawler as any).robotsEvidence = {
        robotsUrl: 'https://example.com/robots.txt',
        httpStatus: 200,
        fetchStatus: 'found',
        policyOutcome: 'enforced',
        sitemapDeclarations: [],
      };

      const sitemapEvidence = await crawler.discoverSitemaps();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(sitemapEvidence.sitemaps?.[0]?.status).toBe('unauthorized');
      expect(sitemapEvidence.errors?.[0]).toContain('disallowed by robots.txt');
    });

    it('marks TECH_SITEMAP_AVAILABILITY as not_evaluated when robots policy is blocking (no false warning)', () => {
      const page = createMockPage('p1', 'https://example.com/');
      const result = StandaloneRulesEngine.evaluateAudit([page], 'test-audit', {
        robotsEvidence: {
          robotsUrl: 'https://example.com/robots.txt',
          httpStatus: 503,
          fetchStatus: 'server_error',
          policyOutcome: 'fetch_failed_unverified',
        },
        sitemapEvidence: {
          sitemaps: [
            {
              url: 'https://example.com/sitemap.xml',
              status: 'unauthorized',
              fetchStatus: 'not_fetched',
              errorMessage: 'Sitemap discovery blocked by robots.txt policy (HTTP 503)',
            },
          ],
          errors: ['Sitemap discovery blocked by robots.txt policy (HTTP 503)'],
          urls: [],
        },
      });

      const sitemapRecord = result.ledgerRecords.find(
        (r) => r.canonicalRuleId === 'TECH_SITEMAP_AVAILABILITY'
      );
      expect(sitemapRecord).toBeDefined();
      expect(sitemapRecord?.executionStatus).toBe('not_evaluated');
      expect(sitemapRecord?.result).toBe('unknown');

      // Crucial: Must NOT emit a false warning or failure blaming the site!
      const sitemapFinding = result.findings.find(
        (f) => f.ruleId === 'TECH_SITEMAP_AVAILABILITY'
      );
      expect(sitemapFinding).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. EMPTY DISALLOW SEMANTICS (RFC 9309 §2.2.2)
  // =========================================================================
  describe('3. Empty Disallow Semantics (RFC 9309 §2.2.2)', () => {
    it('does NOT erase earlier nonempty disallow rules in the group when empty Disallow: is encountered', () => {
      const crawler = new InBrowserCrawler('https://example.com/', {
        maxPages: 5,
        respectRobots: true,
      });

      // RFC 9309 §2.2.2:
      // "An empty value indicates that all access is allowed."
      // BUT it must NOT erase earlier specific disallow rules in that record.
      crawler.parseRobotsTxt(`User-agent: *\nDisallow: /admin\nDisallow:\n`);

      // /admin should remain disallowed!
      expect(crawler.isAllowedByRobots('https://example.com/admin/secret')).toBe(false);
      expect(crawler.isAllowedByRobots('/admin')).toBe(false);

      // Other paths remain allowed
      expect(crawler.isAllowedByRobots('https://example.com/public')).toBe(true);
      expect(crawler.isAllowedByRobots('/')).toBe(true);
    });

    it('correctly grants access when only an empty Disallow: exists', () => {
      const crawler = new InBrowserCrawler('https://example.com/', {
        maxPages: 5,
        respectRobots: true,
      });

      crawler.parseRobotsTxt(`User-agent: *\nDisallow:\n`);

      expect(crawler.isAllowedByRobots('https://example.com/anything')).toBe(true);
      expect(crawler.isAllowedByRobots('/path')).toBe(true);
    });
  });

  // =========================================================================
  // 4. XML QUALIFIED NAMES (QNAME) MATCHING
  // =========================================================================
  describe('4. XML Qualified Names (QName) Validation', () => {
    it('rejects mismatched XML namespace prefix closing tag (<a:urlset>...</b:urlset>)', () => {
      const xml = `<a:urlset xmlns:a="http://www.sitemaps.org" xmlns:b="http://www.sitemaps.org"><url><loc>https://example.com</loc></url></b:urlset>`;
      const res = validateXmlWellFormedness(xml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('Mismatched closing tag');
    });

    it('rejects case-mismatched closing tag (<urlSet>...</urlset>)', () => {
      const xml = `<urlSet><url><loc>https://example.com</loc></url></urlset>`;
      const res = validateXmlWellFormedness(xml);
      expect(res.wellFormed).toBe(false);
      expect(res.error).toContain('Mismatched closing tag');
    });

    it('accepts strictly matching XML QNames (<ns:urlset>...</ns:urlset>)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><ns:urlset xmlns:ns="http://www.sitemaps.org/schemas/sitemap/0.9"><ns:url><ns:loc>https://example.com</ns:loc></ns:url></ns:urlset>`;
      const res = validateXmlWellFormedness(xml);
      expect(res.wellFormed).toBe(true);
      expect(res.rootTag).toBe('ns:urlset');
    });
  });

  // =========================================================================
  // 5. TECH_REDIRECT_CHAIN
  // =========================================================================
  describe('5. TECH_REDIRECT_CHAIN', () => {
    it('passes when page has 0 or 1 redirect hop', () => {
      const page0 = createMockPage('p0', 'https://example.com/p0', {
        redirectCount: 0,
        redirectChain: [],
      });
      const res0 = StandaloneRulesEngine.evaluatePageDetailed(page0, 'audit-1');
      const rec0 = res0.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_CHAIN');
      expect(rec0?.executionStatus).toBe('executed_pass');

      const hop1: RedirectHop = {
        fromUrl: 'https://example.com/p1-old',
        toUrl: 'https://example.com/p1',
        httpStatus: 301,
      };
      const page1 = createMockPage('p1', 'https://example.com/p1', {
        redirectCount: 1,
        redirectChain: [hop1],
      });
      const res1 = StandaloneRulesEngine.evaluatePageDetailed(page1, 'audit-1');
      const rec1 = res1.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_CHAIN');
      expect(rec1?.executionStatus).toBe('executed_pass');
    });

    it('warns when page has 2 redirect hops', () => {
      const chain: RedirectHop[] = [
        { fromUrl: 'https://example.com/a', toUrl: 'https://example.com/b', httpStatus: 301 },
        { fromUrl: 'https://example.com/b', toUrl: 'https://example.com/c', httpStatus: 302 },
      ];
      const page = createMockPage('p-chain', 'https://example.com/c', {
        redirectCount: 2,
        redirectChain: chain,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_CHAIN');
      expect(rec?.executionStatus).toBe('executed_warning');

      const finding = res.findings.find((f) => f.ruleId === 'TECH_REDIRECT_CHAIN');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('warning');
      expect(finding?.severity).toBe('medium');
    });

    it('warns when page has 3 or more redirect hops (canonical multi-hop redirect chain warning)', () => {
      const chain: RedirectHop[] = [
        { fromUrl: 'https://example.com/1', toUrl: 'https://example.com/2', httpStatus: 301 },
        { fromUrl: 'https://example.com/2', toUrl: 'https://example.com/3', httpStatus: 301 },
        { fromUrl: 'https://example.com/3', toUrl: 'https://example.com/4', httpStatus: 302 },
      ];
      const page = createMockPage('p-long-chain', 'https://example.com/4', {
        redirectCount: 3,
        redirectChain: chain,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_CHAIN');
      expect(rec?.executionStatus).toBe('executed_warning');

      const finding = res.findings.find((f) => f.ruleId === 'TECH_REDIRECT_CHAIN');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('warning');
      expect(finding?.severity).toBe('medium');
    });
  });

  // =========================================================================
  // 6. TECH_REDIRECT_LOOP
  // =========================================================================
  describe('6. TECH_REDIRECT_LOOP', () => {
    it('passes when no redirect loop is detected', () => {
      const page = createMockPage('p-normal', 'https://example.com/normal', {
        redirectCount: 1,
        redirectLoopDetected: false,
        redirectChain: [
          { fromUrl: 'https://example.com/from', toUrl: 'https://example.com/normal', httpStatus: 301 },
        ],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_LOOP');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('fails when redirect loop is detected via redirectLoopDetected flag', () => {
      const page = createMockPage('p-loop', 'https://example.com/loop-a', {
        redirectLoopDetected: true,
        redirectCount: 4,
        redirectChain: [
          { fromUrl: 'https://example.com/loop-a', toUrl: 'https://example.com/loop-b', httpStatus: 302 },
          { fromUrl: 'https://example.com/loop-b', toUrl: 'https://example.com/loop-a', httpStatus: 302 },
        ],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_LOOP');
      expect(rec?.executionStatus).toBe('executed_fail');

      const finding = res.findings.find((f) => f.ruleId === 'TECH_REDIRECT_LOOP');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('fail');
      expect(finding?.severity).toBe('critical');
    });

    it('fails when redirect chain contains repeated normalized URLs', () => {
      const chain: RedirectHop[] = [
        { fromUrl: 'https://example.com/a', toUrl: 'https://example.com/b/', httpStatus: 301 },
        { fromUrl: 'https://example.com/b/', toUrl: 'https://example.com/a', httpStatus: 301 },
      ];
      const page = createMockPage('p-chain-loop', 'https://example.com/a', {
        redirectChain: chain,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_LOOP');
      expect(rec?.executionStatus).toBe('executed_fail');
    });
  });

  // =========================================================================
  // 7. TECH_REDIRECT_FAILURE
  // =========================================================================
  describe('7. TECH_REDIRECT_FAILURE', () => {
    it('returns not_applicable when no redirect occurred', () => {
      const page = createMockPage('p-direct', 'https://example.com/direct', {
        redirectCount: 0,
        redirectChain: [],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_FAILURE');
      expect(rec?.executionStatus).toBe('not_applicable');
    });

    it('passes when redirect successfully lands on 200 OK destination', () => {
      const page = createMockPage('p-ok', 'https://example.com/dest', {
        httpStatus: 200,
        fetchStatus: 'success',
        redirectCount: 1,
        redirectChain: [
          { fromUrl: 'https://example.com/start', toUrl: 'https://example.com/dest', httpStatus: 301 },
        ],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_FAILURE');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('fails when redirect destination is 404 broken', () => {
      const page = createMockPage('p-fail-404', 'https://example.com/dead-end', {
        httpStatus: 404,
        fetchStatus: 'http_error',
        redirectCount: 1,
        redirectChain: [
          { fromUrl: 'https://example.com/old', toUrl: 'https://example.com/dead-end', httpStatus: 301 },
        ],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_FAILURE');
      expect(rec?.executionStatus).toBe('executed_fail');

      const finding = res.findings.find((f) => f.ruleId === 'TECH_REDIRECT_FAILURE');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('fail');
    });

    it('fails when redirect was safety blocked (SSRF or disallowed protocol)', () => {
      const page = createMockPage('p-blocked', 'https://example.com/initial', {
        httpStatus: 0,
        fetchStatus: 'policy_blocked',
        redirectCount: 1,
        redirectChain: [
          {
            fromUrl: 'https://example.com/initial',
            toUrl: 'http://169.254.169.254/meta-data',
            httpStatus: 302,
            safetyBlocked: true,
            blockReason: 'Private/link-local IPv4 address blocked',
          },
        ],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_REDIRECT_FAILURE');
      expect(rec?.executionStatus).toBe('executed_fail');
    });
  });

  // =========================================================================
  // 8. TECH_CANONICAL_TARGET_STATUS
  // =========================================================================
  describe('8. TECH_CANONICAL_TARGET_STATUS', () => {
    it('returns not_applicable when page does not declare a canonical tag', () => {
      const page = createMockPage('p-no-can', 'https://example.com/no-can', {
        canonicalUrl: undefined,
        canonicalHrefs: [],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_CANONICAL_TARGET_STATUS');
      expect(rec?.executionStatus).toBe('not_applicable');
    });

    it('passes for valid self-referencing canonical on 200 page', () => {
      const page = createMockPage('p-self', 'https://example.com/page', {
        canonicalUrl: 'https://example.com/page',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_CANONICAL_TARGET_STATUS');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('passes when canonical points to a crawled page returning 200 OK', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/page-b',
      });
      const pageB = createMockPage('p-b', 'https://example.com/page-b', {
        httpStatus: 200,
        fetchStatus: 'success',
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageA, pageB], 'audit-1');
      const recA = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_TARGET_STATUS'
      );
      expect(recA?.executionStatus).toBe('executed_pass');
    });

    it('fails when canonical points to a crawled page returning 404 Not Found', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/page-dead',
      });
      const pageDead = createMockPage('p-dead', 'https://example.com/page-dead', {
        httpStatus: 404,
        fetchStatus: 'http_error',
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageA, pageDead], 'audit-1');
      const recA = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_TARGET_STATUS'
      );
      expect(recA?.executionStatus).toBe('executed_fail');

      const finding = res.findings.find(
        (f) => f.pageUrl === pageA.url && f.ruleId === 'TECH_CANONICAL_TARGET_STATUS'
      );
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('fail');
    });

    it('warns when canonical points to a crawled page that redirects (3xx)', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/page-redirect',
      });
      const pageRedirect = createMockPage('p-redir', 'https://example.com/page-redirect', {
        httpStatus: 301,
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageA, pageRedirect], 'audit-1');
      const recA = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_TARGET_STATUS'
      );
      expect(recA?.executionStatus).toBe('executed_warning');
    });

    it('records unknown when canonical target was NOT visited during crawl (never false pass)', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/external-target',
      });

      // Only pageA crawled; external-target is NOT in crawl set
      const res = StandaloneRulesEngine.evaluateAudit([pageA], 'audit-1');
      const recA = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_TARGET_STATUS'
      );
      expect(recA?.executionStatus).toBe('unknown');
      expect(recA?.result).toBe('unknown');
    });
  });

  // =========================================================================
  // 9. TECH_CANONICAL_CONFLICT
  // =========================================================================
  describe('9. TECH_CANONICAL_CONFLICT', () => {
    it('returns not_applicable when no canonical tag is declared', () => {
      const page = createMockPage('p-no-can', 'https://example.com/no-can', {
        canonicalUrl: undefined,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_CANONICAL_CONFLICT');
      expect(rec?.executionStatus).toBe('not_applicable');
    });

    it('passes when canonical target is indexable', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/page-b',
      });
      const pageB = createMockPage('p-b', 'https://example.com/page-b', {
        metaRobots: 'index, follow',
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageA, pageB], 'audit-1');
      const recA = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_CONFLICT'
      );
      expect(recA?.executionStatus).toBe('executed_pass');
    });

    it('fails when canonical points to a page specifying noindex', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/page-noindex',
      });
      const pageNoindex = createMockPage('p-noindex', 'https://example.com/page-noindex', {
        metaRobots: 'noindex, follow',
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageA, pageNoindex], 'audit-1');
      const recA = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_CONFLICT'
      );
      expect(recA?.executionStatus).toBe('executed_fail');

      const finding = res.findings.find(
        (f) => f.pageUrl === pageA.url && f.ruleId === 'TECH_CANONICAL_CONFLICT'
      );
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('fail');
      expect(finding?.severity).toBe('high');
    });

    it('fails when self-referencing canonical page specifies noindex', () => {
      const page = createMockPage('p-self-noindex', 'https://example.com/self-noindex', {
        canonicalUrl: 'https://example.com/self-noindex',
        metaRobots: 'noindex, follow',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_CANONICAL_CONFLICT');
      expect(rec?.executionStatus).toBe('executed_fail');
    });

    it('records unknown when canonical target was NOT visited (cannot verify robots indexability)', () => {
      const page = createMockPage('p-unvisited', 'https://example.com/unvisited', {
        canonicalUrl: 'https://example.com/other-unvisited',
      });
      const res = StandaloneRulesEngine.evaluateAudit([page], 'audit-1');
      const rec = res.ledgerRecords.find(
        (r) => r.targetUrl === page.url && r.canonicalRuleId === 'TECH_CANONICAL_CONFLICT'
      );
      expect(rec?.executionStatus).toBe('unknown');
    });
  });

  // =========================================================================
  // 10. TECH_CANONICAL_MULTIPLE
  // =========================================================================
  describe('10. TECH_CANONICAL_MULTIPLE', () => {
    it('passes when page declares 0 or 1 canonical tag', () => {
      const page0 = createMockPage('p-can-0', 'https://example.com/0', {
        canonicalUrl: undefined,
        canonicalCount: 0,
        canonicalHrefs: [],
      });
      const res0 = StandaloneRulesEngine.evaluatePageDetailed(page0, 'audit-1');
      const rec0 = res0.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_CANONICAL_MULTIPLE');
      expect(rec0?.executionStatus).toBe('executed_pass');

      const page1 = createMockPage('p-can-1', 'https://example.com/1', {
        canonicalUrl: 'https://example.com/1',
        canonicalCount: 1,
        canonicalHrefs: ['https://example.com/1'],
      });
      const res1 = StandaloneRulesEngine.evaluatePageDetailed(page1, 'audit-1');
      const rec1 = res1.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_CANONICAL_MULTIPLE');
      expect(rec1?.executionStatus).toBe('executed_pass');
    });

    it('warns when page declares multiple IDENTICAL canonical tags', () => {
      const page = createMockPage('p-can-dup', 'https://example.com/dup', {
        canonicalUrl: 'https://example.com/target',
        canonicalCount: 2,
        canonicalHrefs: ['https://example.com/target', 'https://example.com/target/'],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_CANONICAL_MULTIPLE');
      expect(rec?.executionStatus).toBe('executed_warning');

      const finding = res.findings.find((f) => f.ruleId === 'TECH_CANONICAL_MULTIPLE');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('warning');
      expect(finding?.severity).toBe('medium');
    });

    it('fails when page declares multiple CONFLICTING canonical tags', () => {
      const page = createMockPage('p-can-conflict', 'https://example.com/conflict', {
        canonicalUrl: 'https://example.com/target-a',
        canonicalCount: 2,
        canonicalHrefs: ['https://example.com/target-a', 'https://example.com/target-b'],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_CANONICAL_MULTIPLE');
      expect(rec?.executionStatus).toBe('executed_fail');

      const finding = res.findings.find((f) => f.ruleId === 'TECH_CANONICAL_MULTIPLE');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('fail');
      expect(finding?.severity).toBe('high');
    });
  });

  // =========================================================================
  // 11. TECH_HTTPS_DOWNGRADE
  // =========================================================================
  describe('11. TECH_HTTPS_DOWNGRADE', () => {
    it('returns not_applicable when requested page is plain HTTP', () => {
      const page = createMockPage('p-http', 'http://example.com/plain');
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTPS_DOWNGRADE');
      expect(rec?.executionStatus).toBe('not_applicable');
    });

    it('passes when HTTPS page stays on HTTPS without redirect', () => {
      const page = createMockPage('p-https', 'https://example.com/secure', {
        redirectCount: 0,
        redirectChain: [],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTPS_DOWNGRADE');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('passes when HTTPS page redirects to another HTTPS destination', () => {
      const page = createMockPage('p-https-redir', 'https://example.com/secure-final', {
        requestedUrl: 'https://example.com/secure-init',
        redirectCount: 1,
        redirectChain: [
          {
            fromUrl: 'https://example.com/secure-init',
            toUrl: 'https://example.com/secure-final',
            httpStatus: 301,
          },
        ],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTPS_DOWNGRADE');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('fails when HTTPS page redirects to an insecure HTTP destination', () => {
      const page = createMockPage('p-downgrade', 'http://example.com/insecure', {
        requestedUrl: 'https://example.com/secure-start',
        redirectCount: 1,
        redirectChain: [
          {
            fromUrl: 'https://example.com/secure-start',
            toUrl: 'http://example.com/insecure',
            httpStatus: 302,
          },
        ],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTPS_DOWNGRADE');
      expect(rec?.executionStatus).toBe('executed_fail');

      const finding = res.findings.find((f) => f.ruleId === 'TECH_HTTPS_DOWNGRADE');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('fail');
      expect(finding?.severity).toBe('high');
    });

    it('fails when an intermediate hop redirects to HTTP even if later redirects to HTTPS', () => {
      const page = createMockPage('p-hop-downgrade', 'https://example.com/end', {
        requestedUrl: 'https://example.com/start',
        redirectCount: 2,
        redirectChain: [
          {
            fromUrl: 'https://example.com/start',
            toUrl: 'http://example.com/mid-insecure',
            httpStatus: 301,
          },
          {
            fromUrl: 'http://example.com/mid-insecure',
            toUrl: 'https://example.com/end',
            httpStatus: 301,
          },
        ],
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTPS_DOWNGRADE');
      expect(rec?.executionStatus).toBe('executed_fail');
    });
  });
});
