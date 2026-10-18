/**
 * Client-Side SEO Health Scorecard Calculator.
 * Computes deterministic category scores and overall health in-browser.
 */

import type { StandaloneAuditScorecard, StandaloneSeoFinding } from '../types';

export class StandaloneScoringCalculator {
  public static calculate(
    findings: StandaloneSeoFinding[],
    pagesCrawled: number
  ): StandaloneAuditScorecard {
    let onPageDeduction = 0;
    let technicalDeduction = 0;
    let sitewideDeduction = 0;

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    for (const f of findings) {
      if (f.status === 'pass') continue;

      let pts = 0;
      if (f.severity === 'critical') {
        pts = 25;
        criticalCount++;
      } else if (f.severity === 'high') {
        pts = 15;
        highCount++;
      } else if (f.severity === 'medium') {
        pts = 8;
        mediumCount++;
      } else {
        pts = 3;
        lowCount++;
      }

      if (f.category === 'on_page') {
        onPageDeduction += pts;
      } else if (f.category === 'technical') {
        technicalDeduction += pts;
      } else if (f.category === 'sitewide') {
        sitewideDeduction += pts;
      }
    }

    // Category scores clamped 0 to 100
    const onPageScore = Math.max(0, Math.min(100, Math.round(100 - onPageDeduction)));
    const technicalScore = Math.max(0, Math.min(100, Math.round(100 - technicalDeduction)));

    // Sitewide availability gate: if only 1 page crawled, sitewide score is capped at 70 (insufficient evidence)
    let sitewideScore = Math.max(0, Math.min(100, Math.round(100 - sitewideDeduction)));
    if (pagesCrawled < 3) {
      sitewideScore = Math.min(sitewideScore, 75);
    }

    if (pagesCrawled === 0) {
      return {
        overallScore: 0,
        grade: 'F',
        available: false,
        onPageScore: 0,
        technicalScore: 0,
        sitewideScore: 0,
        pagesCrawled: 0,
        totalIssuesCount: 0,
        criticalIssuesCount: 0,
        highIssuesCount: 0,
        mediumIssuesCount: 0,
        lowIssuesCount: 0,
        calculatedAt: Date.now(),
      };
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

    return {
      overallScore,
      grade,
      available: true,
      onPageScore,
      technicalScore,
      sitewideScore,
      pagesCrawled,
      totalIssuesCount: criticalCount + highCount + mediumCount + lowCount,
      criticalIssuesCount: criticalCount,
      highIssuesCount: highCount,
      mediumIssuesCount: mediumCount,
      lowIssuesCount: lowCount,
      calculatedAt: Date.now(),
    };
  }
}
