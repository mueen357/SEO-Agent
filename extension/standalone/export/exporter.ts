/**
 * Client-Side Export Utility.
 * Exports audit data directly as downloadable JSON or CSV files without servers.
 * Implements centralized findings classification and honest score coverage metrics.
 */

import type {
  StandaloneAuditJob,
  StandaloneCrawlPage,
  StandaloneRuleExecutionRecord,
  StandaloneSeoFinding,
  StandaloneTechFinding,
} from '../types';
import { normalizeRobotsEvidence, normalizeSitemapEvidence } from '../types';
import { StandaloneFindingsClassifier } from '../audit/findingsClassifier';

export class StandaloneExporter {
  public static generateJson(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[],
    technologies: StandaloneTechFinding[],
    executionLedger?: StandaloneRuleExecutionRecord[]
  ): string {
    const findingsSummary = StandaloneFindingsClassifier.classify(findings);
    const normRobots = normalizeRobotsEvidence(job.robotsEvidence);
    const normSitemap = normalizeSitemapEvidence(job.sitemapEvidence);

    const data = {
      exportVersion: '2.0.0',
      exportedAt: new Date().toISOString(),
      audit: job,
      robotsEvidence: normRobots,
      sitemapEvidence: normSitemap
        ? {
            sitemaps: normSitemap.sitemaps,
            totalUrls: normSitemap.urls.length,
            errors: normSitemap.errors,
          }
        : undefined,
      linkGraph: job.linkGraph,
      scorecard: job.scorecard,
      scoreCoverage: job.scorecard?.coverage,
      summary: {
        totalPagesCrawled: pages.length,
        totalIssues: findingsSummary.issueCount, // Only failed and warning findings!
        totalPassedChecks: findingsSummary.passedCount,
        totalWarnings: findingsSummary.warningCount,
        totalRecords: findings.length,
        distinctRulesEvaluated: findingsSummary.distinctRulesEvaluated,
        pagesEvaluated: findingsSummary.pagesEvaluated,
        totalTechnologiesDetected: technologies.length,
        distinctExecutionEvaluations: executionLedger ? executionLedger.length : undefined,
        findingsSummary,
      },
      pages: pages.map((p) => ({
        url: p.url,
        requestedUrl: p.requestedUrl,
        finalUrl: p.finalUrl,
        httpStatus: p.httpStatus,
        fetchStatus: p.fetchStatus,
        errorCode: p.errorCode,
        redirectCount: p.redirectCount,
        redirectChain: p.redirectChain,
        redirectLoopDetected: p.redirectLoopDetected,
        title: p.title,
        metaDescription: p.metaDescription,
        canonicalUrl: p.canonicalUrl,
        canonicalCount: p.canonicalCount,
        canonicalHrefs: p.canonicalHrefs,
        headings: p.headings,
        linksCount: p.links.length,
        imagesCount: p.images.length,
        responseTimeMs: p.responseTimeMs,
      })),
      technologies,
      findings,
      executionLedger: executionLedger || [],
    };
    return JSON.stringify(data, null, 2);
  }

  public static exportJson(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[],
    technologies: StandaloneTechFinding[],
    scorecard?: any,
    executionLedger?: any
  ): string {
    const records = executionLedger?.records || (Array.isArray(executionLedger) ? executionLedger : undefined);
    return this.generateJson(job, pages, findings, technologies, records);
  }

