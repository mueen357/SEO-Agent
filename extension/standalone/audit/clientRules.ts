/**
 * Client-Side SEO Rules Engine.
 * Evaluates Core On-Page, Technical, and Site-Wide SEO Rules in-browser.
 * Uses Canonical Rule Manifest IDs and generates an Authoritative Execution Ledger.
 */

import type {
  StandaloneCrawlPage,
  StandaloneExecutionLedger,
  StandaloneRuleExecutionRecord,
  StandaloneSeoFinding,
} from '../types';

export interface PageEvaluationResult {
  findings: StandaloneSeoFinding[];
  ledgerRecords: StandaloneRuleExecutionRecord[];
  ledger?: StandaloneExecutionLedger;
}

export class StandaloneRulesEngine {
  private static readonly ENGINE_VERSION = '2.0.0';
  private static readonly RULE_VERSION = '1.0.0';

  private static isLoopbackHost(urlStr: string): boolean {
    try {
      const h = new URL(urlStr).hostname.toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === '::1';
    } catch {
      return false;
    }
  }

  /**
   * Evaluates page-level canonical SEO rules and records complete execution state in the ledger.
   */
  public static evaluatePageDetailed(
    page: StandaloneCrawlPage,
    auditId: string
  ): PageEvaluationResult {
    const findings: StandaloneSeoFinding[] = [];
    const ledgerRecords: StandaloneRuleExecutionRecord[] = [];
    const now = Date.now();

    const isUsableHtml =
      page.fetchStatus === 'success' &&
      page.httpStatus >= 200 &&
      page.httpStatus < 400;

    // Helper to push a ledger record
    const recordLedger = (
      canonicalRuleId: string,
      executionStatus: StandaloneRuleExecutionRecord['executionStatus'],
      result: StandaloneRuleExecutionRecord['result'],
      evidenceAvailable: boolean,
      reason?: string
    ) => {
      ledgerRecords.push({
        id: `${auditId}-${page.id}-${canonicalRuleId}`,
        auditId,
        canonicalRuleId,
        ruleVersion: this.RULE_VERSION,
        scope: 'page',
        targetUrl: page.url,
        executionStatus,
        result,
        evidenceAvailable,
        reason,
        executedAt: now,
        engineVersion: this.ENGINE_VERSION,
      });
    };

    // Gate: Inaccessible pages or failed fetches (httpStatus 0 or >= 400)
    if (!isUsableHtml) {
      if (page.httpStatus >= 400 && page.httpStatus < 500) {
        recordLedger('TECH_HTTP_4XX', 'executed_fail', 'fail', true, `HTTP ${page.httpStatus} Client Error`);
        recordLedger('TECH_HTTP_5XX', 'executed_pass', 'pass', true);
        findings.push({
          id: `${auditId}-${page.id}-http-4xx`,
          auditId,
          ruleId: 'TECH_HTTP_4XX',
          category: 'technical',
          severity: 'high',
          status: 'fail',
          title: `HTTP ${page.httpStatus} Client Error`,
          description: `The page returned a 4xx client error status code: ${page.httpStatus}.`,
          recommendation: 'Update broken internal links or fix resource configuration.',
          pageUrl: page.url,
          evidence: { httpStatus: page.httpStatus },
        });
      } else if (page.httpStatus >= 500) {
        recordLedger('TECH_HTTP_4XX', 'executed_pass', 'pass', true);
        recordLedger('TECH_HTTP_5XX', 'executed_fail', 'fail', true, `HTTP ${page.httpStatus} Server Error`);
        findings.push({
          id: `${auditId}-${page.id}-http-5xx`,
          auditId,
          ruleId: 'TECH_HTTP_5XX',
          category: 'technical',
          severity: 'critical',
          status: 'fail',
          title: `HTTP ${page.httpStatus} Server Error`,
          description: `The page returned a 5xx server error status code: ${page.httpStatus}.`,
          recommendation: 'Investigate web server logs, application crashes, or upstream gateway errors.',
          pageUrl: page.url,
          evidence: { httpStatus: page.httpStatus },
        });
      } else {
        // httpStatus 0 (network fetch error)
        recordLedger(
          'TECH_HTTP_4XX',
          'unknown',
          'unknown',
          false,
          page.errorMessage || 'Fetch failed without HTTP response'
        );
        recordLedger(
          'TECH_HTTP_5XX',
          'unknown',
          'unknown',
          false,
          page.errorMessage || 'Fetch failed without HTTP response'
        );
      }

      // Inaccessible pages or failed fetches: do NOT report missing title, missing H1, missing canonical!
      const unreachedRules = [
        'TECH_HTTPS_USAGE',
        'ONPAGE_TITLE_PRESENT',
        'ONPAGE_TITLE_LENGTH',
        'ONPAGE_META_DESC_PRESENT',
        'ONPAGE_META_DESC_LENGTH',
        'ONPAGE_H1_PRESENCE',
        'ONPAGE_H1_MULTIPLE',
        'ONPAGE_CANONICAL_PRESENCE',
        'ONPAGE_CANONICAL_VALID',
        'ONPAGE_IMAGE_ALT_MISSING',
      ];
      for (const rId of unreachedRules) {
        recordLedger(
          rId,
          'not_evaluated',
          'unknown',
          false,
          'Page fetch failed or returned non-HTML error status; content evidence unavailable'
        );
      }
      return { findings, ledgerRecords };
    }

    // Usable HTML Pages: Both HTTP status rules passed
    recordLedger('TECH_HTTP_4XX', 'executed_pass', 'pass', true);
    recordLedger('TECH_HTTP_5XX', 'executed_pass', 'pass', true);

    // 2. HTTPS Security Protocol (TECH_HTTPS_USAGE)
    if (page.url.startsWith('https://')) {
      recordLedger('TECH_HTTPS_USAGE', 'executed_pass', 'pass', true);
    } else if (this.isLoopbackHost(page.url)) {
      // Local development loopback host: permitted for authorized local test fixtures
      recordLedger(
        'TECH_HTTPS_USAGE',
        'executed_pass',
        'pass',
        true,
        'Authorized local development loopback fixture permitted over HTTP'
      );
      findings.push({
        id: `${auditId}-${page.id}-https-local-dev`,
        auditId,
        ruleId: 'TECH_HTTPS_USAGE',
        category: 'technical',
        severity: 'low',
        status: 'pass',
        title: 'Local Development Fixture (HTTP Permitted)',
        description: 'Local development and test loopback host is permitted over HTTP for authorized fixtures.',
        recommendation: 'Ensure HTTPS is configured with SSL/TLS certificates when deploying to a public production domain.',
        pageUrl: page.url,
        evidence: { protocol: 'http', environment: 'local_development' },
      });
    } else {
      recordLedger('TECH_HTTPS_USAGE', 'executed_fail', 'fail', true, 'Served over unencrypted HTTP');
      findings.push({
        id: `${auditId}-${page.id}-https-insecure`,
        auditId,
        ruleId: 'TECH_HTTPS_USAGE',
        category: 'technical',
        severity: 'critical',
        status: 'fail',
        title: 'Insecure HTTP Protocol',
        description: 'The page is served over unencrypted HTTP.',
        recommendation: 'Enforce HTTPS across all pages with an SSL/TLS certificate and HSTS.',
        pageUrl: page.url,
        evidence: { protocol: 'http' },
      });
    }

    // 3. Title Tag Presence & Length (ONPAGE_TITLE_PRESENT, ONPAGE_TITLE_LENGTH)
    if (!page.title || page.title.trim() === '') {
      recordLedger('ONPAGE_TITLE_PRESENT', 'executed_fail', 'fail', true, 'Missing <title> tag');
      recordLedger('ONPAGE_TITLE_LENGTH', 'not_applicable', 'na', false, 'No title tag present to measure length');
      findings.push({
        id: `${auditId}-${page.id}-title-missing`,
        auditId,
        ruleId: 'ONPAGE_TITLE_PRESENT',
        category: 'on_page',
        severity: 'critical',
        status: 'fail',
        title: 'Missing Page Title Tag',
        description: 'The page does not contain a <title> element.',
        recommendation: 'Add a descriptive, unique <title> tag between 30 and 60 characters.',
        pageUrl: page.url,
        evidence: { title: null },
      });
    } else {
      recordLedger('ONPAGE_TITLE_PRESENT', 'executed_pass', 'pass', true);
      const len = page.title.length;
      if (len < 30 || len > 60) {
        recordLedger(
          'ONPAGE_TITLE_LENGTH',
          'executed_warning',
          'warning',
          true,
          `Title length ${len} chars outside ideal range 30-60`
        );
        findings.push({
          id: `${auditId}-${page.id}-title-length`,
          auditId,
          ruleId: 'ONPAGE_TITLE_LENGTH',
          category: 'on_page',
          severity: 'medium',
          status: 'warning',
          title: len < 30 ? 'Title Tag is Too Short' : 'Title Tag is Too Long',
          description: `Title tag length is ${len} characters. Ideal length is 30 to 60 characters.`,
          recommendation: 'Refactor title tag to be between 30 and 60 characters to optimize SERP display.',
          pageUrl: page.url,
          evidence: { title: page.title, length: len },
        });
      } else {
        recordLedger('ONPAGE_TITLE_LENGTH', 'executed_pass', 'pass', true);
      }
    }

    // 4. Meta Description Presence & Length (ONPAGE_META_DESC_PRESENT, ONPAGE_META_DESC_LENGTH)
    if (!page.metaDescription || page.metaDescription.trim() === '') {
      recordLedger('ONPAGE_META_DESC_PRESENT', 'executed_fail', 'fail', true, 'Missing meta description tag');
      recordLedger(
        'ONPAGE_META_DESC_LENGTH',
        'not_applicable',
        'na',
        false,
        'No meta description present to measure length'
      );
      findings.push({
        id: `${auditId}-${page.id}-desc-missing`,
        auditId,
        ruleId: 'ONPAGE_META_DESC_PRESENT',
        category: 'on_page',
        severity: 'high',
        status: 'fail',
        title: 'Missing Meta Description',
        description: 'The page is missing a meta description tag.',
        recommendation: 'Add a compelling meta description between 70 and 160 characters.',
        pageUrl: page.url,
        evidence: { metaDescription: null },
      });
    } else {
      recordLedger('ONPAGE_META_DESC_PRESENT', 'executed_pass', 'pass', true);
      const len = page.metaDescription.length;
      if (len < 70 || len > 160) {
        recordLedger(
          'ONPAGE_META_DESC_LENGTH',
          'executed_warning',
          'warning',
          true,
          `Meta description length ${len} chars outside ideal range 70-160`
        );
        findings.push({
          id: `${auditId}-${page.id}-desc-length`,
          auditId,
          ruleId: 'ONPAGE_META_DESC_LENGTH',
          category: 'on_page',
          severity: 'low',
          status: 'warning',
          title: len < 70 ? 'Meta Description is Too Short' : 'Meta Description is Too Long',
          description: `Meta description length is ${len} characters. Ideal range is 70 to 160 characters.`,
          recommendation: 'Adjust description length to prevent truncation in search results.',
          pageUrl: page.url,
          evidence: { metaDescription: page.metaDescription, length: len },
        });
      } else {
        recordLedger('ONPAGE_META_DESC_LENGTH', 'executed_pass', 'pass', true);
      }
    }

    // 5. H1 Presence & Multiple Headings (ONPAGE_H1_PRESENCE, ONPAGE_H1_MULTIPLE)
    const h1Count = page.headings.h1.length;
    if (h1Count === 0) {
      recordLedger('ONPAGE_H1_PRESENCE', 'executed_fail', 'fail', true, 'No <h1> elements found');
      recordLedger('ONPAGE_H1_MULTIPLE', 'not_applicable', 'na', false, 'No H1 present to evaluate multiple headings');
      findings.push({
        id: `${auditId}-${page.id}-h1-missing`,
        auditId,
        ruleId: 'ONPAGE_H1_PRESENCE',
        category: 'on_page',
        severity: 'high',
        status: 'fail',
        title: 'Missing Primary H1 Heading',
        description: 'The page contains no <h1> elements.',
        recommendation: 'Ensure each page has exactly one clear, topic-defining <h1> heading.',
        pageUrl: page.url,
        evidence: { h1Count: 0 },
      });
    } else {
      recordLedger('ONPAGE_H1_PRESENCE', 'executed_pass', 'pass', true);
      if (h1Count > 1) {
        recordLedger(
          'ONPAGE_H1_MULTIPLE',
          'executed_warning',
          'warning',
          true,
          `Found ${h1Count} <h1> headings`
        );
        findings.push({
          id: `${auditId}-${page.id}-h1-multiple`,
          auditId,
          ruleId: 'ONPAGE_H1_MULTIPLE',
          category: 'on_page',
          severity: 'medium',
          status: 'warning',
          title: 'Multiple H1 Headings Detected',
          description: `Found ${h1Count} <h1> headings on the page.`,
          recommendation: 'Use a single <h1> heading per page for consistent semantic hierarchy.',
          pageUrl: page.url,
          evidence: { h1Count, headings: page.headings.h1 },
        });
      } else {
        recordLedger('ONPAGE_H1_MULTIPLE', 'executed_pass', 'pass', true);
      }
    }

    // 6. Canonical Presence & Validity (ONPAGE_CANONICAL_PRESENCE, ONPAGE_CANONICAL_VALID)
    if (!page.canonicalUrl || page.canonicalUrl.trim() === '') {
      recordLedger('ONPAGE_CANONICAL_PRESENCE', 'executed_warning', 'warning', true, 'Missing rel="canonical" link');
      recordLedger('ONPAGE_CANONICAL_VALID', 'not_applicable', 'na', false, 'No canonical URL declared to validate');
      findings.push({
        id: `${auditId}-${page.id}-canonical-missing`,
        auditId,
        ruleId: 'ONPAGE_CANONICAL_PRESENCE',
        category: 'on_page',
        severity: 'medium',
        status: 'warning',
        title: 'Missing Canonical Tag',
        description: 'The page does not specify a rel="canonical" link.',
        recommendation: 'Add a self-referencing canonical URL to prevent duplicate content ambiguity.',
        pageUrl: page.url,
        evidence: { canonicalUrl: null },
      });
    } else {
      recordLedger('ONPAGE_CANONICAL_PRESENCE', 'executed_pass', 'pass', true);
      let isValidUrl = false;
      try {
        new URL(page.canonicalUrl, page.url);
        isValidUrl = true;
      } catch {
        isValidUrl = false;
      }

      if (isValidUrl) {
        recordLedger('ONPAGE_CANONICAL_VALID', 'executed_pass', 'pass', true);
      } else {
        recordLedger('ONPAGE_CANONICAL_VALID', 'executed_fail', 'fail', true, 'Malformed canonical URL');
        findings.push({
          id: `${auditId}-${page.id}-canonical-invalid`,
          auditId,
          ruleId: 'ONPAGE_CANONICAL_VALID',
          category: 'on_page',
          severity: 'high',
          status: 'fail',
          title: 'Invalid Canonical URL Format',
          description: `The canonical tag contains an unparseable or invalid URL: "${page.canonicalUrl}".`,
          recommendation: 'Ensure the canonical link is an absolute, valid URL.',
          pageUrl: page.url,
          evidence: { canonicalUrl: page.canonicalUrl },
        });
      }
    }

    // 7. Image Alt Text (ONPAGE_IMAGE_ALT_MISSING)
    if (page.images.length === 0) {
      recordLedger('ONPAGE_IMAGE_ALT_MISSING', 'not_applicable', 'na', false, 'Page contains no <img> elements');
    } else {
      const missingAlt = page.images.filter((img) => !img.alt || img.alt.trim() === '');
      if (missingAlt.length > 0) {
        recordLedger(
          'ONPAGE_IMAGE_ALT_MISSING',
          'executed_warning',
          'warning',
          true,
          `${missingAlt.length} images missing alt text`
        );
        findings.push({
          id: `${auditId}-${page.id}-images-alt`,
          auditId,
          ruleId: 'ONPAGE_IMAGE_ALT_MISSING',
          category: 'on_page',
          severity: 'medium',
          status: 'warning',
          title: `${missingAlt.length} Image(s) Missing Alt Text`,
          description: `Found ${missingAlt.length} images without descriptive alt attributes.`,
          recommendation: 'Provide meaningful alt text for all informational images to aid accessibility and image search.',
          pageUrl: page.url,
          evidence: { missingCount: missingAlt.length, images: missingAlt.slice(0, 5) },
        });
      } else {
        recordLedger('ONPAGE_IMAGE_ALT_MISSING', 'executed_pass', 'pass', true);
      }
    }

    return { findings, ledgerRecords };
  }

