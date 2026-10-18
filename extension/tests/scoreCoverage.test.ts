import { describe, it, expect } from 'vitest';
import { StandaloneScoringCalculator, CANONICAL_RULE_TOTALS } from '../standalone/audit/scoring';
import type { StandaloneCrawlPage, StandaloneSeoFinding } from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  fetchStatus: 'success' | 'failed' = 'success',
  httpStatus = 200
): StandaloneCrawlPage {
  return {
    id,
    auditId: 'audit-test',
    url,
    depth: 1,
    headers: {},
    htmlSize: 1024,
    fetchedAt: Date.now(),
    fetchStatus,
    httpStatus,
    responseTimeMs: 15,
    title: 'Test Page',
    metaDescription: 'Description',
    canonicalUrl: url,
    headings: { h1: ['Heading'], h2: [], h3: [] },
    links: [],
    images: [],
  };
}

describe('StandaloneScoringCalculator & Score Coverage Parity', () => {
  it('verifies canonical rule totals match authoritative backend: 16 On-Page, 22 Technical, 13 Site-Wide = 51 Total', () => {
    expect(CANONICAL_RULE_TOTALS.on_page).toBe(16);
    expect(CANONICAL_RULE_TOTALS.technical).toBe(22);
    expect(CANONICAL_RULE_TOTALS.sitewide).toBe(13);
    expect(CANONICAL_RULE_TOTALS.total).toBe(51);
  });

  it('marks 5-page pass fixture as PROVISIONAL score while rule coverage is limited (< 80%)', () => {
    const pages: StandaloneCrawlPage[] = [
      createMockPage('1', 'http://127.0.0.1:4321/'),
      createMockPage('2', 'http://127.0.0.1:4321/about'),
      createMockPage('3', 'http://127.0.0.1:4321/products'),
      createMockPage('4', 'http://127.0.0.1:4321/contact'),
      createMockPage('5', 'http://127.0.0.1:4321/blog'),
    ];

    const passFindings: StandaloneSeoFinding[] = [
      {
        id: 'f-1',
        auditId: 'job-1',
        ruleId: 'TECH_HTTPS_USAGE',
        category: 'technical',
        severity: 'info',
        status: 'pass',
        title: 'HTTPS Active',
        description: 'TLS active.',
        recommendation: '',
        pageUrl: 'http://127.0.0.1:4321/',
        evidence: {},
      },
    ];

    const scorecard = StandaloneScoringCalculator.calculate(passFindings, pages);

    expect(scorecard.available).toBe(true);
    expect(scorecard.overallScore).toBe(100);
    expect(scorecard.grade).toBe('A');
    expect(scorecard.totalIssuesCount).toBe(0);

    // HONEST COVERAGE ASSERTIONS:
    // With only 1 rule evaluated out of 51, state MUST be 'provisional'
    expect(scorecard.coverage.scoreState).toBe('provisional');
    expect(scorecard.coverage.expectedRulesTotal).toBe(51);
    expect(scorecard.coverage.executedRulesTotal).toBe(1);
    expect(scorecard.coverage.missingRulesTotal).toBe(50);
    expect(scorecard.coverage.coverageRatio).toBeLessThan(0.8);
    expect(scorecard.scoringVersion).toBe('2.0.0-standalone');
    expect(scorecard.coverage.policyVersion).toBe('2.0.0-standalone');
  });

  it('marks scorecard as UNAVAILABLE with grade N/A when 0 usable pages are crawled', () => {
    const failedPages: StandaloneCrawlPage[] = [
      createMockPage('1', 'https://example.com/', 'failed', 0),
      createMockPage('2', 'https://example.com/about', 'failed', 500),
    ];

    const scorecard = StandaloneScoringCalculator.calculate([], failedPages);

    expect(scorecard.available).toBe(false);
    expect(scorecard.overallScore).toBeNull();
    expect(scorecard.grade).toBe('N/A');
    expect(scorecard.coverage.scoreState).toBe('unavailable');
    expect(scorecard.failedPagesCount).toBe(2);
    expect(scorecard.usablePagesCount).toBe(0);
    expect(scorecard.attemptedPagesCount).toBe(2);
  });

  it('preserves canonical 35% On-Page, 40% Technical, 25% Site-Wide category weighting', () => {
    const pages: StandaloneCrawlPage[] = [
      createMockPage('1', 'https://example.com/'),
      createMockPage('2', 'https://example.com/p2'),
      createMockPage('3', 'https://example.com/p3'),
    ];

    // Critical finding in Technical category (-25 pts)
    const findings: StandaloneSeoFinding[] = [
      {
        id: 'f-tech-crit',
        auditId: 'job-weight',
        ruleId: 'TECH_ROBOTS_TXT',
        category: 'technical',
        severity: 'critical',
        status: 'fail',
        title: 'Robots.txt Invalid',
        description: '',
        recommendation: '',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
    ];

    const scorecard = StandaloneScoringCalculator.calculate(findings, pages);

    expect(scorecard.onPageScore).toBe(100);
    expect(scorecard.technicalScore).toBe(75); // 100 - 25
    expect(scorecard.sitewideScore).toBe(100);

    // Composite: 100 * 0.35 + 75 * 0.40 + 100 * 0.25 = 35 + 30 + 25 = 90
    expect(scorecard.overallScore).toBe(90);
    expect(scorecard.grade).toBe('A');
  });

  it('penalizes warnings by half deduction according to explicit severity policy', () => {
    const pages: StandaloneCrawlPage[] = [
      createMockPage('1', 'https://example.com/'),
      createMockPage('2', 'https://example.com/p2'),
      createMockPage('3', 'https://example.com/p3'),
    ];

    // High warning in On-Page (normally high is 15 pts, warning takes half: 8 pts)
    const findings: StandaloneSeoFinding[] = [
      {
        id: 'f-onpage-warn',
        auditId: 'job-warn',
        ruleId: 'ONPAGE_TITLE_LENGTH',
        category: 'on_page',
        severity: 'high',
        status: 'warning',
        title: 'Title Length Warning',
        description: '',
        recommendation: '',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
    ];

    const scorecard = StandaloneScoringCalculator.calculate(findings, pages);

    expect(scorecard.onPageScore).toBe(92); // 100 - 8
    expect(scorecard.technicalScore).toBe(100);
    expect(scorecard.sitewideScore).toBe(100);

    // Composite: 92 * 0.35 (32.2) + 100 * 0.40 (40) + 100 * 0.25 (25) = 97.2 -> 97
    expect(scorecard.overallScore).toBe(97);
    expect(scorecard.totalIssuesCount).toBe(1);
  });
});
