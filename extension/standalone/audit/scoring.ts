/**
 * Client-Side SEO Health Scorecard & Coverage Calculator.
 * Computes deterministic category scores, findings classification, and honest coverage in-browser.
 */

import type {
  StandaloneAuditScorecard,
  StandaloneCrawlPage,
  StandaloneScoreCoverage,
  StandaloneScoreState,
  StandaloneSeoFinding,
} from '../types';
import { StandaloneFindingsClassifier } from './findingsClassifier';

export const CANONICAL_RULE_TOTALS = {
  on_page: 16,
  technical: 22,
  sitewide: 13,
  total: 51,
};

export class StandaloneScoringCalculator {
  public static calculate(
    findings: StandaloneSeoFinding[],
    pages: StandaloneCrawlPage[] | number,
    attemptedCount?: number
  ): StandaloneAuditScorecard {
    let usablePagesCount = 0;
    let attemptedPagesCount = 0;
    let failedPagesCount = 0;

    if (Array.isArray(pages)) {
      attemptedPagesCount = pages.length;
      usablePagesCount = pages.filter(
        (p) => p.fetchStatus === 'success' && p.httpStatus >= 200 && p.httpStatus < 400
      ).length;
      failedPagesCount = pages.filter(
        (p) => p.fetchStatus !== 'success' || p.httpStatus === 0 || p.httpStatus >= 400
      ).length;
    } else {
      usablePagesCount = pages;
      attemptedPagesCount = attemptedCount ?? pages;
      failedPagesCount = Math.max(0, attemptedPagesCount - usablePagesCount);
    }

    const summary = StandaloneFindingsClassifier.classify(findings);

    // Compute distinct executed rules per canonical scoring family
    const executedRulesByFamily: Record<'on_page' | 'technical' | 'sitewide', Set<string>> = {
      on_page: new Set<string>(),
      technical: new Set<string>(),
      sitewide: new Set<string>(),
    };

    for (const f of findings) {
      if (!f.ruleId) continue;
      const cat = f.category as 'on_page' | 'technical' | 'sitewide';
      if (cat in executedRulesByFamily) {
        executedRulesByFamily[cat].add(f.ruleId);
      }
    }

    const executedOnPage = executedRulesByFamily.on_page.size;
    const executedTech = executedRulesByFamily.technical.size;
    const executedSite = executedRulesByFamily.sitewide.size;
    const executedRulesTotal = summary.distinctRulesEvaluated;
    const coverageRatio = Number((executedRulesTotal / CANONICAL_RULE_TOTALS.total).toFixed(3));

    // Rule family coverage breakdown
    const familyCoverage = {
      on_page: {
        executed: executedOnPage,
        total: CANONICAL_RULE_TOTALS.on_page,
        ratio: Number((executedOnPage / CANONICAL_RULE_TOTALS.on_page).toFixed(3)),
      },
      technical: {
        executed: executedTech,
        total: CANONICAL_RULE_TOTALS.technical,
        ratio: Number((executedTech / CANONICAL_RULE_TOTALS.technical).toFixed(3)),
      },
      sitewide: {
        executed: executedSite,
        total: CANONICAL_RULE_TOTALS.sitewide,
        ratio: Number((executedSite / CANONICAL_RULE_TOTALS.sitewide).toFixed(3)),
      },
    };

    // Explicit Evidence Availability Gate:
    // If 0 usable HTML pages were retrieved, never show a normal numeric score or grade!
    if (usablePagesCount === 0) {
      const unavailableCoverage: StandaloneScoreCoverage = {
        scoreState: 'unavailable',
        scoreStateLabel: 'Unavailable (Insufficient Evidence)',
        coverageRatio: 0,
        expectedRulesTotal: CANONICAL_RULE_TOTALS.total,
        implementedRulesCount: 9, // Core standalone rules implemented
        executedRulesTotal: 0,
        missingRulesTotal: CANONICAL_RULE_TOTALS.total,
        passedRulesCount: 0,
        failedRulesCount: 0,
        warningRulesCount: 0,
        notApplicableRulesCount: 0,
        notEvaluatedRulesCount: CANONICAL_RULE_TOTALS.total,
        unavailableEvidenceCount: attemptedPagesCount,
        familyCoverage: {
          on_page: { executed: 0, total: CANONICAL_RULE_TOTALS.on_page, ratio: 0 },
          technical: { executed: 0, total: CANONICAL_RULE_TOTALS.technical, ratio: 0 },
          sitewide: { executed: 0, total: CANONICAL_RULE_TOTALS.sitewide, ratio: 0 },
        },
        policyVersion: '2.4.0-standalone',
      };

      return {
        overallScore: null,
        grade: 'N/A',
        available: false,
        reason: 'Crawl failed / insufficient evidence',
        onPageScore: null,
        technicalScore: null,
        sitewideScore: null,
        pagesCrawled: 0,
        usablePagesCount: 0,
        attemptedPagesCount,
        failedPagesCount,
        totalIssuesCount: 0,
        criticalIssuesCount: 0,
        highIssuesCount: 0,
        mediumIssuesCount: 0,
        lowIssuesCount: 0,
        coverage: unavailableCoverage,
        scoringVersion: '2.4.0-standalone',
        calculatedAt: Date.now(),
      };
    }

    let onPageDeduction = 0;
    let technicalDeduction = 0;
    let sitewideDeduction = 0;

    for (const f of findings) {
      const status = (f.status as string)?.toLowerCase();
      if (status === 'pass' || status === 'passed' || status === 'not_applicable' || status === 'info') {
        continue;
      }

      let pts = 0;
      if (f.severity === 'critical') pts = 25;
      else if (f.severity === 'high') pts = 15;
      else if (f.severity === 'medium') pts = 8;
      else pts = 3;

      // Warnings take half deduction
      if (status === 'warning' || status === 'warn') {
        pts = Math.round(pts * 0.5);
      }

      if (f.category === 'on_page') onPageDeduction += pts;
      else if (f.category === 'technical') technicalDeduction += pts;
      else if (f.category === 'sitewide') sitewideDeduction += pts;
    }

    // Category scores clamped 0 to 100
    const onPageScore = Math.max(0, Math.min(100, Math.round(100 - onPageDeduction)));
    const technicalScore = Math.max(0, Math.min(100, Math.round(100 - technicalDeduction)));

    // Sitewide availability gate: if fewer than 3 pages crawled, sitewide score is capped at 75 (insufficient evidence)
    let sitewideScore = Math.max(0, Math.min(100, Math.round(100 - sitewideDeduction)));
    if (usablePagesCount < 3) {
      sitewideScore = Math.min(sitewideScore, 75);
    }

    // Weighted composite: OnPage (35%), Technical (40%), SiteWide (25%) aligned with backend policy
    const overallScore = Math.round(
      onPageScore * 0.35 + technicalScore * 0.4 + sitewideScore * 0.25
    );

    let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
    if (overallScore >= 90) grade = 'A';
    else if (overallScore >= 80) grade = 'B';
    else if (overallScore >= 70) grade = 'C';
    else if (overallScore >= 60) grade = 'D';

    // Coverage State classification
    const isFullyEvaluated =
      coverageRatio >= 0.8 &&
      familyCoverage.on_page.ratio >= 0.8 &&
      familyCoverage.technical.ratio >= 0.8 &&
      familyCoverage.sitewide.ratio >= 0.8;

    const scoreState: StandaloneScoreState = isFullyEvaluated ? 'fully_evaluated' : 'provisional';
    const scoreStateLabel = isFullyEvaluated
      ? 'Fully Evaluated'
      : `Provisional (${executedRulesTotal}/${CANONICAL_RULE_TOTALS.total} Rules Evaluated)`;

    const coverage: StandaloneScoreCoverage = {
      scoreState,
      scoreStateLabel,
      coverageRatio,
      expectedRulesTotal: CANONICAL_RULE_TOTALS.total,
      implementedRulesCount: 9,
      executedRulesTotal,
      missingRulesTotal: Math.max(0, CANONICAL_RULE_TOTALS.total - executedRulesTotal),
      passedRulesCount: summary.passedCount,
      failedRulesCount: summary.failedCount,
      warningRulesCount: summary.warningCount,
      notApplicableRulesCount: summary.notApplicableCount,
      notEvaluatedRulesCount: Math.max(0, CANONICAL_RULE_TOTALS.total - executedRulesTotal),
      unavailableEvidenceCount: 0,
      familyCoverage,
      policyVersion: '2.4.0-standalone',
    };

    return {
      overallScore,
      grade,
      available: true,
      onPageScore,
      technicalScore,
      sitewideScore,
      pagesCrawled: usablePagesCount,
      usablePagesCount,
      attemptedPagesCount,
      failedPagesCount,
      totalIssuesCount: summary.issueCount,
      criticalIssuesCount: summary.bySeverity.critical,
      highIssuesCount: summary.bySeverity.high,
      mediumIssuesCount: summary.bySeverity.medium,
      lowIssuesCount: summary.bySeverity.low,
      coverage,
      scoringVersion: '2.4.0-standalone',
      calculatedAt: Date.now(),
    };
  }
}
