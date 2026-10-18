/**
 * Client-Side Export Utility.
 * Exports audit data directly as downloadable JSON or CSV files without servers.
 */

import type {
  StandaloneAuditJob,
  StandaloneCrawlPage,
  StandaloneSeoFinding,
  StandaloneTechFinding,
} from '../types';

export class StandaloneExporter {
  public static generateJson(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[],
    technologies: StandaloneTechFinding[]
  ): string {
    const data = {
      exportVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      audit: job,
      scorecard: job.scorecard,
      summary: {
        totalPagesCrawled: pages.length,
        totalIssues: findings.length,
        totalTechnologiesDetected: technologies.length,
      },
      pages: pages.map((p) => ({
        url: p.url,
        httpStatus: p.httpStatus,
        fetchStatus: p.fetchStatus,
        title: p.title,
        metaDescription: p.metaDescription,
        canonicalUrl: p.canonicalUrl,
        headings: p.headings,
        linksCount: p.links.length,
        imagesCount: p.images.length,
        responseTimeMs: p.responseTimeMs,
      })),
      technologies,
      findings,
    };
    return JSON.stringify(data, null, 2);
  }

  public static generateCsv(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[]
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

    // Issues
    for (const f of findings) {
      rows.push(
        [
          'SEO_ISSUE',
          this.escapeCsv(f.pageUrl),
          this.escapeCsv(f.ruleId),
          this.escapeCsv(f.severity),
          this.escapeCsv(f.title),
          this.escapeCsv(f.recommendation),
        ].join(',')
      );
    }

    return rows.join('\n');
  }

  public static downloadJson(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[],
    technologies: StandaloneTechFinding[]
  ): void {
    const jsonString = this.generateJson(job, pages, findings, technologies);
    const blob = new Blob([jsonString], { type: 'application/json' });
    this.triggerDownload(blob, `audit-${job.hostname}-${Date.now()}.json`);
  }

  public static downloadCsv(
    job: StandaloneAuditJob,
    pages: StandaloneCrawlPage[],
    findings: StandaloneSeoFinding[]
  ): void {
    const csvContent = this.generateCsv(job, pages, findings);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    this.triggerDownload(blob, `audit-${job.hostname}-${Date.now()}.csv`);
  }

  private static escapeCsv(field: string): string {
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
