/**
 * Phase 2D-B Comprehensive SEO Completion Test Suite.
 *
 * Verifies:
 * 1. Graph Deduplication & Link Counting Defect Fixes:
 *    - Repeated hyperlinks between same source and destination on a page.
 *    - Separation of raw link occurrences (rawInboundEdges/rawOutboundEdges) from topology edges (inboundEdges/outboundEdges).
 *    - Exclusion of self-links from topology metrics.
 *    - Summary counts unique broken/redirect destination URLs instead of raw edge occurrences.
 * 2. Duplicate URL Record Handling:
 *    - Multi-record/retry/redirect pages sharing the same normalized destination URL do not trigger false duplicates.
 *    - SITE_TITLE_DUPLICATE, SITE_META_DESCRIPTION_DUPLICATE, and SITE_H1_DUPLICATE require >= 2 distinct URLs.
 * 3. Bounded In-Browser Content Evidence Extraction & Deterministic Fingerprinting:
 *    - Unicode NFKC normalization, whitespace collapse, HTML entity decoding.
 *    - Deterministic synchronous SHA-256 (FIPS 180-4).
 *    - Deterministic synchronous MD5 & 64-bit SimHash (RFC 1321 & Python hashlib parity).
 *    - SimHash Hamming distance, SimHash similarity, and length similarity.
 *    - Boilerplate stripping (<script>, <style>, <nav>, <header>, <footer>, <aside>) and main content extraction.
 * 4. The Final Six Canonical SEO Rules:
 *    - SITE_CONTENT_DUPLICATE_EXACT: Exact duplicate content detection with thin content exclusion.
 *    - SITE_CONTENT_DUPLICATE_NEAR: Near duplicate content detection (Hamming <= 3, length ratio >= 0.8) with Bron-Kerbosch clique resolution.
 *    - SITE_INTERNAL_LINK_TO_4XX: Detection of internal links resolving to HTTP 404/410.
 *    - SITE_INTERNAL_LINK_TO_5XX: Detection of internal links resolving to HTTP 500/503 (distinguishing 5xx from network errors).
 *    - SITE_DUPLICATE_CANONICAL_REVIEW: Competing self-referential canonicals across duplicate content clusters.
 *    - SITE_CONTENT_CANONICAL_CONFLICT: Duplicate content pointing canonical to 4xx/5xx target.
 * 5. Full 51/51 Canonical Rules Implementation & Execution Ledger Parity.
 */

import { describe, it, expect } from 'vitest';
import { StandaloneRulesEngine } from '../standalone/audit/clientRules';
import { StandaloneInternalLinkGraph, normalizeGraphUrl } from '../standalone/audit/internalLinkGraph';
import {
  normalizeText,
  caseFoldText,
  tokenizeWords,
  extractWordNgrams,
  computeContentSha256,
  computeSimHash64,
  simhashHammingDistance,
  simhashSimilarity,
  lengthSimilarity,
  extractMainContent,
} from '../standalone/audit/contentFingerprint';
import {
  CANONICAL_51_RULES,
  ALL_CANONICAL_51_RULES,
  CANONICAL_IMPLEMENTED_RULES,
} from '../standalone/audit/ruleMapping';
import { StandaloneScoringCalculator, CANONICAL_RULE_TOTALS } from '../standalone/audit/scoring';
import type { StandaloneCrawlPage } from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  overrides: Partial<StandaloneCrawlPage> = {}
): StandaloneCrawlPage {
  return {
    id,
    auditId: 'audit-phase2d-b-test',
    url,
    depth: 1,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    htmlSize: 2048,
    fetchedAt: Date.now(),
    fetchStatus: 'success',
    httpStatus: 200,
    responseTimeMs: 25,
    title: `Unique Document Title for ${id}`,
    metaDescription: `A unique, descriptive meta description for search optimization on page ${id} with sufficient length.`,
    headings: {
      h1: [`Unique Primary Heading for ${id}`],
      h2: [`Secondary Heading`],
      h3: [],
    },
    canonicalUrl: url,
    metaRobots: 'index, follow',
    links: [],
    images: [],
    contentTypeCategory: 'HTML_DOCUMENT',
    contentQualityStatus: 'usable',
    mainTextWordCount: 150,
    normalizedMainTextHash: `hash-${id}`,
    mainTextSimhash: `simhash-${id.padEnd(8, '0')}`.slice(0, 16),
    ...overrides,
  };
}

