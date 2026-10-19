/**
 * Live 5-Page Fixture Acceptance Test for Standalone MV3 Audit Engine.
 * Tests against the live HTTP fixture server running on port 4321 with real network requests.
 * Zero mocks for fetch or DOM parsing.
 */

import { describe, it, expect } from 'vitest';
import { StandaloneAuditCoordinator } from '../standalone/coordinator';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';

describe('Standalone Live Fixture Acceptance (http://127.0.0.1:4321/)', () => {
  it('successfully crawls all 5 pages, detects WordPress 6.4.3, evaluates rules, and generates valid scorecard', async () => {
    StandaloneAuditStorage.clearInMemoryForTesting();

    const coordinator = new StandaloneAuditCoordinator();

    const targetUrl = 'http://127.0.0.1:4321/';
    const job = await coordinator.startAudit(targetUrl, {
      maxPages: 5,
      maxDepth: 3,
      delayMs: 10,
      respectRobots: true,
    });

    // 1. Audit status & stage
    expect(job.status).toBe('completed');
    expect(job.progressPercent).toBe(100);
    expect(job.currentStage).toContain('Full in-browser audit completed');
    expect(job.errorMessage).toBeUndefined();

    // 2. Crawled pages verification
    const crawledPages = await StandaloneAuditStorage.getPagesForAudit(job.id);
    expect(crawledPages).toHaveLength(5);

    const expectedUrls = [
      'http://127.0.0.1:4321/',
      'http://127.0.0.1:4321/about',
      'http://127.0.0.1:4321/products',
      'http://127.0.0.1:4321/contact',
      'http://127.0.0.1:4321/blog',
    ];

    for (const expectedUrl of expectedUrls) {
      const page = crawledPages.find((p) => p.url === expectedUrl);
      expect(page).toBeDefined();
      expect(page?.httpStatus).toBe(200);
      expect(page?.fetchStatus).toBe('success');
      expect(page?.title).toBeTruthy();
      expect(page?.title).not.toBe('Untitled');
      expect(page?.headings.h1.length).toBeGreaterThanOrEqual(1);
      expect(page?.metaDescription).toBeTruthy();
      expect(page?.canonicalUrl).toContain('127.0.0.1:4321');
    }

    // 3. Technology stack detection
    const technologies = await StandaloneAuditStorage.getTechnologiesForAudit(job.id);
    expect(technologies.length).toBeGreaterThan(0);
    const wp = technologies.find((t) => t.technologyId === 'wordpress');
    expect(wp).toBeDefined();
    expect(wp?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(wp?.version).toBe('6.4.3');

    // 4. Canonical SEO findings & Localhost HTTP policy
    const findings = await StandaloneAuditStorage.getFindingsForAudit(job.id);
    // Should NOT report false missing title, missing description, or missing H1
    const missingTitle = findings.find((f) => f.ruleId === 'ONPAGE_TITLE_PRESENT' && f.status === 'fail');
    const missingH1 = findings.find((f) => f.ruleId === 'ONPAGE_H1_PRESENCE' && f.status === 'fail');
    expect(missingTitle).toBeUndefined();
    expect(missingH1).toBeUndefined();

    // Localhost policy: Should NOT report critical defect for HTTP on 127.0.0.1
    const criticalHttps = findings.find(
      (f) => f.ruleId === 'TECH_HTTPS_USAGE' && f.status === 'fail'
    );
    expect(criticalHttps).toBeUndefined();

    // 5. Authoritative Execution Ledger
    const ledgerRecords = await StandaloneAuditStorage.getExecutionLedgerForAudit(job.id);
    expect(ledgerRecords).toBeDefined();
    expect(ledgerRecords.length).toBeGreaterThan(0);
    // 33 distinct canonical rules evaluated across crawled pages and site graph in Phase 2B
    const distinctRules = new Set(ledgerRecords.map((r) => r.canonicalRuleId));
    expect(distinctRules.size).toBe(33);

    // 6. Scorecard evidence and availability gate
    expect(job.scorecard).toBeDefined();
    expect(job.scorecard?.available).toBe(true);
    expect(job.scorecard?.overallScore).toBeGreaterThanOrEqual(80);
    expect(job.scorecard?.grade).toMatch(/^[AB]$/);
    expect(job.scorecard?.pagesCrawled).toBe(5);
    expect(job.scorecard?.usablePagesCount).toBe(5);
    expect(job.scorecard?.attemptedPagesCount).toBe(5);
    expect(job.scorecard?.failedPagesCount).toBe(0);

    // 7. Honest Score Coverage (Provisional state when 30/51 canonical rules executed, 3 not_applicable)
    expect(job.scorecard?.coverage).toBeDefined();
    expect(job.scorecard?.coverage?.scoreState).toBe('provisional');
    expect(job.scorecard?.coverage?.executedRulesTotal).toBe(30);
    expect(job.scorecard?.coverage?.expectedRulesTotal).toBe(51);
    expect(job.scorecard?.coverage?.distinctExecutedCanonicalRules).toHaveLength(30);
    expect(job.scorecard?.coverage?.coverageRatio).toBeCloseTo(30 / 51, 2);
  });
});
