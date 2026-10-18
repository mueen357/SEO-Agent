/**
 * Client-Side SEO Health Scorecard Calculator.
 * Computes deterministic category scores and overall health in-browser.
 */

import type { StandaloneAuditScorecard, StandaloneCrawlPage, StandaloneSeoFinding } from '../types';

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

    // Explicit Evidence Availability Gate:
    // If 0 usable HTML pages were retrieved, never show a normal numeric score or grade!
    if (usablePagesCount === 0) {
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
        calculatedAt: Date.now(),
      };
    }

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
      totalIssuesCount: criticalCount + highCount + mediumCount + lowCount,
      criticalIssuesCount: criticalCount,
      highIssuesCount: highCount,
      mediumIssuesCount: mediumCount,
      lowIssuesCount: lowCount,
      calculatedAt: Date.now(),
    };
  }
}
