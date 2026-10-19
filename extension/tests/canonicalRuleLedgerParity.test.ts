/**
 * Canonical SEO Rule Identity, Execution Ledger & Score Coverage Parity Tests.
 *
 * Verifies:
 * 1. 51 canonical SEO rules registry
 * 2. Legacy-to-canonical rule mapping and multi-rule splits
 * 3. Authoritative execution ledger (independent of findings)
 * 4. Passing checks without findings counted accurately
 * 5. Distinct rule count vs page-level execution count
 * 6. Score states (unavailable, provisional, substantial_coverage, fully_evaluated)
 * 7. Non-destructive migration of historical audit records
 * 8. JSON and CSV export fidelity for execution ledgers
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_51_RULES,
  ALL_CANONICAL_51_RULES,
  CANONICAL_IMPLEMENTED_RULES,
  LEGACY_TO_CANONICAL_RULE_MAP,
  isCanonicalRuleId,
  getCanonicalRulesForLegacyId,
  migrateLegacyFinding,
} from '../standalone/audit/ruleMapping';
import { StandaloneRulesEngine } from '../standalone/audit/clientRules';
import { StandaloneScoringCalculator, CANONICAL_RULE_TOTALS } from '../standalone/audit/scoring';
import { StandaloneExporter } from '../standalone/export/exporter';
import type {
  StandaloneCrawlPage,
  StandaloneSeoFinding,
  StandaloneAuditJob,
  StandaloneTechFinding,
} from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  fetchStatus: 'success' | 'failed' = 'success',
  httpStatus = 200,
  overrides: Partial<StandaloneCrawlPage> = {}
): StandaloneCrawlPage {
  return {
    id,
    auditId: 'audit-canonical-test',
    url,
    depth: 1,
    headers: {},
    htmlSize: 2048,
    fetchedAt: Date.now(),
    fetchStatus,
    httpStatus,
    responseTimeMs: 25,
    title: 'Optimal Title for Search Ranking',
    metaDescription: 'A well-crafted meta description between 70 and 160 characters designed for search engine snippets.',
    canonicalUrl: url,
    headings: { h1: ['Single Main Heading'], h2: ['Subheading'], h3: [] },
    htmlLang: 'en',
    links: ['http://127.0.0.1:4321/about'],
    images: [{ src: '/img.jpg', alt: 'Descriptive alt text' }],
    ...overrides,
  };
}

describe('Canonical SEO Rule Identity & Legacy Mapping Parity', () => {
  it('verifies canonical 51-rule registry structure matches authoritative backend (16 on-page, 22 technical, 13 sitewide)', () => {
    expect(ALL_CANONICAL_51_RULES.length).toBe(51);
    expect(CANONICAL_51_RULES.on_page.length).toBe(16);
    expect(CANONICAL_51_RULES.technical.length).toBe(22);
    expect(CANONICAL_51_RULES.sitewide.length).toBe(13);
    expect(CANONICAL_RULE_TOTALS.on_page).toBe(16);
    expect(CANONICAL_RULE_TOTALS.technical).toBe(22);
    expect(CANONICAL_RULE_TOTALS.sitewide).toBe(13);
    expect(CANONICAL_RULE_TOTALS.total).toBe(51);
  });

  it('verifies implemented canonical rule count is exactly 25 in Phase 2A (16 on-page, 7 technical, 2 sitewide)', () => {
    expect(CANONICAL_IMPLEMENTED_RULES.size).toBe(25);
    for (const ruleId of CANONICAL_IMPLEMENTED_RULES) {
      expect(isCanonicalRuleId(ruleId)).toBe(true);
    }
  });

  it('maps legacy ONPAGE_TITLE_TAG to two distinct canonical rules (PRESENCE and LENGTH)', () => {
    const canonicalIds = getCanonicalRulesForLegacyId('ONPAGE_TITLE_TAG');
    expect(canonicalIds).toEqual(['ONPAGE_TITLE_PRESENT', 'ONPAGE_TITLE_LENGTH']);

    const mapping = LEGACY_TO_CANONICAL_RULE_MAP['ONPAGE_TITLE_TAG'];
    expect(mapping).toBeDefined();
    expect(mapping!.canonicalRuleIds).toContain('ONPAGE_TITLE_PRESENT');
    expect(mapping!.canonicalRuleIds).toContain('ONPAGE_TITLE_LENGTH');
    expect(mapping!.verifiedImplementationStatus).toBe('implemented_split');
  });

  it('maps legacy ONPAGE_META_DESC to two distinct canonical rules (PRESENCE and LENGTH)', () => {
    const canonicalIds = getCanonicalRulesForLegacyId('ONPAGE_META_DESC');
    expect(canonicalIds).toEqual(['ONPAGE_META_DESC_PRESENT', 'ONPAGE_META_DESC_LENGTH']);

    const mapping = LEGACY_TO_CANONICAL_RULE_MAP['ONPAGE_META_DESC'];
    expect(mapping).toBeDefined();
    expect(mapping!.verifiedImplementationStatus).toBe('implemented_split');
  });

  it('maps legacy ONPAGE_H1_PRIMARY to PRESENCE and MULTIPLE canonical rules', () => {
    const canonicalIds = getCanonicalRulesForLegacyId('ONPAGE_H1_PRIMARY');
    expect(canonicalIds).toEqual(['ONPAGE_H1_PRESENCE', 'ONPAGE_H1_MULTIPLE']);
  });

  it('maps legacy ONPAGE_CANONICAL to PRESENCE and VALID canonical rules', () => {
    const canonicalIds = getCanonicalRulesForLegacyId('ONPAGE_CANONICAL');
    expect(canonicalIds).toEqual(['ONPAGE_CANONICAL_PRESENCE', 'ONPAGE_CANONICAL_VALID']);
  });

  it('maps legacy single-rule checks directly (IMAGES, HTTP_STATUS, HTTPS, DUPLICATE_TITLES, ORPHAN)', () => {
    expect(getCanonicalRulesForLegacyId('ONPAGE_IMAGES')).toEqual(['ONPAGE_IMAGE_ALT_MISSING']);
    expect(getCanonicalRulesForLegacyId('TECH_HTTPS_SECURITY')).toEqual(['TECH_HTTPS_USAGE']);
    expect(getCanonicalRulesForLegacyId('SITE_DUPLICATE_TITLES')).toEqual(['SITE_TITLE_DUPLICATE']);
    expect(getCanonicalRulesForLegacyId('SITE_ORPHAN_PAGES')).toEqual(['SITE_NO_OBSERVED_INTERNAL_INLINKS']);
  });

  it('gracefully handles unknown / unmapped legacy rule IDs without crashing', () => {
    expect(getCanonicalRulesForLegacyId('UNKNOWN_CUSTOM_RULE')).toEqual(['UNKNOWN_CUSTOM_RULE']);
    expect(isCanonicalRuleId('UNKNOWN_CUSTOM_RULE')).toBe(false);
  });

  it('migrates historical legacy findings non-destructively to canonical rule IDs', () => {
    const legacyFinding: StandaloneSeoFinding = {
      id: 'legacy-1',
      auditId: 'audit-legacy',
      ruleId: 'ONPAGE_TITLE_TAG',
      category: 'on_page',
      severity: 'high',
      status: 'fail',
      title: 'Missing Title Tag',
      description: 'Page lacks a title tag.',
      recommendation: 'Add a title tag.',
      pageUrl: 'https://example.com/missing-title',
      evidence: {},
    };

    const migrated = migrateLegacyFinding(legacyFinding)[0];
    expect(migrated).toBeDefined();
    expect(migrated?.ruleId).toBe('ONPAGE_TITLE_PRESENT');
    expect(migrated?.category).toBe('on_page');
    expect(migrated?.title).toBe(legacyFinding.title);
  });
});

describe('Authoritative SEO Rule Execution Ledger & Coverage', () => {
  it('records EXECUTED_PASS in ledger for successful evaluations without creating findings', () => {
    const page = createMockPage('1', 'http://127.0.0.1:4321/');
    const result = StandaloneRulesEngine.evaluateAudit([page], 'audit-test');

    // Passing page should produce 0 failing or warning findings
    const nonPassFindings = result.findings.filter((f) => f.status === 'fail' || f.status === 'warning');
    expect(nonPassFindings.length).toBe(0);

    // BUT the authoritative execution ledger MUST record all executed rules as executed_pass!
    expect(result.ledger?.records.length).toBeGreaterThan(0);
    const titlePresentExec = result.ledger?.records.find((e) => e.canonicalRuleId === 'ONPAGE_TITLE_PRESENT');
    expect(titlePresentExec).toBeDefined();
    expect(titlePresentExec?.executionStatus).toBe('executed_pass');
    expect(titlePresentExec?.result).toBe('pass');
    expect(titlePresentExec?.evidenceAvailable).toBe(true);

    const canonicalExec = result.ledger?.records.find((e) => e.canonicalRuleId === 'ONPAGE_CANONICAL_PRESENCE');
    expect(canonicalExec).toBeDefined();
    expect(canonicalExec?.executionStatus).toBe('executed_pass');
  });

  it('counts distinct executed rules accurately regardless of page count (5 pages = 1 distinct rule)', () => {
    const pages = [
      createMockPage('1', 'http://127.0.0.1:4321/'),
      createMockPage('2', 'http://127.0.0.1:4321/about'),
      createMockPage('3', 'http://127.0.0.1:4321/products'),
      createMockPage('4', 'http://127.0.0.1:4321/contact'),
      createMockPage('5', 'http://127.0.0.1:4321/blog'),
    ];

    const result = StandaloneRulesEngine.evaluateAudit(pages, 'audit-multi');
    const scorecard = StandaloneScoringCalculator.calculate(result.findings, pages, result.ledger);

    // 5 pages x on-page rules evaluated = multiple page executions, but distinct canonical rules executed count is bounded
    expect(scorecard.coverage.distinctExecutedCanonicalRules).toBeDefined();
    expect(scorecard.coverage.distinctExecutedCanonicalRules!.length).toBeGreaterThanOrEqual(10);
    expect(scorecard.coverage.executedRulesTotal).toBe(scorecard.coverage.distinctExecutedCanonicalRules!.length);

    // Each distinct rule must appear exactly once in distinctExecutedCanonicalRules
    const uniqueRules = new Set(scorecard.coverage.distinctExecutedCanonicalRules);
    expect(uniqueRules.size).toBe(scorecard.coverage.distinctExecutedCanonicalRules!.length);
  });

  it('marks scorecard as UNAVAILABLE with grade N/A when zero usable pages exist', () => {
    const failedPages = [
      createMockPage('1', 'http://127.0.0.1:4321/f1', 'failed', 0),
      createMockPage('2', 'http://127.0.0.1:4321/f2', 'failed', 503),
    ];

    const result = StandaloneRulesEngine.evaluateAudit(failedPages, 'audit-fail');
    const scorecard = StandaloneScoringCalculator.calculate(result.findings, failedPages, result.ledger);

    expect(scorecard.available).toBe(false);
    expect(scorecard.overallScore).toBeNull();
    expect(scorecard.grade).toBe('N/A');
    expect(scorecard.coverage.scoreState).toBe('unavailable');
    expect(scorecard.usablePagesCount).toBe(0);
    expect(scorecard.failedPagesCount).toBe(2);
  });

  it('marks score as PROVISIONAL when coverage is under 80%', () => {
    const page = createMockPage('1', 'http://127.0.0.1:4321/');
    const result = StandaloneRulesEngine.evaluateAudit([page], 'audit-prov');
    const scorecard = StandaloneScoringCalculator.calculate(result.findings, [page], result.ledger);

    expect(scorecard.available).toBe(true);
    // 14 rules evaluated out of 51 total canonical rules = 27.5% coverage (< 80%)
    expect(scorecard.coverage.scoreState).toBe('provisional');
    expect(scorecard.coverage.coverageRatio).toBeLessThan(0.80);
    expect(scorecard.coverage.expectedRulesTotal).toBe(51);
    expect(scorecard.coverage.missingRulesTotal).toBe(51 - scorecard.coverage.executedRulesTotal);
  });

  it('correctly tracks failing and warning rules in the execution ledger', () => {
    const brokenPage = createMockPage('1', 'http://127.0.0.1:4321/broken', 'success', 200, {
      title: '', // triggers ONPAGE_TITLE_PRESENT fail
      metaDescription: 'Short', // triggers ONPAGE_META_DESC_LENGTH warning
      headings: { h1: [], h2: [], h3: [] }, // triggers ONPAGE_H1_PRESENCE fail
      images: [{ src: '/noalt.jpg', alt: '' }], // triggers ONPAGE_IMAGE_ALT_MISSING warning
    });

    const result = StandaloneRulesEngine.evaluateAudit([brokenPage], 'audit-broken');
    const scorecard = StandaloneScoringCalculator.calculate(result.findings, [brokenPage], result.ledger);

    expect(scorecard.coverage.failedChecksCount).toBeGreaterThanOrEqual(2);
    expect(scorecard.coverage.warningChecksCount).toBeGreaterThanOrEqual(2);
    expect(scorecard.coverage.passedChecksCount).toBeGreaterThanOrEqual(1);

    const titleExec = result.ledger?.records.find((e) => e.canonicalRuleId === 'ONPAGE_TITLE_PRESENT');
    expect(titleExec?.executionStatus).toBe('executed_fail');
    expect(titleExec?.result).toBe('fail');

    const descLenExec = result.ledger?.records.find((e) => e.canonicalRuleId === 'ONPAGE_META_DESC_LENGTH');
    expect(descLenExec?.executionStatus).toBe('executed_warning');
    expect(descLenExec?.result).toBe('warning');
  });

  it('exports the authoritative execution ledger in both JSON and CSV formats', () => {
    const page = createMockPage('1', 'http://127.0.0.1:4321/');
    const result = StandaloneRulesEngine.evaluateAudit([page], 'audit-export');
    const scorecard = StandaloneScoringCalculator.calculate(result.findings, [page], result.ledger);

    const job: StandaloneAuditJob = {
      id: 'audit-export',
      targetUrl: 'http://127.0.0.1:4321/',
      origin: 'http://127.0.0.1:4321',
      hostname: '127.0.0.1',
      status: 'completed',
      startedAt: Date.now() - 5000,
      completedAt: Date.now(),
      crawledUrls: [page.url],
      failedUrls: [],
      pendingQueue: [],
      discoveredUrls: [page.url],
      currentStage: 'Completed',
      progressPercent: 100,
      updatedAt: Date.now(),
      stageCheckpoints: {
        crawlingStarted: true,
        crawlingFinished: true,
        seoStarted: true,
        seoFinished: true,
        techStarted: true,
        techFinished: true,
        scoringStarted: true,
        scoringFinished: true,
      },
      config: { maxPages: 5, maxDepth: 1, concurrency: 1, delayMs: 0, respectRobots: true },
    };

    // JSON Export
    const jsonStr = StandaloneExporter.exportJson(job, [page], result.findings, [], scorecard, result.ledger);
    const parsedJson = JSON.parse(jsonStr);
    expect(parsedJson.audit).toBeDefined();
    expect(parsedJson.executionLedger).toBeDefined();
    expect(Array.isArray(parsedJson.executionLedger)).toBe(true);
    expect(parsedJson.executionLedger.length).toBe(result.ledger?.records.length);

    // CSV Export
    const csvStr = StandaloneExporter.exportCsv(job, [page], result.findings, [], scorecard, result.ledger);
    expect(csvStr).toContain('Type');
    expect(csvStr).toContain('RULE_EXECUTION');
    expect(csvStr).toContain('ONPAGE_TITLE_PRESENT');
  });
});