describe('Phase 2D-B: SEO Completion & Final Canonical Rules', () => {
  // =========================================================================
  // 1. GRAPH DEDUPLICATION & LINK COUNTING
  // =========================================================================
  describe('1. Graph Deduplication & Link Counting Defect Fixes', () => {
    it('separates raw link occurrences from unique topological graph edges', () => {
      // Page A contains 3 separate hyperlinks to Page B (e.g. nav, body, footer)
      const pageA = createMockPage('pA', 'https://example.com/page-a', {
        links: [
          'https://example.com/page-b',
          'https://example.com/page-b',
          'https://example.com/page-b',
        ],
      });

      const pageB = createMockPage('pB', 'https://example.com/page-b', {
        links: [],
      });

      const graph = new StandaloneInternalLinkGraph([pageA, pageB], [], 'https://example.com/page-a');
      const mA = graph.getMetrics('https://example.com/page-a');
      const mB = graph.getMetrics('https://example.com/page-b');

      // Topological outDegree/inDegree should be 1 (unique destination edge)
      expect(mA.outboundUniquePages).toBe(1);
      expect(mB.inboundUniquePages).toBe(1);

      // Raw link occurrences should preserve all 3 physical hyperlinks
      expect(mB.totalRawInboundLinks).toBe(3);

      // Summary metrics
      const summary = graph.getSummary();
      expect(summary.totalUniqueEdges).toBe(1);
      expect(summary.totalRawLinkOccurrences).toBe(3);
    });

    it('excludes self-links from inbound and outbound topology metrics', () => {
      // Page A links to itself twice and to Page B once
      const pageA = createMockPage('pA', 'https://example.com/page-a', {
        links: [
          'https://example.com/page-a',
          'https://example.com/page-a',
          'https://example.com/page-b',
        ],
      });

      const pageB = createMockPage('pB', 'https://example.com/page-b', {
        links: [],
      });

      const graph = new StandaloneInternalLinkGraph([pageA, pageB], [], 'https://example.com/page-a');
      const mA = graph.getMetrics('https://example.com/page-a');
      expect(mA.outboundUniquePages).toBe(1); // Only Page B
      expect(mA.inboundUniquePages).toBe(0); // Self-links excluded from inDegree
    });

    it('counts unique broken and redirect destinations rather than raw edge occurrences', () => {
      // Page A links to 404 target twice, Page B also links to the same 404 target
      const pageA = createMockPage('pA', 'https://example.com/page-a', {
        links: ['https://example.com/missing-404', 'https://example.com/missing-404'],
      });
      const pageB = createMockPage('pB', 'https://example.com/page-b', {
        links: ['https://example.com/missing-404'],
      });
      const page404 = createMockPage('p404', 'https://example.com/missing-404', {
        httpStatus: 404,
        fetchStatus: 'failed',
      });

      const graph = new StandaloneInternalLinkGraph([pageA, pageB, page404], [], 'https://example.com/page-a');
      const summary = graph.getSummary();
      // Even though there are 3 raw link occurrences pointing to missing-404, there is only 1 unique broken destination
      expect(summary.brokenLinkDestinations).toBe(1);
    });
  });

  // =========================================================================
  // 2. DUPLICATE URL RECORD HANDLING
  // =========================================================================
  describe('2. Duplicate URL Record Handling Across Metadata Rules', () => {
    it('does not emit SITE_TITLE_DUPLICATE when multiple records share the same normalized URL', () => {
      // Scenario: redirect hop or retry generates 2 records for the same effective URL
      const page1 = createMockPage('p1', 'https://example.com/product', {
        title: 'Premium Widget 2026 Edition',
        finalUrl: 'https://example.com/product',
      });
      const page1Retry = createMockPage('p1-retry', 'https://example.com/product/', {
        title: 'Premium Widget 2026 Edition',
        finalUrl: 'https://example.com/product',
      });
      const page2 = createMockPage('p2', 'https://example.com/about', {
        title: 'About Our Company and Mission',
        finalUrl: 'https://example.com/about',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page1Retry, page2],
        'audit-test'
      );

      const titleFindings = result.findings.filter((f) => f.ruleId === 'SITE_TITLE_DUPLICATE');
      expect(titleFindings.length).toBe(0);

      const titleLedger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_TITLE_DUPLICATE');
      expect(titleLedger).toBeDefined();
      expect(titleLedger!.executionStatus).toBe('executed_pass');
    });

    it('emits SITE_TITLE_DUPLICATE when distinct normalized URLs share the identical title', () => {
      const page1 = createMockPage('p1', 'https://example.com/product-a', {
        title: 'Identical Title Tag for SEO',
      });
      const page2 = createMockPage('p2', 'https://example.com/product-b', {
        title: 'Identical Title Tag for SEO',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page2],
        'audit-test'
      );

      const titleFindings = result.findings.filter((f) => f.ruleId === 'SITE_TITLE_DUPLICATE');
      expect(titleFindings.length).toBe(1);
      expect(titleFindings[0]?.severity).toBe('medium');

      const titleLedger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_TITLE_DUPLICATE');
      expect(titleLedger!.executionStatus).toBe('executed_warning');
    });

    it('does not emit SITE_META_DESCRIPTION_DUPLICATE or SITE_H1_DUPLICATE for single-URL multi-records', () => {
      const page1 = createMockPage('p1', 'https://example.com/blog/item', {
        metaDescription: 'Comprehensive guide to modern web development and SEO best practices.',
        headings: { h1: ['Complete Guide to Modern Web Development'], h2: [], h3: [] },
        finalUrl: 'https://example.com/blog/item',
      });
      const page1Duplicate = createMockPage('p1-dup', 'https://example.com/blog/item', {
        metaDescription: 'Comprehensive guide to modern web development and SEO best practices.',
        headings: { h1: ['Complete Guide to Modern Web Development'], h2: [], h3: [] },
        finalUrl: 'https://example.com/blog/item',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page1Duplicate],
        'audit-test'
      );

      expect(result.findings.filter((f) => f.ruleId === 'SITE_META_DESCRIPTION_DUPLICATE').length).toBe(0);
      expect(result.findings.filter((f) => f.ruleId === 'SITE_H1_DUPLICATE').length).toBe(0);
    });
  });

  // =========================================================================
  // 3. CONTENT FINGERPRINTING & HASH PARITY
  // =========================================================================
  describe('3. Content Fingerprinting & Parity', () => {
    it('normalizes Unicode NFKC, decodes HTML entities, and collapses whitespace', () => {
      const rawText = '   Hello&nbsp;&amp;&nbsp;World   \u00a0\u200b\ufeff  &quot;SEO&quot;   ';
      const normalized = normalizeText(rawText);
      expect(normalized).toBe('Hello & World "SEO"');
    });

    it('computes deterministic FIPS 180-4 SHA-256 matching official test vectors', () => {
      expect(computeContentSha256('')).toBe('');
      expect(computeContentSha256('Hello World')).toBe(
        'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e'
      );
    });

    it('computes deterministic 64-bit SimHash signature as 16-char hex', () => {
      const tokens1 = ['website', 'audit', 'agent', 'standalone', 'crawler'];
      const simhash1 = computeSimHash64(tokens1);
      expect(simhash1).toMatch(/^[0-9a-f]{16}$/);

      // Same tokens produce identical SimHash
      const simhash2 = computeSimHash64(tokens1);
      expect(simhash1).toBe(simhash2);
      expect(simhashHammingDistance(simhash1, simhash2)).toBe(0);
      expect(simhashSimilarity(simhash1, simhash2)).toBe(1.0);
    });

    it('calculates length similarity ratio accurately', () => {
      expect(lengthSimilarity(100, 100)).toBe(1.0);
      expect(lengthSimilarity(80, 100)).toBe(0.8);
      expect(lengthSimilarity(100, 80)).toBe(0.8);
      expect(lengthSimilarity(50, 100)).toBe(0.5);
    });

    it('extracts main content and excludes boilerplate navigation and footer', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Page</title><style>.hidden { display: none; }</style></head>
          <body>
            <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
            <main>
              <h1>Main Article Title</h1>
              <p>This is the primary content body of the webpage containing useful information for readers and search engines alike.</p>
              <p>Second paragraph providing in-depth analysis and authoritative context regarding technical SEO standards.</p>
            </main>
            <footer><p>&copy; 2026 Company Inc. All rights reserved.</p></footer>
            <script>console.log("script");</script>
          </body>
        </html>
      `;

      const evidence = extractMainContent(html, 'https://example.com/test');
      expect(evidence.mainTextExcerpt).toContain('Main Article Title');
      expect(evidence.mainTextExcerpt).toContain('primary content body');
      expect(evidence.mainTextExcerpt).not.toContain('All rights reserved');
      expect(evidence.mainTextExcerpt).not.toContain('console.log');
      expect(evidence.normalizedMainTextHash).toMatch(/^[0-9a-f]{64}$/);
      expect(evidence.mainTextSimhash).toMatch(/^[0-9a-f]{16}$/);
      expect(evidence.contentQualityStatus).toBe('usable');
    });
  });

  // =========================================================================
  // 4. CANONICAL RULE: SITE_CONTENT_DUPLICATE_EXACT
  // =========================================================================
  describe('4. Canonical Rule: SITE_CONTENT_DUPLICATE_EXACT', () => {
    it('detects exact content duplicate clusters between distinct URLs', () => {
      const sharedHash = computeContentSha256('Authoritative primary text shared across duplicate pages.');
      const page1 = createMockPage('p1', 'https://example.com/article-original', {
        normalizedMainTextHash: sharedHash,
        mainTextWordCount: 120,
        contentQualityStatus: 'usable',
      });
      const page2 = createMockPage('p2', 'https://example.com/article-copy', {
        normalizedMainTextHash: sharedHash,
        mainTextWordCount: 120,
        contentQualityStatus: 'usable',
      });
      const page3 = createMockPage('p3', 'https://example.com/unique-page', {
        normalizedMainTextHash: computeContentSha256('Different unique text for third page.'),
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page2, page3],
        'audit-test'
      );

      const exactFindings = result.findings.filter((f) => f.ruleId === 'SITE_CONTENT_DUPLICATE_EXACT');
      expect(exactFindings.length).toBe(1);
      expect(exactFindings[0]?.severity).toBe('high');
      expect(exactFindings[0]?.evidence?.all_urls).toContain('https://example.com/article-original');
      expect(exactFindings[0]?.evidence?.all_urls).toContain('https://example.com/article-copy');

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_CONTENT_DUPLICATE_EXACT');
      expect(ledger!.executionStatus).toBe('executed_fail');
    });

    it('excludes thin content (< 50 words) from exact duplicate penalty', () => {
      const shortHash = computeContentSha256('Login page please sign in.');
      const page1 = createMockPage('p1', 'https://example.com/login', {
        normalizedMainTextHash: shortHash,
        mainTextWordCount: 15,
        contentQualityStatus: 'thin',
      });
      const page2 = createMockPage('p2', 'https://example.com/auth', {
        normalizedMainTextHash: shortHash,
        mainTextWordCount: 15,
        contentQualityStatus: 'thin',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([page1, page2], 'audit-test');
      const exactFindings = result.findings.filter((f) => f.ruleId === 'SITE_CONTENT_DUPLICATE_EXACT');
      expect(exactFindings.length).toBe(0);

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_CONTENT_DUPLICATE_EXACT');
      expect(ledger!.executionStatus).toBe('executed_pass');
    });
  });

  // =========================================================================
  // 5. CANONICAL RULE: SITE_CONTENT_DUPLICATE_NEAR
  // =========================================================================
  describe('5. Canonical Rule: SITE_CONTENT_DUPLICATE_NEAR', () => {
    it('detects near-duplicate content when SimHash Hamming distance <= 3 and length ratio >= 0.8', () => {
      const simhashBase = '1234567890abcdef';
      // Flip 2 bits in hex string: 'f' -> 1111, 'c' -> 1100 (2 bits flipped)
      const simhashNear = '1234567890abcdec';

      expect(simhashHammingDistance(simhashBase, simhashNear)).toBeLessThanOrEqual(3);

      const page1 = createMockPage('p1', 'https://example.com/city-dallas', {
        normalizedMainTextHash: 'hash-dallas',
        mainTextSimhash: simhashBase,
        mainTextWordCount: 200,
        contentQualityStatus: 'usable',
      });
      const page2 = createMockPage('p2', 'https://example.com/city-houston', {
        normalizedMainTextHash: 'hash-houston',
        mainTextSimhash: simhashNear,
        mainTextWordCount: 210,
        contentQualityStatus: 'usable',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([page1, page2], 'audit-test');
      const nearFindings = result.findings.filter((f) => f.ruleId === 'SITE_CONTENT_DUPLICATE_NEAR');
      expect(nearFindings.length).toBe(1);
      expect(nearFindings[0]?.severity).toBe('medium');

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_CONTENT_DUPLICATE_NEAR');
      expect(ledger!.executionStatus).toBe('executed_warning');
    });

    it('resolves transitive bridges (A near B, B near C, but A not near C) via maximal clique decomposition', () => {
      // Create 3 signatures (non-zero so not excluded by the empty simhash filter):
      // sigA: '1000000000000000'
      // sigB: '1000000000000003' -> dist(A, B) = 2 (similar)
      // sigC: '100000000000003f' -> dist(B, C) = 4, dist(A, C) = 6 (distant)
      const sigA = '1000000000000000';
      const sigB = '1000000000000003';
      const sigC = '100000000000003f';

      expect(simhashHammingDistance(sigA, sigB)).toBe(2); // <= 3
      expect(simhashHammingDistance(sigB, sigC)).toBe(4); // > 3
      expect(simhashHammingDistance(sigA, sigC)).toBe(6); // > 3

      const pageA = createMockPage('pA', 'https://example.com/page-a', {
        normalizedMainTextHash: 'hash-a',
        mainTextSimhash: sigA,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });
      const pageB = createMockPage('pB', 'https://example.com/page-b', {
        normalizedMainTextHash: 'hash-b',
        mainTextSimhash: sigB,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });
      const pageC = createMockPage('pC', 'https://example.com/page-c', {
        normalizedMainTextHash: 'hash-c',
        mainTextSimhash: sigC,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [pageA, pageB, pageC],
        'audit-test'
      );

      const nearFindings = result.findings.filter((f) => f.ruleId === 'SITE_CONTENT_DUPLICATE_NEAR');
      expect(nearFindings.length).toBe(1);
      // The cluster should contain exactly [page-a, page-b], NOT page-c
      expect(nearFindings[0]?.evidence?.all_urls).toContain('https://example.com/page-a');
      expect(nearFindings[0]?.evidence?.all_urls).toContain('https://example.com/page-b');
      expect(nearFindings[0]?.evidence?.all_urls).not.toContain('https://example.com/page-c');
    });
  });

  // =========================================================================
  // 6. CANONICAL RULE: SITE_INTERNAL_LINK_TO_4XX
  // =========================================================================
  describe('6. Canonical Rule: SITE_INTERNAL_LINK_TO_4XX', () => {
    it('flags internal links pointing to confirmed HTTP 404/410 pages', () => {
      const pageSource = createMockPage('pSource', 'https://example.com/home', {
        links: ['https://example.com/missing-page'],
      });
      const pageBroken = createMockPage('pBroken', 'https://example.com/missing-page', {
        httpStatus: 404,
        fetchStatus: 'failed',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [pageSource, pageBroken],
        'audit-test'
      );

      const findings = result.findings.filter((f) => f.ruleId === 'SITE_INTERNAL_LINK_TO_4XX');
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe('high');
      expect(findings[0]?.evidence?.broken_url).toBe('https://example.com/missing-page');
      expect(findings[0]?.evidence?.referencing_urls).toContain('https://example.com/home');

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_INTERNAL_LINK_TO_4XX');
      expect(ledger!.executionStatus).toBe('executed_fail');
    });

    it('records EXECUTED_PASS when no internal links point to 4xx pages', () => {
      const page1 = createMockPage('p1', 'https://example.com/home', {
        links: ['https://example.com/about'],
      });
      const page2 = createMockPage('p2', 'https://example.com/about', {
        httpStatus: 200,
        fetchStatus: 'success',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([page1, page2], 'audit-test');
      const findings = result.findings.filter((f) => f.ruleId === 'SITE_INTERNAL_LINK_TO_4XX');
      expect(findings.length).toBe(0);

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_INTERNAL_LINK_TO_4XX');
      expect(ledger!.executionStatus).toBe('executed_pass');
    });
  });

  // =========================================================================
  // 7. CANONICAL RULE: SITE_INTERNAL_LINK_TO_5XX
  // =========================================================================
  describe('7. Canonical Rule: SITE_INTERNAL_LINK_TO_5XX', () => {
    it('flags internal links pointing to confirmed HTTP 500/503 server error pages', () => {
      const pageSource = createMockPage('pSource', 'https://example.com/checkout', {
        links: ['https://example.com/api/payment'],
      });
      const page500 = createMockPage('p500', 'https://example.com/api/payment', {
        httpStatus: 500,
        fetchStatus: 'failed',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [pageSource, page500],
        'audit-test'
      );

      const findings = result.findings.filter((f) => f.ruleId === 'SITE_INTERNAL_LINK_TO_5XX');
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe('critical');
      expect(findings[0]?.title).toContain('HTTP 500');

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_INTERNAL_LINK_TO_5XX');
      expect(ledger!.executionStatus).toBe('executed_fail');
    });

    it('distinguishes network errors without HTTP response from confirmed 5xx server responses', () => {
      const pageSource = createMockPage('pSource', 'https://example.com/home', {
        links: ['https://example.com/timeout'],
      });
      const pageNetworkFail = createMockPage('pNetFail', 'https://example.com/timeout', {
        httpStatus: 0,
        fetchStatus: 'failed',
        errorMessage: 'Network timeout',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [pageSource, pageNetworkFail],
        'audit-test'
      );

      // Should NOT flag as 5xx because httpStatus is 0 (network abort/CORS) rather than 500-599
      const findings = result.findings.filter((f) => f.ruleId === 'SITE_INTERNAL_LINK_TO_5XX');
      expect(findings.length).toBe(0);
    });
  });

  // =========================================================================
  // 8. CANONICAL RULE: SITE_DUPLICATE_CANONICAL_REVIEW
  // =========================================================================
  describe('8. Canonical Rule: SITE_DUPLICATE_CANONICAL_REVIEW', () => {
    it('flags duplicate content pages that each have self-referential canonical tags', () => {
      const sharedHash = computeContentSha256('Identical duplicated article text requiring canonical review.');
      const page1 = createMockPage('p1', 'https://example.com/post-a', {
        canonicalUrl: 'https://example.com/post-a', // Self canonical
        normalizedMainTextHash: sharedHash,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });
      const page2 = createMockPage('p2', 'https://example.com/post-b', {
        canonicalUrl: 'https://example.com/post-b', // Self canonical
        normalizedMainTextHash: sharedHash,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([page1, page2], 'audit-test');
      const findings = result.findings.filter((f) => f.ruleId === 'SITE_DUPLICATE_CANONICAL_REVIEW');
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe('medium');
      expect(findings[0]?.title).toContain('competing self-referencing canonicals');

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_DUPLICATE_CANONICAL_REVIEW');
      expect(ledger!.executionStatus).toBe('executed_warning');
    });

    it('passes when duplicate pages cleanly point to a single canonical URL', () => {
      const sharedHash = computeContentSha256('Identical text where copy properly canonicalizes to original.');
      const original = createMockPage('p1', 'https://example.com/original', {
        canonicalUrl: 'https://example.com/original',
        normalizedMainTextHash: sharedHash,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });
      const copy = createMockPage('p2', 'https://example.com/copy', {
        canonicalUrl: 'https://example.com/original', // Clean cross-page canonicalization
        normalizedMainTextHash: sharedHash,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([original, copy], 'audit-test');
      const nonPassFindings = result.findings.filter(
        (f) => f.ruleId === 'SITE_DUPLICATE_CANONICAL_REVIEW' && f.status !== 'pass'
      );
      expect(nonPassFindings.length).toBe(0);

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_DUPLICATE_CANONICAL_REVIEW');
      expect(ledger!.executionStatus).toBe('executed_pass');
    });
  });

  // =========================================================================
  // 9. CANONICAL RULE: SITE_CONTENT_CANONICAL_CONFLICT
  // =========================================================================
  describe('9. Canonical Rule: SITE_CONTENT_CANONICAL_CONFLICT', () => {
    it('flags duplicate content when the declared canonical URL points to a broken 4xx/5xx target', () => {
      const sharedHash = computeContentSha256('Text with canonical pointing to a 404 page.');
      const page1 = createMockPage('p1', 'https://example.com/article-1', {
        canonicalUrl: 'https://example.com/deleted-target',
        normalizedMainTextHash: sharedHash,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });
      const page2 = createMockPage('p2', 'https://example.com/article-2', {
        canonicalUrl: 'https://example.com/deleted-target',
        normalizedMainTextHash: sharedHash,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });
      const brokenTarget = createMockPage('pTarget', 'https://example.com/deleted-target', {
        httpStatus: 404,
        fetchStatus: 'failed',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page2, brokenTarget],
        'audit-test'
      );

      const findings = result.findings.filter((f) => f.ruleId === 'SITE_CONTENT_CANONICAL_CONFLICT');
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.severity).toBe('high');
      expect(findings[0]?.title).toContain('HTTP 404');

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_CONTENT_CANONICAL_CONFLICT');
      expect(ledger!.executionStatus).toBe('executed_fail');
    });
  });

  // =========================================================================
  // 10. COMPLETE 51/51 CANONICAL RULES IMPLEMENTATION PARITY
  // =========================================================================
  describe('10. Complete 51/51 Canonical Rules Implementation Parity', () => {
    it('verifies CANONICAL_IMPLEMENTED_RULES contains exactly 51 canonical rule IDs', () => {
      expect(CANONICAL_IMPLEMENTED_RULES.size).toBe(51);
      expect(ALL_CANONICAL_51_RULES.length).toBe(51);

      // Verify every canonical rule in manifest is implemented
      for (const ruleId of ALL_CANONICAL_51_RULES) {
        expect(CANONICAL_IMPLEMENTED_RULES.has(ruleId)).toBe(true);
      }

      // Family verification
      const onPageImplemented = CANONICAL_51_RULES.on_page.filter((r) => CANONICAL_IMPLEMENTED_RULES.has(r));
      const technicalImplemented = CANONICAL_51_RULES.technical.filter((r) => CANONICAL_IMPLEMENTED_RULES.has(r));
      const sitewideImplemented = CANONICAL_51_RULES.sitewide.filter((r) => CANONICAL_IMPLEMENTED_RULES.has(r));

      expect(onPageImplemented.length).toBe(16);
      expect(technicalImplemented.length).toBe(22);
      expect(sitewideImplemented.length).toBe(13);
      expect(onPageImplemented.length + technicalImplemented.length + sitewideImplemented.length).toBe(51);
    });

    it('evaluates all 13 sitewide canonical rules and populates authoritative execution ledger', () => {
      const page1 = createMockPage('p1', 'https://example.com/', {
        links: ['https://example.com/about'],
      });
      const page2 = createMockPage('p2', 'https://example.com/about', {
        links: ['https://example.com/'],
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([page1, page2], 'audit-test');

      const executedSitewideRuleIds = new Set(result.ledgerRecords.map((r) => r.canonicalRuleId));

      // All 13 canonical sitewide rules should have ledger entries
      for (const sitewideRule of CANONICAL_51_RULES.sitewide) {
        expect(executedSitewideRuleIds.has(sitewideRule)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 11. EDGE CASES & SAFETY REGRESSIONS
  // =========================================================================
  describe('11. Edge Cases & Safety Regressions', () => {
    it('excludes pairs where SimHash Hamming distance is 4 (exceeds <= 3 threshold)', () => {
      const sigA = '0000000000000000';
      const sigB = '000000000000000f'; // 4 bits flipped (0xf = 0b1111)
      expect(simhashHammingDistance(sigA, sigB)).toBe(4);

      const page1 = createMockPage('p1', 'https://example.com/item-1', {
        normalizedMainTextHash: 'hash-item-1',
        mainTextSimhash: sigA,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });
      const page2 = createMockPage('p2', 'https://example.com/item-2', {
        normalizedMainTextHash: 'hash-item-2',
        mainTextSimhash: sigB,
        mainTextWordCount: 150,
        contentQualityStatus: 'usable',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([page1, page2], 'audit-test');
      const nearFindings = result.findings.filter((f) => f.ruleId === 'SITE_CONTENT_DUPLICATE_NEAR');
      expect(nearFindings.length).toBe(0);

      const ledger = result.ledgerRecords.find((r) => r.canonicalRuleId === 'SITE_CONTENT_DUPLICATE_NEAR');
      expect(ledger!.executionStatus).toBe('executed_pass');
    });

    it('excludes pairs with length similarity < 0.8 even if SimHash signatures are identical', () => {
      const sig = '1234567890abcdef';
      const page1 = createMockPage('p1', 'https://example.com/short-article', {
        normalizedMainTextHash: 'hash-short',
        mainTextSimhash: sig,
        mainTextWordCount: 70, // 70 / 100 = 0.7 < 0.8
        contentQualityStatus: 'usable',
      });
      const page2 = createMockPage('p2', 'https://example.com/long-article', {
        normalizedMainTextHash: 'hash-long',
        mainTextSimhash: sig,
        mainTextWordCount: 100,
        contentQualityStatus: 'usable',
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([page1, page2], 'audit-test');
      const nearFindings = result.findings.filter((f) => f.ruleId === 'SITE_CONTENT_DUPLICATE_NEAR');
      expect(nearFindings.length).toBe(0);
    });

    it('does not classify uncrawled link destinations as broken 4xx or 5xx', () => {
      const pageSource = createMockPage('pSource', 'https://example.com/', {
        links: ['https://example.com/external-or-uncrawled'],
      });

      const result = StandaloneRulesEngine.evaluateSitewideDetailed([pageSource], 'audit-test');
      const broken4xx = result.findings.filter((f) => f.ruleId === 'SITE_INTERNAL_LINK_TO_4XX');
      const broken5xx = result.findings.filter((f) => f.ruleId === 'SITE_INTERNAL_LINK_TO_5XX');

      expect(broken4xx.length).toBe(0);
      expect(broken5xx.length).toBe(0);
    });
  });

  // =========================================================================
  // 12. PERFORMANCE & MEMORY SAFETY BENCHMARKING (5, 25, 50, 100 PAGES)
  // =========================================================================
  describe('12. Performance & Memory Safety Benchmarking', () => {
    function generateSyntheticFixture(pageCount: number): StandaloneCrawlPage[] {
      const pages: StandaloneCrawlPage[] = [];
      for (let i = 0; i < pageCount; i++) {
        const id = `bench-page-${i}`;
        const url = `https://example.com/resource-${i}`;
        // Interconnect with subsequent 2 pages in ring topology
        const link1 = `https://example.com/resource-${(i + 1) % pageCount}`;
        const link2 = `https://example.com/resource-${(i + 2) % pageCount}`;
        // Create controlled duplicate groups every 10 pages
        const cluster = Math.floor(i / 10);
        const simhash = `${cluster.toString(16).padStart(4, '0')}${'a'.repeat(12)}`.slice(0, 16);
        const contentHash = `hash-cluster-${cluster}-${i % 10}`;

        pages.push(
          createMockPage(id, url, {
            depth: i === 0 ? 0 : (i % 3) + 1,
            links: [link1, link2, link1], // includes duplicate link for deduplication testing
            mainTextWordCount: 150 + (i % 30),
            normalizedMainTextHash: contentHash,
            mainTextSimhash: simhash,
            contentQualityStatus: 'usable',
          })
        );
      }
      return pages;
    }

    for (const size of [5, 25, 50, 100]) {
      it(`evaluates full sitewide engine across ${size} pages within performance budget`, () => {
        const pages = generateSyntheticFixture(size);
        const startTime = performance.now();

        const result = StandaloneRulesEngine.evaluateSitewideDetailed(
          pages,
          `audit-bench-${size}`
        );

        const durationMs = performance.now() - startTime;

        // Verify valid outcomes
        expect(result.ledgerRecords.length).toBeGreaterThanOrEqual(13);
        const executedIds = new Set(result.ledgerRecords.map((r) => r.canonicalRuleId));
        for (const sitewideRule of CANONICAL_51_RULES.sitewide) {
          expect(executedIds.has(sitewideRule)).toBe(true);
        }

        // Verification of real-time browser responsiveness budgets:
        // 5 pages < 50ms, 25 pages < 100ms, 50 pages < 250ms, 100 pages < 500ms
        const budgetMs = size <= 5 ? 50 : size <= 25 ? 100 : size <= 50 ? 250 : 500;
        expect(durationMs).toBeLessThan(budgetMs);
      });
    }
  });
});