  public static generateCsv(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[],
    executionLedger?: StandaloneRuleExecutionRecord[]
  ): string {
    const rows: string[] = [];

    // Header
    rows.push('Type,Page URL,Rule / Status,Severity / HTTP,Title / Evidence,Recommendation');

    // Pages
    for (const p of pages) {
      rows.push(
        [
          'PAGE',
          this.escapeCsv(p.url),
          this.escapeCsv(p.fetchStatus),
          this.escapeCsv(String(p.httpStatus)),
          this.escapeCsv(p.title || 'Untitled'),
          this.escapeCsv(`Response Time: ${p.responseTimeMs}ms`),
        ].join(',')
      );
    }

    // Robots.txt & Sitemap summary rows
    const normRobots = normalizeRobotsEvidence(job.robotsEvidence);
    if (normRobots) {
      rows.push(
        [
          'ROBOTS_TXT',
          this.escapeCsv(normRobots.robotsUrl),
          this.escapeCsv(normRobots.fetchStatus),
          this.escapeCsv(String(normRobots.httpStatus || '')),
          this.escapeCsv(`Policy: ${normRobots.policyOutcome || job.robotsPolicyStatus || 'unspecified'}`),
          this.escapeCsv(`Sitemaps Declared: ${normRobots.sitemapDeclarations.length}`),
        ].join(',')
      );
    }
    const normSitemap = normalizeSitemapEvidence(job.sitemapEvidence);
    if (normSitemap) {
      rows.push(
        [
          'SITEMAP_INDEX',
          this.escapeCsv(job.targetUrl),
          this.escapeCsv(`Discovered: ${normSitemap.sitemaps.length}`),
          this.escapeCsv(`URLs: ${normSitemap.urls.length}`),
          this.escapeCsv(`Errors: ${normSitemap.errors.length}`),
          this.escapeCsv('XML Sitemap Analysis Summary'),
        ].join(',')
      );
    }

    // Findings (Distinguish actual SEO_ISSUE vs SEO_CHECK_PASSED vs SEO_CHECK_NA)
    for (const f of findings) {
      const status = (f.status as string)?.toLowerCase();
      let rowType = 'SEO_CHECK_PASSED';
      if (status === 'fail' || status === 'failed' || status === 'error') {
        rowType = 'SEO_ISSUE';
      } else if (status === 'warning' || status === 'warn') {
        rowType = 'SEO_WARNING';
      } else if (status === 'not_applicable' || status === 'info') {
        rowType = 'SEO_CHECK_NA';
      }

      rows.push(
        [
          rowType,
          this.escapeCsv(f.pageUrl),
          this.escapeCsv(`${f.ruleId} [${f.status.toUpperCase()}]`),
          this.escapeCsv(f.severity),
          this.escapeCsv(f.title),
          this.escapeCsv(f.recommendation),
        ].join(',')
      );
    }

    // Execution Ledger (Authoritative evaluation records)
    if (executionLedger && executionLedger.length > 0) {
      for (const rec of executionLedger) {
        rows.push(
          [
            'RULE_EXECUTION',
            this.escapeCsv(rec.targetUrl),
            this.escapeCsv(`${rec.canonicalRuleId} [${rec.executionStatus.toUpperCase()}]`),
            this.escapeCsv(rec.result.toUpperCase()),
            this.escapeCsv(`Engine: ${rec.engineVersion} | RuleVer: ${rec.ruleVersion}`),
            this.escapeCsv(rec.reason || 'Authoritative rule evaluation completed'),
          ].join(',')
        );
      }
    }

    return rows.join('\r\n');
  }

  public static exportCsv(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[],
    technologies?: StandaloneTechFinding[],
    scorecard?: any,
    executionLedger?: any
  ): string {
    const records = executionLedger?.records || (Array.isArray(executionLedger) ? executionLedger : undefined);
    return this.generateCsv(job, pages, findings, records);
  }

  public static downloadJson(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[],
    technologies: StandaloneTechFinding[],
    executionLedger?: StandaloneRuleExecutionRecord[]
  ): void {
    const jsonString = this.generateJson(job, pages, findings, technologies, executionLedger);
    const blob = new Blob([jsonString], { type: 'application/json' });
    this.triggerDownload(blob, `audit-${job.hostname}-${Date.now()}.json`);
  }

  public static downloadCsv(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[],
    executionLedger?: StandaloneRuleExecutionRecord[]
  ): void {
    const csvContent = this.generateCsv(job, pages, findings, executionLedger);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, `audit-${job.hostname}-${Date.now()}.csv`);
  }

  private static escapeCsv(field?: string | null): string {
    if (!field) return '""';
    const clean = field.replace(/"/g, '""');
    return `"${clean}"`;
  }

  private static triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
