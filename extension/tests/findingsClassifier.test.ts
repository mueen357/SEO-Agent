import { describe, it, expect } from 'vitest';
import { StandaloneFindingsClassifier } from '../standalone/audit/findingsClassifier';
import type { StandaloneSeoFinding } from '../standalone/types';

describe('StandaloneFindingsClassifier (SEO Issue vs Passed Check Classification)', () => {
  it('correctly classifies real Chrome 5-page pass fixture as 0 issues and 5 passed checks', () => {
    // Exact fixture representation from real Chrome 5-page audit
    const fixtureFindings: StandaloneSeoFinding[] = [
      {
        id: 'f-1',
        auditId: 'audit-fixture',
        ruleId: 'TECH_HTTPS_SECURITY',
        category: 'technical',
        severity: 'info',
        status: 'pass',
        title: 'HTTPS Encryption Enabled',
        description: 'Page is served securely over HTTPS protocol.',
        recommendation: 'Continue maintaining secure TLS/SSL configuration.',
        pageUrl: 'http://127.0.0.1:4321/',
        evidence: { protocol: 'http:' },
      },
      {
        id: 'f-2',
        auditId: 'audit-fixture',
        ruleId: 'TECH_HTTPS_SECURITY',
        category: 'technical',
        severity: 'info',
        status: 'pass',
        title: 'HTTPS Encryption Enabled',
        description: 'Page is served securely over HTTPS protocol.',
        recommendation: 'Continue maintaining secure TLS/SSL configuration.',
        pageUrl: 'http://127.0.0.1:4321/about',
        evidence: { protocol: 'http:' },
      },
      {
        id: 'f-3',
        auditId: 'audit-fixture',
        ruleId: 'TECH_HTTPS_SECURITY',
        category: 'technical',
        severity: 'info',
        status: 'pass',
        title: 'HTTPS Encryption Enabled',
        description: 'Page is served securely over HTTPS protocol.',
        recommendation: 'Continue maintaining secure TLS/SSL configuration.',
        pageUrl: 'http://127.0.0.1:4321/products',
        evidence: { protocol: 'http:' },
      },
      {
        id: 'f-4',
        auditId: 'audit-fixture',
        ruleId: 'TECH_HTTPS_SECURITY',
        category: 'technical',
        severity: 'info',
        status: 'pass',
        title: 'HTTPS Encryption Enabled',
        description: 'Page is served securely over HTTPS protocol.',
        recommendation: 'Continue maintaining secure TLS/SSL configuration.',
        pageUrl: 'http://127.0.0.1:4321/contact',
        evidence: { protocol: 'http:' },
      },
      {
        id: 'f-5',
        auditId: 'audit-fixture',
        ruleId: 'TECH_HTTPS_SECURITY',
        category: 'technical',
        severity: 'info',
        status: 'pass',
        title: 'HTTPS Encryption Enabled',
        description: 'Page is served securely over HTTPS protocol.',
        recommendation: 'Continue maintaining secure TLS/SSL configuration.',
        pageUrl: 'http://127.0.0.1:4321/blog',
        evidence: { protocol: 'http:' },
      },
    ];

    const summary = StandaloneFindingsClassifier.classify(fixtureFindings);

    // REGRESSION ASSERTIONS:
    // UI must NEVER display "SEO Issues (5)" for 5 passed checks!
    expect(summary.totalRecords).toBe(5);
    expect(summary.issueCount).toBe(0);
    expect(summary.passedCount).toBe(5);
    expect(summary.failedCount).toBe(0);
    expect(summary.warningCount).toBe(0);
    expect(summary.notApplicableCount).toBe(0);
    expect(summary.notEvaluatedCount).toBe(0);
    expect(summary.unknownCount).toBe(0);
    expect(summary.distinctRulesEvaluated).toBe(1);
    expect(summary.pagesEvaluated).toBe(5);
  });

  it('correctly aggregates failed and warning findings into issue totals without conflating passed checks', () => {
    const mixedFindings: StandaloneSeoFinding[] = [
      {
        id: 'm-1',
        auditId: 'audit-mixed',
        ruleId: 'ONPAGE_TITLE_TAG',
        category: 'on_page',
        severity: 'critical',
        status: 'fail',
        title: 'Missing Title Tag',
        description: 'No <title> tag was found.',
        recommendation: 'Add a descriptive title tag.',
        pageUrl: 'https://example.com/missing-title',
        evidence: {},
      },
      {
        id: 'm-2',
        auditId: 'audit-mixed',
        ruleId: 'ONPAGE_META_DESCRIPTION',
        category: 'on_page',
        severity: 'high',
        status: 'fail',
        title: 'Missing Meta Description',
        description: 'No meta description found.',
        recommendation: 'Add a meta description.',
        pageUrl: 'https://example.com/missing-meta',
        evidence: {},
      },
      {
        id: 'm-3',
        auditId: 'audit-mixed',
        ruleId: 'ONPAGE_TITLE_LENGTH',
        category: 'on_page',
        severity: 'medium',
        status: 'warning',
        title: 'Title Tag Too Short',
        description: 'Title is only 12 characters.',
        recommendation: 'Expand title to 30-60 characters.',
        pageUrl: 'https://example.com/short-title',
        evidence: {},
      },
      {
        id: 'm-4',
        auditId: 'audit-mixed',
        ruleId: 'TECH_HTTPS_SECURITY',
        category: 'technical',
        severity: 'info',
        status: 'pass',
        title: 'HTTPS Active',
        description: 'TLS active.',
        recommendation: '',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
      {
        id: 'm-5',
        auditId: 'audit-mixed',
        ruleId: 'ONPAGE_H1_PRESENCE',
        category: 'on_page',
        severity: 'low',
        status: 'pass',
        title: 'Single H1 Present',
        description: 'Heading hierarchy correct.',
        recommendation: '',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
    ];

    const summary = StandaloneFindingsClassifier.classify(mixedFindings);

    expect(summary.totalRecords).toBe(5);
    expect(summary.issueCount).toBe(3); // 2 fails + 1 warning
    expect(summary.failedCount).toBe(2);
    expect(summary.warningCount).toBe(1);
    expect(summary.passedCount).toBe(2);
    expect(summary.bySeverity.critical).toBe(1);
    expect(summary.bySeverity.high).toBe(1);
    expect(summary.bySeverity.medium).toBe(1);
    expect(summary.bySeverity.low).toBe(0); // low was passed, so does not count in issue severities
    expect(summary.distinctRulesEvaluated).toBe(5);
    expect(summary.pagesEvaluated).toBe(4);
  });

  it('handles not_applicable, not_evaluated, and unknown statuses gracefully', () => {
    const specialFindings: StandaloneSeoFinding[] = [
      {
        id: 's-1',
        auditId: 'audit-special',
        ruleId: 'SITE_CANONICAL_CONSISTENCY',
        category: 'sitewide',
        severity: 'info',
        status: 'not_applicable',
        title: 'Canonical Consistency N/A',
        description: 'Single page site.',
        recommendation: '',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
      {
        id: 's-2',
        auditId: 'audit-special',
        ruleId: 'TECH_STRUCTURED_DATA_SYNTAX',
        category: 'technical',
        severity: 'info',
        status: 'not_evaluated',
        title: 'JSON-LD Not Evaluated',
        description: 'Scheduled for Phase 2.',
        recommendation: '',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
      {
        id: 's-3',
        auditId: 'audit-special',
        ruleId: 'TECH_SERVER_TIMING',
        category: 'technical',
        severity: 'info',
        status: 'unknown',
        title: 'Server Timing Header Unknown',
        description: 'Header not returned.',
        recommendation: '',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
    ];

    const summary = StandaloneFindingsClassifier.classify(specialFindings);

    expect(summary.issueCount).toBe(0);
    expect(summary.notApplicableCount).toBe(1);
    expect(summary.notEvaluatedCount).toBe(1);
    expect(summary.unknownCount).toBe(1);
    expect(summary.totalRecords).toBe(3);
  });
});