  /**
   * Backward-compatible page evaluation returning findings.
   */
  public static evaluatePage(page: StandaloneCrawlPage, auditId: string): StandaloneSeoFinding[] {
    return this.evaluatePageDetailed(page, auditId).findings;
  }

  /**
   * Evaluates sitewide canonical rules and records execution outcomes in the ledger.
   */
  public static evaluateSitewideDetailed(
    pages: StandaloneCrawlPage[],
    auditId: string
  ): PageEvaluationResult {
    const findings: StandaloneSeoFinding[] = [];
    const ledgerRecords: StandaloneRuleExecutionRecord[] = [];
    const now = Date.now();
    const seedUrl = pages[0]?.url || '';

    const recordLedger = (
      canonicalRuleId: string,
      executionStatus: StandaloneRuleExecutionRecord['executionStatus'],
      result: StandaloneRuleExecutionRecord['result'],
      evidenceAvailable: boolean,
      reason?: string
    ) => {
      ledgerRecords.push({
        id: `${auditId}-sitewide-${canonicalRuleId}`,
        auditId,
        canonicalRuleId,
        ruleVersion: this.RULE_VERSION,
        scope: 'site',
        targetUrl: seedUrl,
        executionStatus,
        result,
        evidenceAvailable,
        reason,
        executedAt: now,
        engineVersion: this.ENGINE_VERSION,
      });
    };

    const usablePages = pages.filter(
      (p) => p.fetchStatus === 'success' && p.httpStatus >= 200 && p.httpStatus < 400
    );

    if (usablePages.length <= 1) {
      recordLedger(
        'SITE_TITLE_DUPLICATE',
        'not_applicable',
        'na',
        false,
        'Requires at least 2 usable pages for sitewide duplicate title analysis'
      );
      recordLedger(
        'SITE_NO_OBSERVED_INTERNAL_INLINKS',
        'not_applicable',
        'na',
        false,
        'Requires at least 2 usable pages for orphan page analysis'
      );
      return { findings, ledgerRecords };
    }

    // 1. Duplicate Title Tags (SITE_TITLE_DUPLICATE)
    const titleMap = new Map<string, string[]>();
    for (const p of usablePages) {
      if (p.title) {
        const norm = p.title.trim().toLowerCase();
        const list = titleMap.get(norm) || [];
        list.push(p.url);
        titleMap.set(norm, list);
      }
    }

    let duplicateTitlesFound = false;
    for (const [title, urls] of titleMap.entries()) {
      if (urls.length > 1) {
        duplicateTitlesFound = true;
        findings.push({
          id: `${auditId}-sitewide-dup-title-${title.slice(0, 20)}`,
          auditId,
          ruleId: 'SITE_TITLE_DUPLICATE',
          category: 'sitewide',
          severity: 'high',
          status: 'fail',
          title: `Duplicate Title Tag Across ${urls.length} Pages`,
          description: `The title "${title}" is shared across multiple pages.`,
          recommendation: 'Ensure every indexed page has a distinct title that describes its specific content.',
          pageUrl: urls[0] ?? '',
          evidence: { title, duplicateUrls: urls },
        });
      }
    }

    if (duplicateTitlesFound) {
      recordLedger('SITE_TITLE_DUPLICATE', 'executed_fail', 'fail', true, 'Found duplicate title tags across pages');
    } else {
      recordLedger('SITE_TITLE_DUPLICATE', 'executed_pass', 'pass', true);
    }

    // 2. Orphan Pages (SITE_NO_OBSERVED_INTERNAL_INLINKS)
    const inboundCounts = new Map<string, number>();
    for (const p of usablePages) {
      inboundCounts.set(p.url, 0);
    }

    for (const p of usablePages) {
      for (const dest of p.links) {
        if (inboundCounts.has(dest) && dest !== p.url) {
          inboundCounts.set(dest, (inboundCounts.get(dest) || 0) + 1);
        }
      }
    }

    let orphansFound = false;
    for (const [url, count] of inboundCounts.entries()) {
      if (count === 0 && url !== seedUrl) {
        orphansFound = true;
        findings.push({
          id: `${auditId}-sitewide-orphan-${url.slice(-20)}`,
          auditId,
          ruleId: 'SITE_NO_OBSERVED_INTERNAL_INLINKS',
          category: 'sitewide',
          severity: 'medium',
          status: 'warning',
          title: 'Orphan Page (No Inbound Internal Links)',
          description: `No crawled pages link to: ${url}.`,
          recommendation: 'Add internal links from related category or content pages so users and crawlers can find it.',
          pageUrl: url,
          evidence: { inboundLinks: 0 },
        });
      }
    }

    if (orphansFound) {
      recordLedger(
        'SITE_NO_OBSERVED_INTERNAL_INLINKS',
        'executed_warning',
        'warning',
        true,
        'Found orphan pages with zero inbound links'
      );
    } else {
      recordLedger('SITE_NO_OBSERVED_INTERNAL_INLINKS', 'executed_pass', 'pass', true);
    }

    return { findings, ledgerRecords };
  }

