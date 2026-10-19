/**
 * Phase 2D-A Comprehensive Site-Wide SEO & Internal Link Graph Test Suite.
 *
 * Verifies:
 * 1. Rule Implementation Totals:
 *    - Exactly 45 canonical rules implemented (16 On-Page, 22 Technical, 7 Site-Wide).
 * 2. Crawl Gate & Policy Hardening:
 *    - Redirect to robots-disallowed path (verified 0 network fetches to disallowed target).
 *    - Nested disallowed sitemap authorization gate (unauthorized, not_fetched, 0 network fetches).
 *    - Cross-origin / cross-port redirect blocking.
 * 3. Canonical Accuracy & Evidence Gating:
 *    - Canonical target that redirects (warning status).
 *    - Canonical target fetch failure (unknown status, never false PASS).
 *    - Canonical conflict evidence gating on fetch failure / non-HTML.
 *    - Multiple canonical boolean condition on non-HTML resources (not_applicable).
 *    - Multiple identical canonicals (warning) vs conflicting canonicals (fail).
 * 4. Site-Wide Canonical Rules:
 *    - SITE_META_DESCRIPTION_DUPLICATE: NFKC normalization, whitespace collapse, <15 char ignore, clustering.
 *    - SITE_H1_DUPLICATE: primary H1, NFKC normalization, <5 char ignore, clustering.
 *    - SITE_LOW_INTERNAL_INLINKS: sample <=5 N/A, sample >5 warning on 1 inlink, seed page exempt.
 *    - SITE_DEEP_CRAWL_PATH: depth >= 4 warning.
 *    - SITE_INTERNAL_LINK_TO_REDIRECT: flags links to 3xx URLs with destination resolution.
 * 5. StandaloneInternalLinkGraph:
 *    - Graph metrics, edge deduplication, inlink/outlink counting, and summary generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StandaloneRulesEngine, buildObservedUrlStatusMap, resolveObservedUrlStatus } from '../standalone/audit/clientRules';
import { StandaloneInternalLinkGraph, normalizeGraphUrl } from '../standalone/audit/internalLinkGraph';
import { InBrowserCrawler } from '../standalone/crawler/inBrowserCrawler';
import { StandaloneSitemapParser } from '../standalone/crawler/sitemapParser';
import { CANONICAL_IMPLEMENTED_RULES, CANONICAL_51_RULES } from '../standalone/audit/ruleMapping';
import type {
  StandaloneCrawlPage,
  StandaloneRobotsEvidence,
  StandaloneSitemapEvidence,
} from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  overrides: Partial<StandaloneCrawlPage> = {}
): StandaloneCrawlPage {
  return {
    id,
    auditId: 'audit-phase2d-test',
    url,
    depth: 1,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    htmlSize: 2048,
    fetchedAt: Date.now(),
    fetchStatus: 'success',
    httpStatus: 200,
    responseTimeMs: 25,
    title: 'Comprehensive Page Document Title',
    metaDescription: 'A valid descriptive meta description with over 70 characters for optimal search visibility.',
    headings: {
      h1: ['Unique Primary Heading On This Page'],
      h2: ['Secondary Heading'],
      h3: [],
    },
    canonicalUrl: url,
    metaRobots: 'index, follow',
    links: [],
    images: [],
    contentTypeCategory: 'HTML_DOCUMENT',
    ...overrides,
  };
}

describe('Phase 2D-A: Site-Wide SEO & Internal Link Graph', () => {
  // =========================================================================
  // 1. RULE IMPLEMENTATION INVENTORY
  // =========================================================================
  describe('1. Rule Implementation Totals', () => {
    it('implements exactly 45 canonical rules (16 On-Page, 22 Technical, 7 Site-Wide)', () => {
      expect(CANONICAL_IMPLEMENTED_RULES.size).toBe(45);

      const onPage = CANONICAL_51_RULES.on_page.filter((r) => CANONICAL_IMPLEMENTED_RULES.has(r));
      const technical = CANONICAL_51_RULES.technical.filter((r) => CANONICAL_IMPLEMENTED_RULES.has(r));
      const sitewide = CANONICAL_51_RULES.sitewide.filter((r) => CANONICAL_IMPLEMENTED_RULES.has(r));

      expect(onPage.length).toBe(16);
      expect(technical.length).toBe(22);
      expect(sitewide.length).toBe(7);
      expect(onPage.length + technical.length + sitewide.length).toBe(45);
    });

    it('verifies the 5 newly implemented Phase 2D-A Site-Wide rules are in CANONICAL_IMPLEMENTED_RULES', () => {
      const newlyImplemented = [
        'SITE_META_DESCRIPTION_DUPLICATE',
        'SITE_H1_DUPLICATE',
        'SITE_LOW_INTERNAL_INLINKS',
        'SITE_DEEP_CRAWL_PATH',
        'SITE_INTERNAL_LINK_TO_REDIRECT',
      ];
      for (const ruleId of newlyImplemented) {
        expect(CANONICAL_IMPLEMENTED_RULES.has(ruleId)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. CRAWL GATE & AUTHORIZATION HARDENING
  // =========================================================================
  describe('2. Crawl Gate & Authorization Hardening', () => {
    it('enforces robots policy before fetching redirect targets (zero network GET to disallowed URL)', async () => {
      const crawler = new InBrowserCrawler('https://example.com/', {
        maxPages: 5,
        respectRobots: true,
      });

      // Mock robots policy disallowing /admin/
      const disallowedUrl = 'https://example.com/admin/dashboard';
      (crawler as any).isAllowedByRobots = (url: string) => !url.includes('/admin/');

      const mockFetch = vi.fn();
      // First hop: 301 to /admin/dashboard
      mockFetch.mockResolvedValueOnce({
        status: 301,
        headers: new Headers({ location: disallowedUrl }),
        text: async () => '',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const result = await (crawler as any).fetchWithControlledRedirect('https://example.com/redirect-to-admin');
        expect(result.fetchStatus).toBe('robots_blocked');
        expect(result.errorCode).toBe('FETCH_ROBOTS_BLOCKED');
        // Fetch was called exactly ONCE for the initial URL, and NEVER for the disallowed redirect target!
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/redirect-to-admin',
          expect.anything()
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('blocks nested sitemap fetching when disallowed by robots authorization gate', async () => {
      const mockFetch = vi.fn();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const parser = new StandaloneSitemapParser({
          isAllowedByRobots: (url: string) => !url.includes('private-sitemap.xml'),
        });

        const entry = await (parser as any).fetchAndParseSitemap('https://example.com/private-sitemap.xml');
        expect(entry.status).toBe('unauthorized');
        expect(entry.fetchStatus).toBe('not_fetched');
        expect(entry.parseStatus).toBe('not_parsed');
        expect(entry.errorMessage).toContain('disallowed by robots.txt');
        // ZERO network fetch calls executed!
        expect(mockFetch).toHaveBeenCalledTimes(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('blocks cross-port and out-of-scope redirects during crawl', async () => {
      const crawler = new InBrowserCrawler('http://127.0.0.1:4321/', {
        maxPages: 5,
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 301,
        headers: new Headers({ location: 'http://127.0.0.1:8080/private' }),
        text: async () => '',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        const result = await (crawler as any).fetchWithControlledRedirect('http://127.0.0.1:4321/cross-port-redir');
        expect(result.fetchStatus).toBe('redirect_blocked');
        expect(result.redirectChain.length).toBe(1);
        expect(result.redirectChain[0]?.safetyBlocked).toBe(true);
        // Did not attempt to fetch port 8080
        expect(mockFetch).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 3. CANONICAL ACCURACY & EVIDENCE GATING
  // =========================================================================
  describe('3. Canonical Accuracy & Evidence Gating', () => {
    it('TECH_CANONICAL_TARGET_STATUS: warns when canonical points to a redirecting URL', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/page-redirect',
      });
      const pageRedirect = createMockPage('p-redir', 'https://example.com/page-redirect', {
        httpStatus: 301,
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageA, pageRedirect], 'audit-1');
      const rec = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_TARGET_STATUS'
      );
      expect(rec?.executionStatus).toBe('executed_warning');
      const finding = res.findings.find(
        (f) => f.pageUrl === pageA.url && f.ruleId === 'TECH_CANONICAL_TARGET_STATUS'
      );
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('warning');
    });

    it('TECH_CANONICAL_TARGET_STATUS: records unknown when target fetch failed', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/page-failed',
      });
      const pageFailed = createMockPage('p-failed', 'https://example.com/page-failed', {
        fetchStatus: 'failed',
        httpStatus: 0,
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageA, pageFailed], 'audit-1');
      const rec = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_TARGET_STATUS'
      );
      expect(rec?.executionStatus).toBe('unknown');
    });

    it('TECH_CANONICAL_CONFLICT: reports unknown when canonical target fetch failed rather than false pass', () => {
      const pageA = createMockPage('p-a', 'https://example.com/page-a', {
        canonicalUrl: 'https://example.com/target-broken',
      });
      const pageBroken = createMockPage('p-broken', 'https://example.com/target-broken', {
        fetchStatus: 'failed',
        httpStatus: 0,
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageA, pageBroken], 'audit-1');
      const rec = res.ledgerRecords.find(
        (r) => r.targetUrl === pageA.url && r.canonicalRuleId === 'TECH_CANONICAL_CONFLICT'
      );
      expect(rec?.executionStatus).toBe('unknown');
    });

    it('TECH_CANONICAL_MULTIPLE: returns not_applicable for non-HTML resources (PDF/JSON)', () => {
      const pdfPage = createMockPage('p-pdf', 'https://example.com/doc.pdf', {
        contentTypeCategory: 'NON_HTML_RESOURCE',
        headers: { 'content-type': 'application/pdf' },
      });

      const res = StandaloneRulesEngine.evaluateAudit([pdfPage], 'audit-1');
      const rec = res.ledgerRecords.find(
        (r) => r.targetUrl === pdfPage.url && r.canonicalRuleId === 'TECH_CANONICAL_MULTIPLE'
      );
      expect(rec?.executionStatus).toBe('not_applicable');
    });

    it('TECH_CANONICAL_MULTIPLE: warns on multiple identical canonicals and fails on multiple conflicting canonicals', () => {
      const pageIdentical = createMockPage('p-ident', 'https://example.com/ident', {
        canonicalUrl: 'https://example.com/canonical',
        canonicalCount: 2,
        canonicalHrefs: ['https://example.com/canonical', 'https://example.com/canonical/'],
      });
      const pageConflicting = createMockPage('p-conflict', 'https://example.com/conflict', {
        canonicalUrl: 'https://example.com/target-a',
        canonicalCount: 2,
        canonicalHrefs: ['https://example.com/target-a', 'https://example.com/target-b'],
      });

      const res = StandaloneRulesEngine.evaluateAudit([pageIdentical, pageConflicting], 'audit-1');

      const recIdent = res.ledgerRecords.find(
        (r) => r.targetUrl === pageIdentical.url && r.canonicalRuleId === 'TECH_CANONICAL_MULTIPLE'
      );
      expect(recIdent?.executionStatus).toBe('executed_warning');

      const recConflict = res.ledgerRecords.find(
        (r) => r.targetUrl === pageConflicting.url && r.canonicalRuleId === 'TECH_CANONICAL_MULTIPLE'
      );
      expect(recConflict?.executionStatus).toBe('executed_fail');
    });
  });

  // =========================================================================
  // 4. SITE_META_DESCRIPTION_DUPLICATE
  // =========================================================================
  describe('4. SITE_META_DESCRIPTION_DUPLICATE', () => {
    it('returns not_applicable when fewer than 2 usable pages exist', () => {
      const p1 = createMockPage('p1', 'https://example.com/');
      const res = StandaloneRulesEngine.evaluateAudit([p1], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_META_DESCRIPTION_DUPLICATE');
      expect(rec?.executionStatus).toBe('not_applicable');
    });

    it('passes when all pages have distinct meta descriptions', () => {
      const p1 = createMockPage('p1', 'https://example.com/', {
        metaDescription: 'First comprehensive page description for search engines.',
      });
      const p2 = createMockPage('p2', 'https://example.com/about', {
        metaDescription: 'Second completely unique description regarding about us.',
      });

      const res = StandaloneRulesEngine.evaluateAudit([p1, p2], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_META_DESCRIPTION_DUPLICATE');
      expect(rec?.executionStatus).toBe('executed_pass');
      expect(res.findings.filter((f) => f.ruleId === 'SITE_META_DESCRIPTION_DUPLICATE')).toHaveLength(0);
    });

    it('clusters duplicates using NFKC normalization, whitespace collapse, and case insensitivity', () => {
      const p1 = createMockPage('p1', 'https://example.com/page-1', {
        metaDescription: '  Leading Whitespace AND UpperCase Meta Description Designed For Auditing.  ',
      });
      const p2 = createMockPage('p2', 'https://example.com/page-2', {
        metaDescription: 'leading whitespace and uppercase meta description designed for auditing.',
      });

      const res = StandaloneRulesEngine.evaluateAudit([p1, p2], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_META_DESCRIPTION_DUPLICATE');
      expect(rec?.executionStatus).toBe('executed_warning');

      const finding = res.findings.find((f) => f.ruleId === 'SITE_META_DESCRIPTION_DUPLICATE');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('warning');
      expect(finding?.evidence?.duplicate_count).toBe(2);
      expect(finding?.evidence?.duplicate_urls).toContain('https://example.com/page-1');
      expect(finding?.evidence?.duplicate_urls).toContain('https://example.com/page-2');
    });

    it('ignores descriptions shorter than 15 characters to prevent false duplicate flags', () => {
      const p1 = createMockPage('p1', 'https://example.com/p1', { metaDescription: 'Short' });
      const p2 = createMockPage('p2', 'https://example.com/p2', { metaDescription: 'Short' });

      const res = StandaloneRulesEngine.evaluateAudit([p1, p2], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_META_DESCRIPTION_DUPLICATE');
      expect(rec?.executionStatus).toBe('executed_pass');
    });
  });

  // =========================================================================
  // 5. SITE_H1_DUPLICATE
  // =========================================================================
  describe('5. SITE_H1_DUPLICATE', () => {
    it('returns not_applicable when fewer than 2 usable pages exist', () => {
      const p1 = createMockPage('p1', 'https://example.com/');
      const res = StandaloneRulesEngine.evaluateAudit([p1], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_H1_DUPLICATE');
      expect(rec?.executionStatus).toBe('not_applicable');
    });

    it('passes when all pages have distinct primary H1 headings', () => {
      const p1 = createMockPage('p1', 'https://example.com/', { headings: { h1: ['Homepage Header'], h2: [], h3: [] } });
      const p2 = createMockPage('p2', 'https://example.com/features', { headings: { h1: ['Platform Features'], h2: [], h3: [] } });

      const res = StandaloneRulesEngine.evaluateAudit([p1, p2], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_H1_DUPLICATE');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('clusters duplicate H1 headings across multiple pages and emits warning finding', () => {
      const p1 = createMockPage('p1', 'https://example.com/services/seo', {
        headings: { h1: ['Enterprise SEO Services'], h2: [], h3: [] },
      });
      const p2 = createMockPage('p2', 'https://example.com/agency/seo', {
        headings: { h1: [' enterprise seo services '], h2: [], h3: [] },
      });

      const res = StandaloneRulesEngine.evaluateAudit([p1, p2], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_H1_DUPLICATE');
      expect(rec?.executionStatus).toBe('executed_warning');

      const finding = res.findings.find((f) => f.ruleId === 'SITE_H1_DUPLICATE');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('medium');
      expect(finding?.evidence?.duplicate_count).toBe(2);
    });

    it('ignores H1 headings shorter than 5 characters', () => {
      const p1 = createMockPage('p1', 'https://example.com/p1', { headings: { h1: ['Home'], h2: [], h3: [] } });
      const p2 = createMockPage('p2', 'https://example.com/p2', { headings: { h1: ['Home'], h2: [], h3: [] } });

      const res = StandaloneRulesEngine.evaluateAudit([p1, p2], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_H1_DUPLICATE');
      expect(rec?.executionStatus).toBe('executed_pass');
    });
  });

  // =========================================================================
  // 6. SITE_LOW_INTERNAL_INLINKS
  // =========================================================================
  describe('6. SITE_LOW_INTERNAL_INLINKS', () => {
    it('returns not_applicable when crawl sample has 5 or fewer internal pages', () => {
      const pages = [
        createMockPage('p1', 'https://example.com/'),
        createMockPage('p2', 'https://example.com/p2'),
        createMockPage('p3', 'https://example.com/p3'),
        createMockPage('p4', 'https://example.com/p4'),
        createMockPage('p5', 'https://example.com/p5'),
      ];

      const res = StandaloneRulesEngine.evaluateAudit(pages, 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_LOW_INTERNAL_INLINKS');
      expect(rec?.executionStatus).toBe('not_applicable');
    });

    it('warns when an internal page has only 1 inbound link in a sample > 5 pages (seed excluded)', () => {
      // 6 pages total: seed (p1) links to p2, p3, p4, p5, p6
      // p2 has only 1 inlink (from p1). p3 has 2 inlinks (from p1, p2).
      const p1 = createMockPage('p1', 'https://example.com/', {
        links: [
          'https://example.com/p2',
          'https://example.com/p3',
          'https://example.com/p4',
          'https://example.com/p5',
          'https://example.com/p6',
        ],
      });
      const p2 = createMockPage('p2', 'https://example.com/p2', {
        links: ['https://example.com/p3'],
      });
      const p3 = createMockPage('p3', 'https://example.com/p3', { links: ['https://example.com/p4'] });
      const p4 = createMockPage('p4', 'https://example.com/p4', { links: ['https://example.com/p5'] });
      const p5 = createMockPage('p5', 'https://example.com/p5', { links: ['https://example.com/p6'] });
      const p6 = createMockPage('p6', 'https://example.com/p6', { links: ['https://example.com/'] });

      const pages = [p1, p2, p3, p4, p5, p6];
      const res = StandaloneRulesEngine.evaluateAudit(pages, 'audit-1');

      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_LOW_INTERNAL_INLINKS');
      expect(rec?.executionStatus).toBe('executed_warning');

      const finding = res.findings.find((f) => f.ruleId === 'SITE_LOW_INTERNAL_INLINKS');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('warning');
      expect(finding?.evidence?.low_inlink_count).toBeGreaterThanOrEqual(1);
      // Seed page is NEVER in low inlink list
      expect(finding?.evidence?.all_urls).not.toContain('https://example.com/');
    });
  });

  // =========================================================================
  // 7. SITE_DEEP_CRAWL_PATH
  // =========================================================================
  describe('7. SITE_DEEP_CRAWL_PATH', () => {
    it('passes when all pages are reachable within 3 crawl depth levels', () => {
      const p0 = createMockPage('p0', 'https://example.com/', { depth: 0 });
      const p1 = createMockPage('p1', 'https://example.com/level1', { depth: 1 });
      const p2 = createMockPage('p2', 'https://example.com/level2', { depth: 2 });
      const p3 = createMockPage('p3', 'https://example.com/level3', { depth: 3 });

      const res = StandaloneRulesEngine.evaluateAudit([p0, p1, p2, p3], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_DEEP_CRAWL_PATH');
      expect(rec?.executionStatus).toBe('executed_pass');
      expect(res.findings.filter((f) => f.ruleId === 'SITE_DEEP_CRAWL_PATH')).toHaveLength(0);
    });

    it('warns when one or more pages have crawl depth >= 4', () => {
      const p0 = createMockPage('p0', 'https://example.com/', { depth: 0 });
      const p1 = createMockPage('p1', 'https://example.com/p1', { depth: 1 });
      const p4 = createMockPage('p4', 'https://example.com/deep-page', { depth: 4 });

      const res = StandaloneRulesEngine.evaluateAudit([p0, p1, p4], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_DEEP_CRAWL_PATH');
      expect(rec?.executionStatus).toBe('executed_warning');

      const finding = res.findings.find((f) => f.ruleId === 'SITE_DEEP_CRAWL_PATH');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('warning');
      expect(finding?.evidence?.deep_count).toBe(1);
      expect(finding?.evidence?.all_urls).toContain('https://example.com/deep-page');
    });
  });

  // =========================================================================
  // 8. SITE_INTERNAL_LINK_TO_REDIRECT
  // =========================================================================
  describe('8. SITE_INTERNAL_LINK_TO_REDIRECT', () => {
    it('passes when all internal links point directly to 200 OK pages', () => {
      const p1 = createMockPage('p1', 'https://example.com/', {
        links: ['https://example.com/about'],
      });
      const p2 = createMockPage('p2', 'https://example.com/about', {
        httpStatus: 200,
        links: ['https://example.com/'],
      });

      const res = StandaloneRulesEngine.evaluateAudit([p1, p2], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_INTERNAL_LINK_TO_REDIRECT');
      expect(rec?.executionStatus).toBe('executed_pass');
      expect(res.findings.filter((f) => f.ruleId === 'SITE_INTERNAL_LINK_TO_REDIRECT')).toHaveLength(0);
    });

    it('warns when an internal link points to a 3xx redirecting destination', () => {
      const p1 = createMockPage('p1', 'https://example.com/', {
        links: ['https://example.com/old-url'],
      });
      const pRedir = createMockPage('p-redir', 'https://example.com/old-url', {
        httpStatus: 301,
        finalUrl: 'https://example.com/new-url',
        redirectChain: [
          { fromUrl: 'https://example.com/old-url', toUrl: 'https://example.com/new-url', httpStatus: 301 },
        ],
      });
      const pNew = createMockPage('p-new', 'https://example.com/new-url', {
        httpStatus: 200,
      });

      const res = StandaloneRulesEngine.evaluateAudit([p1, pRedir, pNew], 'audit-1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_INTERNAL_LINK_TO_REDIRECT');
      expect(rec?.executionStatus).toBe('executed_warning');

      const finding = res.findings.find((f) => f.ruleId === 'SITE_INTERNAL_LINK_TO_REDIRECT');
      expect(finding).toBeDefined();
      expect(finding?.status).toBe('warning');
      expect(finding?.evidence?.redirect_links_count).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 9. STANDALONE INTERNAL LINK GRAPH ENGINE
  // =========================================================================
  describe('9. StandaloneInternalLinkGraph Engine', () => {
    it('deduplicates multiple links from the same source page to the same destination', () => {
      const p1 = createMockPage('p1', 'https://example.com/', {
        links: [
          'https://example.com/about',
          'https://example.com/about',
          'https://example.com/about#team',
        ],
      });
      const p2 = createMockPage('p2', 'https://example.com/about', {
        links: ['https://example.com/'],
      });

      const graph = new StandaloneInternalLinkGraph([p1, p2], [], 'https://example.com/');
      const m1 = graph.getMetrics('https://example.com/');
      const m2 = graph.getMetrics('https://example.com/about');

      // Unique outbound destinations from p1 to p2 is 1 (despite 3 raw links)
      expect(m1.outboundUniquePages).toBe(1);
      // Inbound unique pages to p2 is 1
      expect(m2.inboundUniquePages).toBe(1);
    });

    it('generates complete graph summary with node counts, depth, and orphan tracking', () => {
      const p0 = createMockPage('p0', 'https://example.com/', {
        depth: 0,
        links: ['https://example.com/page-a'],
      });
      const pA = createMockPage('pA', 'https://example.com/page-a', {
        depth: 1,
        links: ['https://example.com/page-b'],
      });
      const pB = createMockPage('pB', 'https://example.com/page-b', {
        depth: 2,
        links: [],
      });
      const pOrphan = createMockPage('pOrphan', 'https://example.com/orphan', {
        depth: 1,
        links: [],
      });

      const graph = new StandaloneInternalLinkGraph([p0, pA, pB, pOrphan], [], 'https://example.com/');
      const summary = graph.getSummary('audit-graph-1');

      expect(summary.totalNodes).toBe(4);
      expect(summary.maxCrawlDepth).toBe(2);
      expect(summary.orphanCount).toBe(1);
      expect(summary.orphanPages).toContain('https://example.com/orphan');
      expect(summary.nodes).toHaveLength(4);
    });
  });
});
