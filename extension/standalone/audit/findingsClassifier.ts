/**
 * Centralized SEO Findings Classification and Counting Engine.
 * 
 * Separates raw finding records from:
 * - Actual SEO issues (failed + warning findings)
 * - Passed checks
 * - Not-applicable checks
 * - Unknown / Not-evaluated checks
 * - Distinct evaluated rules
 * - Affected pages
 */

import type { StandaloneFindingsSummary, StandaloneSeoFinding } from '../types';

export class StandaloneFindingsClassifier {
  public static classify(findings: StandaloneSeoFinding[]): StandaloneFindingsSummary {
    const distinctRules = new Set<string>();
    const distinctPages = new Set<string>();

    let failedCount = 0;
    let warningCount = 0;
    let passedCount = 0;
    let notApplicableCount = 0;
    let unknownCount = 0;
    let notEvaluatedCount = 0;

    const bySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const f of findings) {
      if (f.ruleId) distinctRules.add(f.ruleId);
      if (f.pageUrl) distinctPages.add(f.pageUrl);

      const status = (f.status as string)?.toLowerCase();
      if (status === 'fail' || status === 'failed' || status === 'error') {
        failedCount++;
        if (f.severity && f.severity in bySeverity) {
          bySeverity[f.severity as keyof typeof bySeverity]++;
        }
      } else if (status === 'warning' || status === 'warn') {
        warningCount++;
        if (f.severity && f.severity in bySeverity) {
          bySeverity[f.severity as keyof typeof bySeverity]++;
        }
      } else if (status === 'pass' || status === 'passed') {
        passedCount++;
      } else if (status === 'not_applicable' || status === 'na' || status === 'info') {
        notApplicableCount++;
      } else if (status === 'not_evaluated') {
        notEvaluatedCount++;
      } else {
        // 'unknown' or unrecognized status
        unknownCount++;
      }
    }

    // Explicit severity policy: Only failed and warning findings contribute to issue totals
    const issueCount = failedCount + warningCount;

    return {
      totalRecords: findings.length,
      distinctRulesEvaluated: distinctRules.size,
      pagesEvaluated: distinctPages.size,
      issueCount,
      failedCount,
      warningCount,
      passedCount,
      notApplicableCount,
      unknownCount,
      notEvaluatedCount,
      bySeverity,
    };
  }
}