  /**
   * Backward-compatible sitewide evaluation returning findings.
   */
  public static evaluateSitewide(pages: StandaloneCrawlPage[], auditId: string): StandaloneSeoFinding[] {
    return this.evaluateSitewideDetailed(pages, auditId).findings;
  }

  /**
   * Complete audit evaluation returning all canonical findings and the full execution ledger.
   */
  public static evaluateAudit(
    pages: StandaloneCrawlPage[],
    auditId: string
  ): PageEvaluationResult {
    const allFindings: StandaloneSeoFinding[] = [];
    const allLedger: StandaloneRuleExecutionRecord[] = [];

    const usablePages = pages.filter(
      (p) => p.fetchStatus === 'success' && p.httpStatus >= 200 && p.httpStatus < 400
    );

    // Page evaluations
    for (const p of pages) {
      const { findings, ledgerRecords } = this.evaluatePageDetailed(p, auditId);
      allFindings.push(...findings);
      allLedger.push(...ledgerRecords);
    }

    // Sitewide evaluations
    const { findings: siteFindings, ledgerRecords: siteLedger } = this.evaluateSitewideDetailed(
      usablePages,
      auditId
    );
    allFindings.push(...siteFindings);
    allLedger.push(...siteLedger);

    const ledger = this.buildExecutionLedger(auditId, allLedger);
    return { findings: allFindings, ledgerRecords: allLedger, ledger };
  }

  /**
   * Constructs authoritative StandaloneExecutionLedger with structured summary counts.
   */
  public static buildExecutionLedger(
    auditId: string,
    records: StandaloneRuleExecutionRecord[]
  ): StandaloneExecutionLedger {
    const executedRules = new Set(
      records
        .filter((r) => r.executionStatus.startsWith('executed_'))
        .map((r) => r.canonicalRuleId)
    );
    return {
      auditId,
      records,
      summary: {
        totalEvaluations: records.length,
        distinctCanonicalRulesExecuted: executedRules.size,
        executedPassCount: records.filter((r) => r.executionStatus === 'executed_pass').length,
        executedFailCount: records.filter((r) => r.executionStatus === 'executed_fail').length,
        executedWarningCount: records.filter((r) => r.executionStatus === 'executed_warning').length,
        notApplicableCount: records.filter((r) => r.executionStatus === 'not_applicable').length,
        notEvaluatedCount: records.filter((r) => r.executionStatus === 'not_evaluated').length,
        unknownCount: records.filter((r) => r.executionStatus === 'unknown').length,
        errorCount: records.filter((r) => r.executionStatus === 'error').length,
      },
    };
  }
}
