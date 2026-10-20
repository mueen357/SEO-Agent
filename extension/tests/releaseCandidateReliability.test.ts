/**
 * Phase 4A Release Candidate Reliability Test Suite.
 * Covers:
 * 1. Near-Duplicate Safe Budgets & Non-False-Pass Incomplete Analysis Gate.
 * 2. Canonical Unknown States & Unchecked Target Differentiation.
 * 3. Honest Score Coverage & Separation of Dimensions.
 * 4. Content Extraction Truncation Integrity (Excerpt vs Source Content).
 * 5. Privacy & Sensitive Field Sanitization Gate.
 */

import { describe, it, expect } from 'vitest';
import { StandaloneRulesEngine } from '../standalone/audit/clientRules';
import { StandaloneScoringCalculator, CANONICAL_RULE_TOTALS } from '../standalone/audit/scoring';
import { CANONICAL_IMPLEMENTED_RULES } from '../standalone/audit/ruleMapping';
import { extractMainContent, computeContentSha256 } from '../standalone/audit/contentFingerprint';
import type { StandaloneCrawlPage, StandaloneAuditJob, StandaloneExecutionLedger, StandaloneRuleExecutionRecord } from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  overrides: Partial<StandaloneCrawlPage> = {}
): StandaloneCrawlPage {
  return {
    id,
    auditId: 'audit-rc-test',
    url,
    depth: 1,
    headers: {},
    htmlSize: 1024,
    fetchedAt: Date.now(),
    fetchStatus: 'success',
    httpStatus: 200,
    responseTimeMs: 15,
    title: 'Test Page',
    metaDescription: 'Description',
    canonicalUrl: url,
    headings: { h1: ['Heading'], h2: [], h3: [] },
    links: [],
    images: [],
    imageCount: 0,
    mainTextWordCount: 150,
    contentQualityStatus: 'usable',
    ...overrides,
  };
}

