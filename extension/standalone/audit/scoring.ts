/**
 * Client-Side SEO Health Scorecard & Coverage Calculator.
 * Computes deterministic category scores, findings classification, and honest coverage in-browser.
 * Uses Canonical Rule Manifest and Authoritative Execution Ledger.
 */

import type {
  StandaloneAuditScorecard,
  StandaloneCrawlPage,
  StandaloneExecutionLedger,
  StandaloneRuleExecutionRecord,
  StandaloneScoreCoverage,
  StandaloneScoreState,
  StandaloneSeoFinding,
} from '../types';
import { StandaloneFindingsClassifier } from './findingsClassifier';
import {
  CANONICAL_51_RULES,
  CANONICAL_IMPLEMENTED_RULES,
  getCanonicalRuleCategory,
  migrateLegacyFinding,
} from './ruleMapping';

export const CANONICAL_RULE_TOTALS = {
  on_page: CANONICAL_51_RULES.on_page.length, // 16
  technical: CANONICAL_51_RULES.technical.length, // 22
  sitewide: CANONICAL_51_RULES.sitewide.length, // 13
  total: 51,
};

export class StandaloneScoringCalculator {
  public static readonly POLICY_VERSION = '2.0.0-standalone';

  public static calculate(
    rawFindings: StandaloneSeoFinding[],
    pages: StandaloneCrawlPage[] | number,
    executionLedgerOrAttempted?: StandaloneExecutionLedger | StandaloneRuleExecutionRecord[] | number,
    legacyAttemptedCount?: number
  ): StandaloneAuditScorecard {
    let usablePagesCount = 0;
    let attemptedPagesCount = 0;
    let failedPagesCount = 0;

    if (Array.isArray(pages)) {
      attemptedPagesCount = pages.length;
      usablePagesCount = pages.filter(
        (p) =>
          p.fetchStatus === 'success' &&
          p.httpStatus >= 200 &&
          p.httpStatus < 400 &&
          (p.contentTypeCategory === 'HTML_DOCUMENT' ||
            (!p.contentTypeCategory && (p.headers?.['content-type']?.includes('text/html') ?? true)))
      ).length;
      failedPagesCount = pages.filter(
        (p) => p.fetchStatus !== 'success' || p.httpStatus === 0 || p.httpStatus >= 400
      ).length;
    } else {
      usablePagesCount = pages;
      if (typeof executionLedgerOrAttempted === 'number') {
        attemptedPagesCount = executionLedgerOrAttempted;
      } else {
        attemptedPagesCount = legacyAttemptedCount ?? pages;
      }
      failedPagesCount = Math.max(0, attemptedPagesCount - usablePagesCount);
    }

    // Determine execution ledger if provided
    let executionLedger: StandaloneRuleExecutionRecord[] | undefined = undefined;
    if (Array.isArray(executionLedgerOrAttempted)) {
      executionLedger = executionLedgerOrAttempted;
    } else if (
      executionLedgerOrAttempted &&
      typeof executionLedgerOrAttempted === 'object' &&
      'records' in executionLedgerOrAttempted
    ) {
      executionLedger = (executionLedgerOrAttempted as StandaloneExecutionLedger).records;
    }

    // Adapt any historical legacy findings to canonical IDs for scoring
    const canonicalFindings: StandaloneSeoFinding[] = [];
    for (const f of rawFindings) {
      canonicalFindings.push(...migrateLegacyFinding(f));
    }

    const summary = StandaloneFindingsClassifier.classify(canonicalFindings);

    // Track executed canonical rules by family
    const executedRulesByFamily: Record<'on_page' | 'technical' | 'sitewide', Set<string>> = {
      on_page: new Set<string>(),
      technical: new Set<string>(),
      sitewide: new Set<string>(),
    };

    let passedChecksCount = 0;
    let failedChecksCount = 0;
    let warningChecksCount = 0;
    let notApplicableChecksCount = 0;
    let unknownChecksCount = 0;

    if (executionLedger && executionLedger.length > 0) {
      // Authoritative Ledger-based Coverage Calculation
      const distinctNotApplicableRules = new Set<string>();

      for (const record of executionLedger) {
        const cat = getCanonicalRuleCategory(record.canonicalRuleId);
        const status = record.executionStatus;

        if (status === 'executed_pass') {
          passedChecksCount++;
          if (cat !== 'unknown') executedRulesByFamily[cat].add(record.canonicalRuleId);
        } else if (status === 'executed_fail') {
          failedChecksCount++;
          if (cat !== 'unknown') executedRulesByFamily[cat].add(record.canonicalRuleId);
        } else if (status === 'executed_warning') {
          warningChecksCount++;
          if (cat !== 'unknown') executedRulesByFamily[cat].add(record.canonicalRuleId);
        } else if (status === 'not_applicable') {
          notApplicableChecksCount++;
          distinctNotApplicableRules.add(record.canonicalRuleId);
        } else if (status === 'unknown') {
          unknownChecksCount++;
        }
      }
    } else {
      // Fallback for callers that only pass findings (legacy or test mocks)
      for (const f of canonicalFindings) {
        if (!f.ruleId) continue;
        const cat = getCanonicalRuleCategory(f.ruleId);
        if (cat !== 'unknown') {
          executedRulesByFamily[cat].add(f.ruleId);
        }
      }
      passedChecksCount = summary.passedCount;
      failedChecksCount = summary.failedCount;
      warningChecksCount = summary.warningCount;
      notApplicableChecksCount = summary.notApplicableCount;
      unknownChecksCount = summary.unknownCount;
    }

    const executedOnPage = executedRulesByFamily.on_page.size;
    const executedTech = executedRulesByFamily.technical.size;
    const executedSite = executedRulesByFamily.sitewide.size;
    const executedRulesTotal = executedOnPage + executedTech + executedSite;
    const distinctExecutedCanonicalRules = [
      ...Array.from(executedRulesByFamily.on_page),
      ...Array.from(executedRulesByFamily.technical),
      ...Array.from(executedRulesByFamily.sitewide),
    ];
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
        implementedRulesCount: CANONICAL_IMPLEMENTED_RULES.size, // 14
        executedRulesTotal: 0,
        applicableRulesCount: 0,
        missingRulesTotal: CANONICAL_RULE_TOTALS.total,
        passedRulesCount: 0,
        failedRulesCount: 0,
        warningRulesCount: 0,
        notApplicableRulesCount: 0,
        notEvaluatedRulesCount: CANONICAL_RULE_TOTALS.total,
        unavailableEvidenceCount: attemptedPagesCount,
        passedChecksCount: 0,
        failedChecksCount: 0,
        warningChecksCount: 0,
        unknownCount: attemptedPagesCount,
        familyCoverage: {
          on_page: { executed: 0, total: CANONICAL_RULE_TOTALS.on_page, ratio: 0 },
          technical: { executed: 0, total: CANONICAL_RULE_TOTALS.technical, ratio: 0 },
          sitewide: { executed: 0, total: CANONICAL_RULE_TOTALS.sitewide, ratio: 0 },
        },
        policyVersion: this.POLICY_VERSION,
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
        scoringVersion: this.POLICY_VERSION,
        calculatedAt: Date.now(),
      };
    }

    let onPageDeduction = 0;
    let technicalDeduction = 0;
    let sitewideDeduction = 0;

    for (const f of canonicalFindings) {
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

      const cat = f.category || getCanonicalRuleCategory(f.ruleId);
      if (cat === 'on_page') onPageDeduction += pts;
      else if (cat === 'technical') technicalDeduction += pts;
      else if (cat === 'sitewide') sitewideDeduction += pts;
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

    // Coverage State classification:
    // Reserve FULLY EVALUATED strictly for when all 51 canonical rules were completed (or legitimate N/A)
    // Use SUBSTANTIAL COVERAGE for >= 80% coverage
    // Use PROVISIONAL for partial evaluation
    let scoreState: StandaloneScoreState = 'provisional';
    let scoreStateLabel = `Provisional (${executedRulesTotal}/${CANONICAL_RULE_TOTALS.total} Rules Evaluated)`;

    if (executedRulesTotal >= CANONICAL_RULE_TOTALS.total) {
      scoreState = 'fully_evaluated';
      scoreStateLabel = 'Fully Evaluated (51/51 Rules Completed)';
    } else if (
      coverageRatio >= 0.8 &&
      familyCoverage.on_page.ratio >= 0.8 &&
      familyCoverage.technical.ratio >= 0.8 &&
      familyCoverage.sitewide.ratio >= 0.8
    ) {
      scoreState = 'substantial_coverage';
      scoreStateLabel = `Substantial Coverage (${executedRulesTotal}/${CANONICAL_RULE_TOTALS.total} Rules Evaluated)`;
    }

    const coverage: StandaloneScoreCoverage = {
      scoreState,
      scoreStateLabel,
      coverageRatio,
      expectedRulesTotal: CANONICAL_RULE_TOTALS.total,
      implementedRulesCount: CANONICAL_IMPLEMENTED_RULES.size, // 14
      executedRulesTotal,
      distinctExecutedCanonicalRules,
      applicableRulesCount: Math.max(executedRulesTotal, CANONICAL_IMPLEMENTED_RULES.size),
      missingRulesTotal: Math.max(0, CANONICAL_RULE_TOTALS.total - executedRulesTotal),
      passedRulesCount: summary.passedCount,
      failedRulesCount: summary.failedCount,
      warningRulesCount: summary.warningCount,
      notApplicableRulesCount: notApplicableChecksCount,
      notEvaluatedRulesCount: Math.max(0, CANONICAL_RULE_TOTALS.total - executedRulesTotal),
      unavailableEvidenceCount: 0,
      passedChecksCount,
      failedChecksCount,
      warningChecksCount,
      unknownCount: unknownChecksCount,
      familyCoverage,
      policyVersion: this.POLICY_VERSION,
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
      scoringVersion: this.POLICY_VERSION,
      calculatedAt: Date.now(),
    };
  }
}