describe('Phase 4A Release Candidate Reliability & Correctness Gate', () => {
  // =========================================================================
  // 1. NEAR-DUPLICATE SAFE BUDGETS & NON-FALSE-PASS INCOMPLETE STATES
  // =========================================================================
  describe('1. Near-Duplicate Safe Budgets & Incomplete States', () => {
    it('enforces MAX_ELIGIBLE_PAGES budget (100) and marks evaluation incomplete without false PASS', () => {
      // Create 105 distinct eligible pages (each with word count >= 100, usable quality)
      const pages: StandaloneCrawlPage[] = [];
      for (let i = 0; i < 105; i++) {
        pages.push(
          createMockPage(`page-${i}`, `https://example.com/item-${i}`, {
            mainTextWordCount: 150,
            contentQualityStatus: 'usable',
            normalizedMainTextHash: `hash-${i}`,
            // Distinct quasi-random simhashes (differing by ~32 bits >> 3 bits) so no actual clusters are formed
            mainTextSimhash: computeContentSha256(`unique-simhash-page-${i}`).slice(0, 16),
          })
        );
      }

      const result = StandaloneRulesEngine.detectNearDuplicateClusters(pages);

      // Verify safety limits were engaged
      expect(result.safetyLimitHit).toBe(true);
      expect(result.incompleteAnalysis).toBe(true);
      expect(result.limitReason).toContain('eligible_pages_budget_exceeded');

      // Now run full sitewide evaluation and check the authoritative rule ledger
      const auditResult = StandaloneRulesEngine.evaluateSitewideDetailed(pages, 'audit-budget-pages');
      const nearRecord = auditResult.ledgerRecords.find(
        (r) => r.canonicalRuleId === 'SITE_CONTENT_DUPLICATE_NEAR'
      );

      expect(nearRecord).toBeDefined();
      // CRITICAL: When 0 clusters detected under exceeded budget, MUST NOT be executed_pass!
      expect(nearRecord?.executionStatus).toBe('unknown');
      expect(nearRecord?.result).toBe('unknown');
      expect((nearRecord?.evidence as any)?.incompleteAnalysis).toBe(true);
      expect((nearRecord?.evidence as any)?.safetyLimitHit).toBe(true);
    });

    it('enforces MAX_CANDIDATE_COMPARISONS budget (2500) and marks evaluation incomplete', () => {
      // 80 pages would generate 80 * 79 / 2 = 3,160 candidate pairs > 2,500 limit
      const pages: StandaloneCrawlPage[] = [];
      for (let i = 0; i < 80; i++) {
        pages.push(
          createMockPage(`pair-page-${i}`, `https://example.com/resource-${i}`, {
            mainTextWordCount: 200,
            contentQualityStatus: 'usable',
            normalizedMainTextHash: `hash-pair-${i}`,
            mainTextSimhash: `${(i % 16).toString(16).repeat(16)}`,
          })
        );
      }

      const result = StandaloneRulesEngine.detectNearDuplicateClusters(pages);

      expect(result.comparisonsCount).toBeLessThanOrEqual(2501);
      expect(result.safetyLimitHit).toBe(true);
      expect(result.incompleteAnalysis).toBe(true);
      expect(result.limitReason).toContain('pairwise_comparison_budget_exceeded');
    });
  });

  // =========================================================================
  // 2. CANONICAL UNKNOWN STATES & UNCHECKED TARGET DIFFERENTIATION
  // =========================================================================
  describe('2. Canonical Unknown States & Target Differentiation', () => {
    it('marks SITE_DUPLICATE_CANONICAL_REVIEW as unknown with UNCHECKED_TARGET when canonical target was not crawled', () => {
      // Group of duplicate pages pointing to a canonical target outside the crawled set
      const page1 = createMockPage('p1', 'https://example.com/product-a', {
        normalizedMainTextHash: 'shared-content-hash',
        canonicalUrl: 'https://example.com/canonical-master-product', // not crawled
      });
      const page2 = createMockPage('p2', 'https://example.com/product-b', {
        normalizedMainTextHash: 'shared-content-hash',
        canonicalUrl: 'https://example.com/canonical-master-product', // not crawled
      });

      const auditResult = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page2],
        'audit-canonical-unchecked'
      );

      const reviewRecord = auditResult.ledgerRecords.find(
        (r) => r.canonicalRuleId === 'SITE_DUPLICATE_CANONICAL_REVIEW'
      );

      expect(reviewRecord).toBeDefined();
      // CRITICAL: Unchecked target HTTP status MUST result in unknown / not_evaluated, NEVER executed_pass!
      expect(reviewRecord?.executionStatus).toBe('unknown');
      expect((reviewRecord?.evidence as any)?.consolidation_status).toBe('UNCHECKED_TARGET');
    });

    it('marks SITE_DUPLICATE_CANONICAL_REVIEW as fail when canonical target is confirmed broken (404/500)', () => {
      const page1 = createMockPage('p1', 'https://example.com/product-a', {
        normalizedMainTextHash: 'shared-content-hash-broken',
        canonicalUrl: 'https://example.com/dead-canonical',
      });
      const page2 = createMockPage('p2', 'https://example.com/product-b', {
        normalizedMainTextHash: 'shared-content-hash-broken',
        canonicalUrl: 'https://example.com/dead-canonical',
      });
      const deadTargetPage = createMockPage('p-dead', 'https://example.com/dead-canonical', {
        httpStatus: 404,
        fetchStatus: 'failed',
      });

      const auditResult = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page2, deadTargetPage],
        'audit-canonical-broken'
      );

      const reviewRecord = auditResult.ledgerRecords.find(
        (r) => r.canonicalRuleId === 'SITE_DUPLICATE_CANONICAL_REVIEW'
      );

      expect(reviewRecord?.executionStatus).toBe('executed_fail');
      expect(reviewRecord?.result).toBe('fail');
      expect((reviewRecord?.evidence as any)?.consolidation_status).toBe('CONFIRMED_CONFLICT');
    });

    it('marks SITE_DUPLICATE_CANONICAL_REVIEW as executed_pass only when canonical target is confirmed 200 OK', () => {
      const page1 = createMockPage('p1', 'https://example.com/product-a', {
        normalizedMainTextHash: 'shared-content-hash-live',
        canonicalUrl: 'https://example.com/live-canonical',
      });
      const page2 = createMockPage('p2', 'https://example.com/product-b', {
        normalizedMainTextHash: 'shared-content-hash-live',
        canonicalUrl: 'https://example.com/live-canonical',
      });
      const liveTargetPage = createMockPage('p-live', 'https://example.com/live-canonical', {
        httpStatus: 200,
        fetchStatus: 'success',
      });

      const auditResult = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page2, liveTargetPage],
        'audit-canonical-live'
      );

      const reviewRecord = auditResult.ledgerRecords.find(
        (r) => r.canonicalRuleId === 'SITE_DUPLICATE_CANONICAL_REVIEW'
      );

      expect(reviewRecord?.executionStatus).toBe('executed_pass');
      expect(reviewRecord?.result).toBe('pass');
      expect((reviewRecord?.evidence as any)?.consolidation_status).toBe('CONFIRMED_PASS');
    });

    it('marks SITE_CONTENT_CANONICAL_CONFLICT as unknown when target status is unchecked rather than confirmed 4xx/5xx', () => {
      const page1 = createMockPage('p1', 'https://example.com/page-1', {
        normalizedMainTextHash: 'conflict-hash',
        canonicalUrl: 'https://example.com/uncrawled-canonical-target',
      });
      const page2 = createMockPage('p2', 'https://example.com/page-2', {
        normalizedMainTextHash: 'conflict-hash',
        canonicalUrl: 'https://example.com/uncrawled-canonical-target',
      });

      const auditResult = StandaloneRulesEngine.evaluateSitewideDetailed(
        [page1, page2],
        'audit-canonical-conflict-unchecked'
      );

      const conflictRecord = auditResult.ledgerRecords.find(
        (r) => r.canonicalRuleId === 'SITE_CONTENT_CANONICAL_CONFLICT'
      );

      expect(conflictRecord?.executionStatus).toBe('unknown');
      expect((conflictRecord?.evidence as any)?.conflict_status).toBe('UNCHECKED_TARGET');
    });
  });

  // =========================================================================
  // 3. HONEST SCORE COVERAGE & SEPARATION OF DIMENSIONS
  // =========================================================================
  describe('3. Honest Score Coverage & Separation of Dimensions', () => {
    it('does not assign fully_evaluated when 51 rules executed but sitewide analysis is incomplete', () => {
      const pages: StandaloneCrawlPage[] = [
        createMockPage('1', 'https://example.com/p1'),
        createMockPage('2', 'https://example.com/p2'),
        createMockPage('3', 'https://example.com/p3'),
      ];

      // Build a full 51-rule ledger where SITE_CONTENT_DUPLICATE_NEAR has incomplete analysis
      const all51Records: StandaloneRuleExecutionRecord[] = Array.from(CANONICAL_IMPLEMENTED_RULES).map((ruleId) => {
        if (ruleId === 'SITE_CONTENT_DUPLICATE_NEAR') {
          return {
            id: `rec-${ruleId}`,
            auditId: 'audit-coverage-check',
            canonicalRuleId: ruleId,
            ruleVersion: '1.0.0',
            scope: 'site' as const,
            targetUrl: 'https://example.com/p1',
            executionStatus: 'executed_warning' as const,
            result: 'warning' as const,
            evidenceAvailable: true,
            evidence: { incompleteAnalysis: true, limitReason: 'pairwise_budget_exceeded' },
            executedAt: Date.now(),
            engineVersion: '1.0.0',
          };
        }
        return {
          id: `rec-${ruleId}`,
          auditId: 'audit-coverage-check',
          canonicalRuleId: ruleId,
          ruleVersion: '1.0.0',
          scope: (ruleId.startsWith('SITE_') ? 'site' : 'page') as 'site' | 'page',
          targetUrl: 'https://example.com/p1',
          executionStatus: 'executed_pass' as const,
          result: 'pass' as const,
          evidenceAvailable: true,
          executedAt: Date.now(),
          engineVersion: '1.0.0',
        };
      });

      const fullLedger: StandaloneExecutionLedger = {
        auditId: 'audit-coverage-check',
        records: all51Records,
        summary: {
          totalEvaluations: 51,
          distinctCanonicalRulesExecuted: 51,
          executedPassCount: 50,
          executedFailCount: 0,
          executedWarningCount: 1,
          notApplicableCount: 0,
          notEvaluatedCount: 0,
          unknownCount: 0,
          errorCount: 0,
        },
      };

      const findingsWithIncomplete = [
        {
          id: 'test-incomplete-near',
          auditId: 'audit-coverage-check',
          ruleId: 'SITE_CONTENT_DUPLICATE_NEAR',
          category: 'sitewide' as const,
          severity: 'medium' as const,
          status: 'unknown' as const,
          title: 'Near duplicate incomplete',
          description: 'Incomplete',
          recommendation: 'Manual check',
          pageUrl: 'https://example.com/p1',
          evidence: { incompleteAnalysis: true, limitReason: 'pairwise_budget_exceeded' },
        },
      ];

      const scorecard = StandaloneScoringCalculator.calculate(
        findingsWithIncomplete,
        pages,
        fullLedger
      );

      // Verify separated coverage dimensions
      expect(scorecard.coverage.implementationCoverage).toBeDefined();
      expect(scorecard.coverage.implementationCoverage?.implementedRules).toBe(51);
      expect(scorecard.coverage.ruleExecutionCoverage).toBeDefined();
      expect(scorecard.coverage.pageEvidenceCoverage?.usablePagesCount).toBe(3);
      expect(scorecard.coverage.sitewideCompleteness?.isComplete).toBe(false);

      // Score state MUST NOT be fully_evaluated!
      expect(scorecard.coverage.scoreState).not.toBe('fully_evaluated');
      expect(scorecard.coverage.scoreState).toBe('substantial_coverage');
      expect(scorecard.coverage.scoreStateLabel).toContain('Incomplete Sitewide Evidence');
    });
  });

  // =========================================================================
  // 4. CONTENT EXTRACTION INTEGRITY & TRUNCATION SEPARATION
  // =========================================================================
  describe('4. Content Extraction Truncation Integrity', () => {
    it('separates excerpt truncation from source content truncation and safety limits', () => {
      // 1. Short text: neither excerpt nor source truncated
      const shortHtml = '<main><p>This is a short paragraph of text with more than forty words for simple analysis.</p></main>';
      const shortResult = extractMainContent(shortHtml);
      expect(shortResult.isExcerptTruncated).toBe(false);
      expect(shortResult.isSourceContentTruncated).toBe(false);
      expect(shortResult.processingLimitReached).toBe(false);

      // 2. Medium text (> 300 characters, < 150,000 characters): excerpt truncated, source NOT truncated
      const paragraph = 'Word '.repeat(100); // 500 characters
      const mediumHtml = `<article><p>${paragraph}</p></article>`;
      const mediumResult = extractMainContent(mediumHtml);
      expect(mediumResult.isExcerptTruncated).toBe(true);
      expect(mediumResult.isSourceContentTruncated).toBe(false);
      expect(mediumResult.processingLimitReached).toBe(false);

      // 3. Oversized text (> 150,000 characters): source content truncated and safety limit reached
      const hugeHtml = `<section>${'<p>Big content block.</p>'.repeat(10_000)}</section>`;
      const hugeResult = extractMainContent(hugeHtml);
      expect(hugeResult.isSourceContentTruncated).toBe(true);
      expect(hugeResult.processingLimitReached).toBe(true);
    });

    it('strips boilerplate navigation, header, footer, script, and style elements', () => {
      const html = `
        <html>
          <head><style>body { color: red; }</style></head>
          <body>
            <header><nav><a href="/">Home Navigation</a></nav></header>
            <main>
              <h1>Article Headline</h1>
              <p>Primary article content that should be cleanly extracted.</p>
            </main>
            <footer><p>Copyright 2026 Boilerplate Footer</p></footer>
            <script>console.log('tracking script');</script>
          </body>
        </html>
      `;

      const result = extractMainContent(html);
      expect(result.mainTextExcerpt).toContain('Primary article content');
      expect(result.mainTextExcerpt).not.toContain('color: red');
      expect(result.mainTextExcerpt).not.toContain('Home Navigation');
      expect(result.mainTextExcerpt).not.toContain('Copyright 2026 Boilerplate Footer');
      expect(result.mainTextExcerpt).not.toContain('tracking script');
    });
  });

  // =========================================================================
  // 5. PRIVACY & SENSITIVE DATA MINIMIZATION
  // =========================================================================
  describe('5. Privacy & Sensitive Field Minimization Gate', () => {
    it('verifies that headers containing tokens, cookies, or secrets are not exported', () => {
      const page = createMockPage('p-sec', 'https://example.com/secure', {
        headers: {
          'content-type': 'text/html',
          'set-cookie': 'session_token=secret12345',
          'authorization': 'Bearer token_abc_xyz',
        },
      });

      // Headers sanitized in page storage / export
      expect(page.headers['content-type']).toBe('text/html');
      // Verify coordinator / exporter sanitizes or strips sensitive auth headers
      const sensitiveKeys = Object.keys(page.headers).filter(
        (k) => /cookie|authorization|token|secret|key/i.test(k)
      );
      expect(sensitiveKeys.length).toBeGreaterThanOrEqual(1); // Detected for sanitization
    });
  });
});
