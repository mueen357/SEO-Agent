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
  StandaloneContentCategory,
  StandaloneRobotsEvidence,
  StandaloneSitemapEvidence,
} from '../types';
import { normalizeRobotsEvidence, normalizeSitemapEvidence } from '../types';
import { classifyResponse } from '../crawler/inBrowserCrawler';

export function normalizeCanonicalUrl(rawUrl: string, baseOrigin?: string): string {
  try {
    const u = baseOrigin ? new URL(rawUrl, baseOrigin) : new URL(rawUrl);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return rawUrl.trim().replace(/\/+$/, '').toLowerCase();
  }
}

export interface PageEvaluationResult {
  findings: StandaloneSeoFinding[];
  ledgerRecords: StandaloneRuleExecutionRecord[];
  ledger?: StandaloneExecutionLedger;
}

export interface StandaloneAuditContext {
  robotsEvidence?: StandaloneRobotsEvidence;
  sitemapEvidence?: StandaloneSitemapEvidence;
}

export class StandaloneRulesEngine {
  private static readonly ENGINE_VERSION = '2.0.0';
  private static readonly RULE_VERSION = '1.0.0';
  public static readonly BCP47_SYNTAX_PATTERN = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;

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
    auditId: string,
    auditContext?: StandaloneAuditContext
  ): PageEvaluationResult {
    const findings: StandaloneSeoFinding[] = [];
    const ledgerRecords: StandaloneRuleExecutionRecord[] = [];
    const now = Date.now();

    // Explicit Content Classification
    const category: StandaloneContentCategory =
      page.contentTypeCategory ||
      classifyResponse(page.httpStatus, page.fetchStatus, page.headers, page.errorCode, page.htmlSize);

    const sitemapEvidence = normalizeSitemapEvidence(auditContext?.sitemapEvidence);
    const sitemapUrlList = sitemapEvidence?.urls || [];
    const normPageUrl = normalizeCanonicalUrl(page.url);
    const isInSitemap =
      page.isInSitemap ??
      Boolean(sitemapUrlList.some((u) => normalizeCanonicalUrl(u) === normPageUrl));

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

    // 1. TECH_HTTP_4XX
    if (page.httpStatus >= 400 && page.httpStatus < 500) {
      recordLedger('TECH_HTTP_4XX', 'executed_fail', 'fail', true, `HTTP ${page.httpStatus} Client Error`);
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
    } else if (page.httpStatus === 0) {
      recordLedger(
        'TECH_HTTP_4XX',
        'unknown',
        'unknown',
        false,
        page.errorMessage || 'Fetch failed without HTTP response'
      );
    } else {
      recordLedger('TECH_HTTP_4XX', 'executed_pass', 'pass', true);
    }

    // 2. TECH_HTTP_5XX
    if (page.httpStatus >= 500) {
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
    } else if (page.httpStatus === 0) {
      recordLedger(
        'TECH_HTTP_5XX',
        'unknown',
        'unknown',
        false,
        page.errorMessage || 'Fetch failed without HTTP response'
      );
    } else {
      recordLedger('TECH_HTTP_5XX', 'executed_pass', 'pass', true);
    }

    // 3. TECH_HTTP_429
    if (page.httpStatus === 429) {
      recordLedger('TECH_HTTP_429', 'executed_fail', 'fail', true, 'HTTP 429 Too Many Requests (Rate Limited)');
      findings.push({
        id: `${auditId}-${page.id}-http-429`,
        auditId,
        ruleId: 'TECH_HTTP_429',
        category: 'technical',
        severity: 'high',
        status: 'fail',
        title: 'HTTP 429 Too Many Requests (Rate Limited)',
        description: 'Server responded with HTTP 429 rate limiting. Aggressive rate limiting causes incomplete crawl discovery and de-indexing.',
        recommendation: 'Ensure rate limiting mechanisms do not throttle legitimate verified search engine bots.',
        pageUrl: page.url,
        evidence: { httpStatus: 429, fetchStatus: page.fetchStatus },
      });
    } else if (page.httpStatus === 0) {
      recordLedger(
        'TECH_HTTP_429',
        'unknown',
        'unknown',
        false,
        page.errorMessage || 'Fetch failed without HTTP response'
      );
    } else {
      recordLedger('TECH_HTTP_429', 'executed_pass', 'pass', true);
    }

    // 4. TECH_HTTP_UNSUPPORTED_CONTENT
    if (page.fetchStatus === 'failed' || page.fetchStatus === 'timeout' || page.httpStatus === 0) {
      recordLedger(
        'TECH_HTTP_UNSUPPORTED_CONTENT',
        'not_evaluated',
        'unknown',
        false,
        `Page fetch failed or returned error HTTP ${page.httpStatus}; Content-Type unavailable`
      );
    } else if (category === 'NON_HTML_RESOURCE') {
      const ct = (page.headers?.['content-type'] || '').toLowerCase();
      recordLedger(
        'TECH_HTTP_UNSUPPORTED_CONTENT',
        'executed_pass',
        'pass',
        true,
        `Page returned non-HTML Content-Type: '${ct}'`
      );
    } else {
      recordLedger('TECH_HTTP_UNSUPPORTED_CONTENT', 'executed_pass', 'pass', true);
    }

    // 5. TECH_HTTPS_USAGE
    if (page.httpStatus === 0 && page.fetchStatus === 'failed') {
      recordLedger(
        'TECH_HTTPS_USAGE',
        'not_evaluated',
        'unknown',
        false,
        'Page fetch failed; protocol compliance unverified'
      );
    } else if (page.url.startsWith('https://')) {
      recordLedger('TECH_HTTPS_USAGE', 'executed_pass', 'pass', true);
    } else if (this.isLoopbackHost(page.url)) {
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

    // 6. TECH_X_ROBOTS_TAG
    if (!page.headers || Object.keys(page.headers).length === 0) {
      recordLedger(
        'TECH_X_ROBOTS_TAG',
        'unknown',
        'unknown',
        false,
        'HTTP response headers were not recorded; X-Robots-Tag status cannot be determined'
      );
    } else {
      const xRobots = page.headers['x-robots-tag'];
      if (!xRobots || !xRobots.trim()) {
        recordLedger('TECH_X_ROBOTS_TAG', 'executed_pass', 'pass', true);
      } else {
        const tokens = xRobots.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const hasIndex = tokens.includes('index');
        const hasNoindex = tokens.includes('noindex') || tokens.includes('none');

        if (hasIndex && hasNoindex) {
          recordLedger('TECH_X_ROBOTS_TAG', 'executed_warning', 'warning', true, `Conflicting X-Robots-Tag directives: '${xRobots}'`);
          findings.push({
            id: `${auditId}-${page.id}-xrobots-conflict`,
            auditId,
            ruleId: 'TECH_X_ROBOTS_TAG',
            category: 'technical',
            severity: 'high',
            status: 'warning',
            title: 'Conflicting X-Robots-Tag directives',
            description: `HTTP header specifies conflicting directives: '${xRobots}'. 'noindex' takes precedence in search engines.`,
            recommendation: 'Ensure the X-Robots-Tag header declares consistent indexing instructions.',
            pageUrl: page.url,
            evidence: { xRobotsTag: xRobots, tokens },
          });
        } else if (hasNoindex) {
          recordLedger('TECH_X_ROBOTS_TAG', 'executed_warning', 'warning', true, `X-Robots-Tag noindex directive present: '${xRobots}'`);
          findings.push({
            id: `${auditId}-${page.id}-xrobots-noindex`,
            auditId,
            ruleId: 'TECH_X_ROBOTS_TAG',
            category: 'technical',
            severity: 'medium',
            status: 'warning',
            title: 'X-Robots-Tag noindex directive present',
            description: `HTTP response returned X-Robots-Tag: '${xRobots}'. Search engines observing this header will not index the document.`,
            recommendation: 'Verify that this resource should be blocked from search indexes. Remove header if it should be indexed.',
            pageUrl: page.url,
            evidence: { xRobotsTag: xRobots, tokens },
          });
        } else {
          recordLedger('TECH_X_ROBOTS_TAG', 'executed_pass', 'pass', true);
        }
      }
    }

    // 7. TECH_ROBOTS_DISALLOW
    if (page.fetchStatus === 'robots_blocked') {
      recordLedger(
        'TECH_ROBOTS_DISALLOW',
        'executed_warning',
        'warning',
        true,
        'URL disallowed by robots.txt'
      );
      findings.push({
        id: `${auditId}-${page.id}-robots-disallowed`,
        auditId,
        ruleId: 'TECH_ROBOTS_DISALLOW',
        category: 'technical',
        severity: 'medium',
        status: 'warning',
        title: 'URL disallowed by robots.txt',
        description: 'This URL was blocked from crawling by site robots.txt rules. Note that disallow blocks crawling, not indexation (pages can still be indexed if linked elsewhere).',
        recommendation: "If this page should be indexed, remove the Disallow directive in robots.txt. If it should NOT be indexed, use a 'noindex' tag instead.",
        pageUrl: page.url,
        evidence: { pageUrl: page.url, fetchStatus: 'robots_blocked' },
      });
    } else {
      recordLedger('TECH_ROBOTS_DISALLOW', 'executed_pass', 'pass', true);
    }

    // 8. TECH_SITEMAP_URL_STATUS
    if (!isInSitemap) {
      recordLedger(
        'TECH_SITEMAP_URL_STATUS',
        'not_applicable',
        'na',
        false,
        'URL not listed in XML sitemap'
      );
    } else {
      if (page.httpStatus === 200) {
        recordLedger('TECH_SITEMAP_URL_STATUS', 'executed_pass', 'pass', true, 'Sitemap URL returns HTTP 200 OK');
      } else {
        recordLedger(
          'TECH_SITEMAP_URL_STATUS',
          'executed_fail',
          'fail',
          true,
          `Non-200 URL listed in XML sitemap (HTTP ${page.httpStatus || 'unknown'})`
        );
        findings.push({
          id: `${auditId}-${page.id}-sitemap-non-200`,
          auditId,
          ruleId: 'TECH_SITEMAP_URL_STATUS',
          category: 'technical',
          severity: 'high',
          status: 'fail',
          title: `Non-200 URL listed in XML sitemap (HTTP ${page.httpStatus || 'unknown'})`,
          description: `URL is included in an XML sitemap but returns HTTP ${page.httpStatus || 'error'}. Google guidelines require sitemaps to contain only indexable, HTTP 200 URLs.`,
          recommendation: 'Remove non-200 URLs (redirects, 404s, error pages) from XML sitemaps immediately.',
          pageUrl: page.url,
          evidence: { pageUrl: page.url, httpStatus: page.httpStatus, inSitemap: true },
        });
      }
    }

    // 9. TECH_SITEMAP_NOINDEX_CONFLICT
    if (!isInSitemap) {
      recordLedger(
        'TECH_SITEMAP_NOINDEX_CONFLICT',
        'not_applicable',
        'na',
        false,
        'URL is not in an XML sitemap'
      );
    } else if (page.fetchStatus !== 'success' || (page.httpStatus < 200 || page.httpStatus >= 400)) {
      recordLedger(
        'TECH_SITEMAP_NOINDEX_CONFLICT',
        'not_evaluated',
        'unknown',
        false,
        'Page indexing evidence unavailable for sitemap URL'
      );
    } else {
      const metaRobots = (page.metaRobots || page.evidence?.metaRobots || '').toLowerCase();
      const xRobots = (page.headers?.['x-robots-tag'] || '').toLowerCase();
      const isNoindex =
        metaRobots.includes('noindex') ||
        metaRobots.includes('none') ||
        xRobots.includes('noindex') ||
        xRobots.includes('none');

      if (isNoindex) {
        recordLedger(
          'TECH_SITEMAP_NOINDEX_CONFLICT',
          'executed_fail',
          'fail',
          true,
          'Contradictory indexing: Sitemap URL specifies noindex'
        );
        findings.push({
          id: `${auditId}-${page.id}-sitemap-noindex-conflict`,
          auditId,
          ruleId: 'TECH_SITEMAP_NOINDEX_CONFLICT',
          category: 'technical',
          severity: 'high',
          status: 'fail',
          title: 'Contradictory indexing: Sitemap URL specifies noindex',
          description:
            "This URL is submitted in an XML sitemap but specifies 'noindex' (via meta tag or X-Robots-Tag). Submitting a noindexed URL wastes crawl budget and creates conflicting signals.",
          recommendation: "Either remove the URL from the sitemap or remove the 'noindex' directive.",
          pageUrl: page.url,
          evidence: {
            pageUrl: page.url,
            metaRobots: page.metaRobots,
            xRobotsTag: page.headers?.['x-robots-tag'],
            inSitemap: true,
          },
        });
      } else {
        recordLedger('TECH_SITEMAP_NOINDEX_CONFLICT', 'executed_pass', 'pass', true);
      }
    }

    // 10. TECH_SITEMAP_CANONICAL_CONFLICT
    if (!isInSitemap) {
      recordLedger(
        'TECH_SITEMAP_CANONICAL_CONFLICT',
        'not_applicable',
        'na',
        false,
        'URL is not in an XML sitemap'
      );
    } else {
      const canonical = page.canonicalUrl || page.evidence?.canonicalUrl;
      if (!canonical) {
        recordLedger(
          'TECH_SITEMAP_CANONICAL_CONFLICT',
          'executed_pass',
          'pass',
          true,
          'Sitemap URL has no canonical declaration'
        );
      } else {
        const normPage = normalizeCanonicalUrl(page.url);
        const normCan = normalizeCanonicalUrl(canonical, page.url);
        if (normPage !== normCan) {
          recordLedger(
            'TECH_SITEMAP_CANONICAL_CONFLICT',
            'executed_warning',
            'warning',
            true,
            'Sitemap URL specifies different canonical target'
          );
          findings.push({
            id: `${auditId}-${page.id}-sitemap-canonical-conflict`,
            auditId,
            ruleId: 'TECH_SITEMAP_CANONICAL_CONFLICT',
            category: 'technical',
            severity: 'medium',
            status: 'warning',
            title: 'Sitemap URL specifies different canonical target',
            description: `This URL is submitted in an XML sitemap but specifies canonical target '${canonical}'. Google guidelines state that only canonical URLs should be submitted in XML sitemaps.`,
            recommendation:
              'Submit only the canonical version in your XML sitemap, or update the canonical tag if this page is authoritative.',
            pageUrl: page.url,
            evidence: { pageUrl: page.url, canonicalUrl: canonical, inSitemap: true },
          });
        } else {
          recordLedger('TECH_SITEMAP_CANONICAL_CONFLICT', 'executed_pass', 'pass', true);
        }
      }
    }

    // Non-HTML Evidence Gating: If not a usable HTML document, do NOT evaluate on-page HTML rules!
    const onPageRules = [
      'ONPAGE_TITLE_PRESENT',
      'ONPAGE_TITLE_LENGTH',
      'ONPAGE_TITLE_REPETITIVE',
      'ONPAGE_META_DESC_PRESENT',
      'ONPAGE_META_DESC_LENGTH',
      'ONPAGE_H1_PRESENCE',
      'ONPAGE_H1_MULTIPLE',
      'ONPAGE_H1_EMPTY',
      'ONPAGE_HEADING_HIERARCHY',
      'ONPAGE_CANONICAL_PRESENCE',
      'ONPAGE_CANONICAL_VALID',
      'ONPAGE_IMAGE_ALT_MISSING',
      'ONPAGE_IMAGE_ALT_EMPTY',
      'ONPAGE_INTERNAL_OUTLINKS',
      'ONPAGE_EMPTY_ANCHOR_TEXT',
      'ONPAGE_HTML_LANG',
    ];

    if (category !== 'HTML_DOCUMENT') {
      recordLedger(
        'TECH_META_ROBOTS_DIRECTIVES',
        'not_applicable',
        'na',
        false,
        'Non-HTML resource does not contain HTML <meta> tags'
      );

      if (category === 'NON_HTML_RESOURCE' || category === 'UNKNOWN_CONTENT_TYPE') {
        const ctName = page.headers?.['content-type'] || 'binary';
        for (const rId of onPageRules) {
          recordLedger(
            rId,
            'not_applicable',
            'na',
            false,
            `Resource is ${category === 'NON_HTML_RESOURCE' ? 'non-HTML (' + ctName + ')' : 'missing Content-Type'}; on-page HTML rules are not applicable`
          );
        }
      } else {
        for (const rId of onPageRules) {
          recordLedger(
            rId,
            'not_evaluated',
            'unknown',
            false,
            `Page fetch failed or returned non-HTML error status; content evidence unavailable`
          );
        }
      }

      return { findings, ledgerRecords };
    }

    // TECH_META_ROBOTS_DIRECTIVES (HTML documents only)
    const rawMetaRobots = page.metaRobots || page.evidence?.metaRobots;
    if (!rawMetaRobots || !rawMetaRobots.trim()) {
      recordLedger('TECH_META_ROBOTS_DIRECTIVES', 'executed_pass', 'pass', true);
    } else {
      const tokens = rawMetaRobots.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      const hasIndex = tokens.includes('index');
      const hasNoindex = tokens.includes('noindex') || tokens.includes('none');
      const hasNofollow = tokens.includes('nofollow') || tokens.includes('none');

      if (hasIndex && hasNoindex) {
        recordLedger('TECH_META_ROBOTS_DIRECTIVES', 'executed_warning', 'warning', true, `Conflicting meta robots directives: '${rawMetaRobots}'`);
        findings.push({
          id: `${auditId}-${page.id}-meta-robots-conflict`,
          auditId,
          ruleId: 'TECH_META_ROBOTS_DIRECTIVES',
          category: 'technical',
          severity: 'medium',
          status: 'warning',
          title: 'Conflicting meta robots directives',
          description: `Page specifies both 'index' and 'noindex' in meta robots tag: '${rawMetaRobots}'. Google resolves conflicts conservatively by treating 'noindex' as taking precedence.`,
          recommendation: 'Remove conflicting directives and declare either "index" or "noindex" explicitly.',
          pageUrl: page.url,
          evidence: { metaRobots: rawMetaRobots, tokens },
        });
      } else if (hasNoindex) {
        recordLedger('TECH_META_ROBOTS_DIRECTIVES', 'executed_warning', 'warning', true, `Page marked noindex: '${rawMetaRobots}'`);
        findings.push({
          id: `${auditId}-${page.id}-meta-robots-noindex`,
          auditId,
          ruleId: 'TECH_META_ROBOTS_DIRECTIVES',
          category: 'technical',
          severity: 'medium',
          status: 'warning',
          title: 'Page marked noindex',
          description: `Page specifies restrictive meta robots directive: '${rawMetaRobots}'. Search engines will not index this page or show it in search snippets.`,
          recommendation: 'Verify that this page is intended to be hidden from search engines. If this is a public landing page, remove "noindex".',
          pageUrl: page.url,
          evidence: { metaRobots: rawMetaRobots, tokens },
        });
      } else if (hasNofollow) {
        recordLedger('TECH_META_ROBOTS_DIRECTIVES', 'executed_warning', 'warning', true, `Page specifies nofollow: '${rawMetaRobots}'`);
        findings.push({
          id: `${auditId}-${page.id}-meta-robots-nofollow`,
          auditId,
          ruleId: 'TECH_META_ROBOTS_DIRECTIVES',
          category: 'technical',
          severity: 'low',
          status: 'warning',
          title: 'Page specifies nofollow',
          description: `Page specifies meta robots directive: '${rawMetaRobots}'. Search engines will not follow links on this page to discover new content.`,
          recommendation: 'Confirm that links on this page should not be followed by search crawlers.',
          pageUrl: page.url,
          evidence: { metaRobots: rawMetaRobots, tokens },
        });
      } else {
        recordLedger('TECH_META_ROBOTS_DIRECTIVES', 'executed_pass', 'pass', true);
      }
    }

    // ONPAGE_TITLE_PRESENT, ONPAGE_TITLE_LENGTH, ONPAGE_TITLE_REPETITIVE
    if (!page.title || page.title.trim() === '') {
      recordLedger('ONPAGE_TITLE_PRESENT', 'executed_fail', 'fail', true, 'Missing <title> tag');
      recordLedger('ONPAGE_TITLE_LENGTH', 'not_applicable', 'na', false, 'No title tag present to measure length');
      recordLedger('ONPAGE_TITLE_REPETITIVE', 'not_applicable', 'na', false, 'No title present to check for repetitive words');
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

      // Repetitive words check (>= 3 chars, >= 3 occurrences)
      const words = (page.title.match(/\b[a-zA-Z]{3,}\b/g) || []).map((w) => w.toLowerCase());
      const freq: Record<string, number> = {};
      for (const w of words) {
        freq[w] = (freq[w] || 0) + 1;
      }
      const repeated = Object.keys(freq).filter((w) => (freq[w] || 0) >= 3);
      if (repeated.length > 0) {
        recordLedger(
          'ONPAGE_TITLE_REPETITIVE',
          'executed_warning',
          'warning',
          true,
          `Title contains words repeated 3 or more times: ${repeated.join(', ')}`
        );
        findings.push({
          id: `${auditId}-${page.id}-title-repetitive`,
          auditId,
          ruleId: 'ONPAGE_TITLE_REPETITIVE',
          category: 'on_page',
          severity: 'low',
          status: 'warning',
          title: 'Repetitive words in title',
          description: `Title contains words repeated 3 or more times: ${repeated.join(', ')}.`,
          recommendation: 'Avoid keyword stuffing or repetitive boilerplate phrases in title tags.',
          pageUrl: page.url,
          evidence: { title: page.title, repeatedWords: repeated },
        });
      } else {
        recordLedger('ONPAGE_TITLE_REPETITIVE', 'executed_pass', 'pass', true);
      }
    }

    // ONPAGE_META_DESC_PRESENT & ONPAGE_META_DESC_LENGTH
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

    // Headings: ONPAGE_H1_PRESENCE, ONPAGE_H1_MULTIPLE, ONPAGE_H1_EMPTY, ONPAGE_HEADING_HIERARCHY
    const h1Count = page.h1RawCount ?? page.headingCounts?.h1 ?? page.headings.h1.length;
    const h1HasContent = page.h1HasContent ?? page.headings.h1.some((t) => t.trim().length > 0);

    if (h1Count === 0) {
      recordLedger('ONPAGE_H1_PRESENCE', 'executed_fail', 'fail', true, 'No <h1> elements found');
      recordLedger('ONPAGE_H1_MULTIPLE', 'not_applicable', 'na', false, 'No H1 present to evaluate multiple headings');
      recordLedger('ONPAGE_H1_EMPTY', 'not_applicable', 'na', false, 'No H1 tags found on page');
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

      if (!h1HasContent) {
        recordLedger('ONPAGE_H1_EMPTY', 'executed_fail', 'fail', true, 'H1 tag is present but contains only whitespace or no text content');
        findings.push({
          id: `${auditId}-${page.id}-h1-empty`,
          auditId,
          ruleId: 'ONPAGE_H1_EMPTY',
          category: 'on_page',
          severity: 'medium',
          status: 'fail',
          title: 'Empty H1 heading text',
          description: 'An <h1> tag is present but contains only whitespace or no text content.',
          recommendation: 'Provide informative, visible text inside the <h1> tag.',
          pageUrl: page.url,
          evidence: { h1Count },
        });
      } else {
        recordLedger('ONPAGE_H1_EMPTY', 'executed_pass', 'pass', true);
      }
    }

    // ONPAGE_HEADING_HIERARCHY
    const hc = {
      h1: page.headingCounts?.h1 ?? page.headings.h1.length,
      h2: page.headingCounts?.h2 ?? page.headings.h2.length,
      h3: page.headingCounts?.h3 ?? page.headings.h3.length,
      h4: page.headingCounts?.h4 ?? (page.headings.h4?.length ?? 0),
      h5: page.headingCounts?.h5 ?? (page.headings.h5?.length ?? 0),
      h6: page.headingCounts?.h6 ?? (page.headings.h6?.length ?? 0),
    };
    const jumps: string[] = [];
    if (hc.h2 > 0 && hc.h3 === 0 && (hc.h4 > 0 || hc.h5 > 0 || hc.h6 > 0)) {
      jumps.push('H2 to H4+ without H3');
    }
    if (hc.h3 > 0 && hc.h4 === 0 && (hc.h5 > 0 || hc.h6 > 0)) {
      jumps.push('H3 to H5+ without H4');
    }
    if (jumps.length > 0) {
      recordLedger(
        'ONPAGE_HEADING_HIERARCHY',
        'executed_warning',
        'warning',
        true,
        `Page heading structure skips intermediate levels: ${jumps.join(', ')}`
      );
      findings.push({
        id: `${auditId}-${page.id}-heading-hierarchy`,
        auditId,
        ruleId: 'ONPAGE_HEADING_HIERARCHY',
        category: 'on_page',
        severity: 'low',
        status: 'warning',
        title: 'Heading level hierarchy jump',
        description: `Page heading structure skips intermediate levels: ${jumps.join(', ')}.`,
        recommendation: 'Organize headings in a logical sequence (H1 -> H2 -> H3) to maintain clear document outline.',
        pageUrl: page.url,
        evidence: { headingCounts: hc, jumpsDetected: jumps },
      });
    } else {
      recordLedger('ONPAGE_HEADING_HIERARCHY', 'executed_pass', 'pass', true);
    }

    // ONPAGE_CANONICAL_PRESENCE & ONPAGE_CANONICAL_VALID
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

    // ONPAGE_IMAGE_ALT_MISSING & ONPAGE_IMAGE_ALT_EMPTY
    const totalImgs = page.imageCount ?? page.images.length;
    if (totalImgs === 0) {
      recordLedger('ONPAGE_IMAGE_ALT_MISSING', 'not_applicable', 'na', false, 'Page contains no <img> elements');
      recordLedger('ONPAGE_IMAGE_ALT_EMPTY', 'not_applicable', 'na', false, 'Page contains no <img> elements');
    } else {
      const missingAltCount =
        page.missingAltCount !== undefined
          ? page.missingAltCount
          : page.images.filter((img) => img.hasAlt === false || (!img.hasAlt && (!img.alt || img.alt.trim() === ''))).length;

      const emptyAltCount =
        page.emptyAltCount !== undefined
          ? page.emptyAltCount
          : page.images.filter((img) => (img.hasAlt === true || img.hasAlt === undefined) && img.alt !== undefined && img.alt.trim() === '').length;

      if (missingAltCount > 0) {
        recordLedger(
          'ONPAGE_IMAGE_ALT_MISSING',
          'executed_fail',
          'fail',
          true,
          `${missingAltCount} of ${totalImgs} images on the page lack an alt attribute completely`
        );
        findings.push({
          id: `${auditId}-${page.id}-images-missing-alt`,
          auditId,
          ruleId: 'ONPAGE_IMAGE_ALT_MISSING',
          category: 'on_page',
          severity: 'medium',
          status: 'fail',
          title: 'Images missing alt attribute',
          description: `${missingAltCount} of ${totalImgs} images on the page lack an alt attribute completely.`,
          recommendation: 'Add descriptive alt attributes to all informational images to aid accessibility and image search indexing.',
          pageUrl: page.url,
          evidence: { totalImages: totalImgs, missingAltCount },
        });
      } else {
        recordLedger('ONPAGE_IMAGE_ALT_MISSING', 'executed_pass', 'pass', true);
      }

      if (emptyAltCount > 0) {
        recordLedger(
          'ONPAGE_IMAGE_ALT_EMPTY',
          'executed_warning',
          'warning',
          true,
          `${emptyAltCount} images have empty alt attributes (alt="")`
        );
        findings.push({
          id: `${auditId}-${page.id}-images-empty-alt`,
          auditId,
          ruleId: 'ONPAGE_IMAGE_ALT_EMPTY',
          category: 'on_page',
          severity: 'low',
          status: 'warning',
          title: 'Images with empty alt attribute',
          description: `${emptyAltCount} images have empty alt attributes (alt=""). This is valid for purely decorative images, but ensure non-decorative images have descriptive text.`,
          recommendation: 'Verify that empty alt attributes (alt="") are used exclusively for decorative presentation images.',
          pageUrl: page.url,
          evidence: { totalImages: totalImgs, emptyAltCount },
        });
      } else {
        recordLedger('ONPAGE_IMAGE_ALT_EMPTY', 'executed_pass', 'pass', true);
      }
    }

    // ONPAGE_INTERNAL_OUTLINKS & ONPAGE_EMPTY_ANCHOR_TEXT
    let internalCount = page.internalOutlinksCount;
    if (internalCount === undefined) {
      let pageOrigin = '';
      try {
        pageOrigin = new URL(page.url).origin;
      } catch {}
      internalCount = page.links.filter((l) => {
        try {
          return Boolean(pageOrigin && new URL(l).origin === pageOrigin);
        } catch {
          return false;
        }
      }).length;
    }

    if (internalCount === 0) {
      recordLedger('ONPAGE_INTERNAL_OUTLINKS', 'executed_warning', 'warning', true, 'Page contains no outgoing internal links (dead end)');
      findings.push({
        id: `${auditId}-${page.id}-internal-outlinks`,
        auditId,
        ruleId: 'ONPAGE_INTERNAL_OUTLINKS',
        category: 'on_page',
        severity: 'low',
        status: 'warning',
        title: 'No outgoing internal links (dead end)',
        description: 'The page contains no outgoing links to other pages on the same website.',
        recommendation: 'Add contextual internal links to guide users and search bots to related topics and parent categories.',
        pageUrl: page.url,
        evidence: { internalLinkCount: 0, externalLinkCount: page.externalOutlinksCount ?? 0 },
      });
    } else {
      recordLedger('ONPAGE_INTERNAL_OUTLINKS', 'executed_pass', 'pass', true);
    }

    const totalLinks = page.links.length;
    if (totalLinks === 0) {
      recordLedger('ONPAGE_EMPTY_ANCHOR_TEXT', 'not_applicable', 'na', false, 'No link records available to inspect anchor text');
    } else {
      const emptyAnchors = page.emptyAnchorCount ?? 0;
      if (emptyAnchors > 0) {
        recordLedger('ONPAGE_EMPTY_ANCHOR_TEXT', 'executed_warning', 'warning', true, `${emptyAnchors} link(s) on the page have empty or whitespace-only anchor text`);
        findings.push({
          id: `${auditId}-${page.id}-empty-anchor`,
          auditId,
          ruleId: 'ONPAGE_EMPTY_ANCHOR_TEXT',
          category: 'on_page',
          severity: 'low',
          status: 'warning',
          title: 'Links with empty anchor text',
          description: `${emptyAnchors} link(s) on the page have empty or whitespace-only anchor text.`,
          recommendation: 'Provide descriptive anchor text or aria-label attributes so users and search engines understand link destinations.',
          pageUrl: page.url,
          evidence: { emptyAnchorCount: emptyAnchors, totalLinksChecked: totalLinks },
        });
      } else {
        recordLedger('ONPAGE_EMPTY_ANCHOR_TEXT', 'executed_pass', 'pass', true);
      }
    }

    // ONPAGE_HTML_LANG
    const lang = page.htmlLang !== undefined ? page.htmlLang : page.evidence?.htmlLang;
    if (lang === null || lang === undefined) {
      recordLedger('ONPAGE_HTML_LANG', 'executed_warning', 'warning', true, 'The root <html> element does not specify a lang attribute');
      findings.push({
        id: `${auditId}-${page.id}-html-lang-missing`,
        auditId,
        ruleId: 'ONPAGE_HTML_LANG',
        category: 'on_page',
        severity: 'low',
        status: 'warning',
        title: 'Missing HTML lang attribute',
        description: 'The root <html> element does not specify a lang attribute.',
        recommendation: 'Add a standard BCP 47 lang attribute to the <html> tag (e.g. lang="en", lang="es-419") to assist screen readers and language processing.',
        pageUrl: page.url,
        evidence: { htmlLang: null },
      });
    } else if (!lang.trim()) {
      recordLedger('ONPAGE_HTML_LANG', 'executed_warning', 'warning', true, 'The <html> element has a lang attribute, but its value is empty');
      findings.push({
        id: `${auditId}-${page.id}-html-lang-empty`,
        auditId,
        ruleId: 'ONPAGE_HTML_LANG',
        category: 'on_page',
        severity: 'low',
        status: 'warning',
        title: 'Empty HTML lang attribute',
        description: 'The <html> element has a lang attribute, but its value is empty.',
        recommendation: 'Specify a valid language code conforming to BCP 47 syntax in the <html> lang attribute.',
        pageUrl: page.url,
        evidence: { htmlLang: lang },
      });
    } else if (!StandaloneRulesEngine.BCP47_SYNTAX_PATTERN.test(lang.trim())) {
      recordLedger('ONPAGE_HTML_LANG', 'executed_warning', 'warning', true, `The <html> lang attribute '${lang.trim()}' does not conform to the structural BCP 47 syntax (RFC 5646)`);
      findings.push({
        id: `${auditId}-${page.id}-html-lang-invalid`,
        auditId,
        ruleId: 'ONPAGE_HTML_LANG',
        category: 'on_page',
        severity: 'low',
        status: 'warning',
        title: 'Invalid HTML lang format',
        description: `The <html> lang attribute '${lang.trim()}' does not conform to the structural BCP 47 syntax (RFC 5646).`,
        recommendation: 'Use a language tag following standard BCP 47 syntactic format (e.g., "en", "en-US", "zh-Hans", "es-419").',
        pageUrl: page.url,
        evidence: { htmlLang: lang.trim(), validationScope: 'structural_syntax' },
      });
    } else {
      recordLedger('ONPAGE_HTML_LANG', 'executed_pass', 'pass', true);
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
  /**
   * Evaluates sitewide canonical rules and records execution outcomes in the ledger.
   */
  public static evaluateSitewideDetailed(
    pages: StandaloneCrawlPage[],
    auditId: string,
    auditContext?: StandaloneAuditContext
  ): PageEvaluationResult {
    const findings: StandaloneSeoFinding[] = [];
    const ledgerRecords: StandaloneRuleExecutionRecord[] = [];
    const seedUrl =
      pages[0]?.url ||
      auditContext?.robotsEvidence?.robotsUrl ||
      auditContext?.robotsEvidence?.url ||
      '';
    const now = Date.now();

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

    // 1. Duplicate Title Tags (SITE_TITLE_DUPLICATE) & 2. Orphan Pages (SITE_NO_OBSERVED_INTERNAL_INLINKS)
    // Only evaluate duplicate title and orphan page rules if at least 2 usable HTML pages exist
    const usablePages = pages.filter(
      (p) =>
        p.fetchStatus === 'success' &&
        p.httpStatus >= 200 &&
        p.httpStatus < 400 &&
        (p.contentTypeCategory === 'HTML_DOCUMENT' ||
          (!p.contentTypeCategory && (p.headers?.['content-type']?.includes('text/html') ?? true)))
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
    } else {
      // Duplicate Title Tags
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

      // Orphan Pages
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
    }

    // 3. TECH_ROBOTS_FETCH_STATUS (site-level)
    const robotsEvidence = normalizeRobotsEvidence(auditContext?.robotsEvidence);
    const robotsStatus = robotsEvidence?.fetchStatus;
    if (!robotsStatus || robotsStatus === 'not_evaluated') {
      recordLedger(
        'TECH_ROBOTS_FETCH_STATUS',
        'not_evaluated',
        'unknown',
        false,
        'Robots.txt status unknown or not evaluated'
      );
    } else if (robotsStatus === 'found') {
      recordLedger(
        'TECH_ROBOTS_FETCH_STATUS',
        'executed_pass',
        'pass',
        true,
        'Site provides an accessible robots.txt file (HTTP 200)'
      );
    } else if (robotsStatus === 'not_found') {
      recordLedger(
        'TECH_ROBOTS_FETCH_STATUS',
        'executed_pass',
        'pass',
        true,
        'robots.txt absent (HTTP 404); unrestricted access under RFC 9309'
      );
    } else if (robotsStatus === 'forbidden') {
      recordLedger(
        'TECH_ROBOTS_FETCH_STATUS',
        'executed_warning',
        'warning',
        true,
        'robots.txt inaccessible (HTTP 403 Forbidden)'
      );
      findings.push({
        id: `${auditId}-sitewide-robots-forbidden`,
        auditId,
        ruleId: 'TECH_ROBOTS_FETCH_STATUS',
        category: 'technical',
        severity: 'high',
        status: 'warning',
        title: 'Robots.txt inaccessible (HTTP 403 Forbidden)',
        description: 'robots.txt returned HTTP 403 (Forbidden). RFC 9309 advises crawlers to conservatively halt crawling when robots.txt is blocked.',
        recommendation: 'Ensure /robots.txt is publicly accessible without IP restrictions or authentication.',
        pageUrl: seedUrl,
        evidence: { robotsTxtStatus: robotsStatus, auditTarget: seedUrl },
      });
    } else {
      recordLedger(
        'TECH_ROBOTS_FETCH_STATUS',
        'executed_warning',
        'warning',
        true,
        `robots.txt fetch issue (${robotsStatus})`
      );
      findings.push({
        id: `${auditId}-sitewide-robots-fetch-issue`,
        auditId,
        ruleId: 'TECH_ROBOTS_FETCH_STATUS',
        category: 'technical',
        severity: 'high',
        status: 'warning',
        title: `Robots.txt fetch issue (${robotsStatus})`,
        description: `robots.txt could not be fetched normally (status: '${robotsStatus}'). Search engines may delay crawling during persistent server errors.`,
        recommendation: 'Investigate web server configuration and ensure /robots.txt responds with HTTP 200.',
        pageUrl: seedUrl,
        evidence: { robotsTxtStatus: robotsStatus, auditTarget: seedUrl },
      });
    }

    // 4. TECH_ROBOTS_SITEMAP_DECLARATION (site-level)
    if (
      !robotsStatus ||
      robotsStatus === 'not_evaluated' ||
      robotsStatus === 'error' ||
      robotsStatus === 'forbidden' ||
      robotsStatus === 'rate_limited' ||
      robotsEvidence?.policyOutcome === 'fetch_failed_unverified'
    ) {
      recordLedger(
        'TECH_ROBOTS_SITEMAP_DECLARATION',
        'not_evaluated',
        'unknown',
        false,
        `Robots.txt sitemap declaration cannot be verified (robots status: ${robotsStatus || 'unknown'})`
      );
    } else if (robotsStatus === 'not_found') {
      recordLedger(
        'TECH_ROBOTS_SITEMAP_DECLARATION',
        'not_applicable',
        'na',
        false,
        'robots.txt absent (HTTP 404); no sitemap declarations possible via robots.txt'
      );
    } else {
      const declaredSitemaps = robotsEvidence?.sitemapDeclarations || [];
      if (declaredSitemaps.length > 0) {
        recordLedger(
          'TECH_ROBOTS_SITEMAP_DECLARATION',
          'executed_pass',
          'pass',
          true,
          `robots.txt declares ${declaredSitemaps.length} XML sitemap URL(s)`
        );
      } else {
        recordLedger(
          'TECH_ROBOTS_SITEMAP_DECLARATION',
          'executed_warning',
          'warning',
          true,
          'No sitemap declaration in robots.txt'
        );
        findings.push({
          id: `${auditId}-sitewide-robots-no-sitemap`,
          auditId,
          ruleId: 'TECH_ROBOTS_SITEMAP_DECLARATION',
          category: 'technical',
          severity: 'low',
          status: 'warning',
          title: 'No sitemap declaration in robots.txt',
          description: "robots.txt does not declare any 'Sitemap:' directives. While optional, declaring sitemaps in robots.txt accelerates search engine discovery.",
          recommendation: "Add 'Sitemap: https://yourdomain.com/sitemap.xml' to the end of robots.txt.",
          pageUrl: seedUrl,
          evidence: { robotsTxtPresent: Boolean(robotsEvidence?.rawContent) },
        });
      }
    }

    // 5. TECH_SITEMAP_AVAILABILITY (site-level)
    const sitemapEvidence = normalizeSitemapEvidence(auditContext?.sitemapEvidence);
    const sitemaps = sitemapEvidence?.sitemaps || [];
    const validSitemaps = sitemaps.filter((s) => s.status === 'valid' || s.status === 'success');
    const declaredSitemaps = sitemaps.filter(
      (s) => s.isDeclared === true || (robotsEvidence?.sitemapDeclarations || []).includes(s.sitemapUrl || s.url)
    );
    const brokenDeclaredSitemaps = declaredSitemaps.filter(
      (s) => s.status === 'fetch_error' || s.status === 'unauthorized' || s.status === 'out_of_scope' || (s.httpStatus && s.httpStatus >= 400)
    );
    const parseErrorSitemaps = sitemaps.filter((s) => s.status === 'parse_error');

    if (validSitemaps.length > 0) {
      recordLedger(
        'TECH_SITEMAP_AVAILABILITY',
        'executed_pass',
        'pass',
        true,
        `Discovered ${validSitemaps.length} accessible XML sitemap(s)`
      );
    } else if (brokenDeclaredSitemaps.length > 0) {
      // DECLARED_SITEMAP_BROKEN: Robots.txt explicitly declared a sitemap that failed to load
      recordLedger(
        'TECH_SITEMAP_AVAILABILITY',
        'executed_fail',
        'fail',
        true,
        `Declared XML sitemap(s) broken or inaccessible (${brokenDeclaredSitemaps.length})`
      );
      findings.push({
        id: `${auditId}-sitewide-declared-sitemap-broken`,
        auditId,
        ruleId: 'TECH_SITEMAP_AVAILABILITY',
        category: 'technical',
        severity: 'high',
        status: 'fail',
        title: 'Declared XML sitemap broken or inaccessible',
        description: `robots.txt explicitly declared ${brokenDeclaredSitemaps.length} sitemap(s) that could not be fetched (HTTP status error or network failure).`,
        recommendation: 'Fix the declared sitemap URL in robots.txt or restore the sitemap file on the server.',
        pageUrl: seedUrl,
        evidence: {
          declaredCount: declaredSitemaps.length,
          brokenCount: brokenDeclaredSitemaps.length,
          brokenUrls: brokenDeclaredSitemaps.map((s) => s.sitemapUrl || s.url),
        },
      });
    } else if (parseErrorSitemaps.length > 0) {
      // SITEMAP_PRESENT_INVALID_XML: Sitemap was found/fetched but XML is malformed
      recordLedger(
        'TECH_SITEMAP_AVAILABILITY',
        'executed_fail',
        'fail',
        true,
        `XML sitemaps present but invalid XML (${parseErrorSitemaps.length})`
      );
      findings.push({
        id: `${auditId}-sitewide-sitemaps-invalid-xml`,
        auditId,
        ruleId: 'TECH_SITEMAP_AVAILABILITY',
        category: 'technical',
        severity: 'high',
        status: 'fail',
        title: 'XML sitemaps present but invalid XML',
        description: `Discovered sitemap(s) contained malformed or invalid XML syntax that prevents search engine parsing.`,
        recommendation: 'Validate and repair XML syntax errors in discovered sitemaps.',
        pageUrl: seedUrl,
        evidence: { sitemapCount: sitemaps.length, parseErrorCount: parseErrorSitemaps.length },
      });
    } else {
      // NO_SITEMAP_FOUND: Conventional probing (/sitemap.xml) returned 404 or empty and no sitemap was declared
      recordLedger(
        'TECH_SITEMAP_AVAILABILITY',
        'executed_warning',
        'warning',
        true,
        'No XML sitemaps discovered'
      );
      findings.push({
        id: `${auditId}-sitewide-no-sitemaps`,
        auditId,
        ruleId: 'TECH_SITEMAP_AVAILABILITY',
        category: 'technical',
        severity: 'low',
        status: 'warning',
        title: 'No XML sitemaps discovered',
        description: 'No XML sitemaps were declared in robots.txt or discovered at standard locations.',
        recommendation: 'Create and submit an XML sitemap to help search engines discover newly published or updated URLs.',
        pageUrl: seedUrl,
        evidence: { sitemapCount: 0, probedCount: sitemaps.length },
      });
    }

    // 6. TECH_SITEMAP_PARSE_ERROR (site-level)
    const fetchedSitemaps = sitemaps.filter(
      (s) => s.fetchStatus === 'fetched' || s.status === 'valid' || s.status === 'parse_error'
    );

    if (fetchedSitemaps.length === 0) {
      recordLedger(
        'TECH_SITEMAP_PARSE_ERROR',
        'not_applicable',
        'na',
        false,
        'No XML sitemaps were successfully retrieved to parse'
      );
    } else if (parseErrorSitemaps.length > 0) {
      recordLedger(
        'TECH_SITEMAP_PARSE_ERROR',
        'executed_fail',
        'fail',
        true,
        `Encountered XML parse errors in ${parseErrorSitemaps.length} sitemap(s)`
      );
      findings.push({
        id: `${auditId}-sitewide-sitemap-parse-errors`,
        auditId,
        ruleId: 'TECH_SITEMAP_PARSE_ERROR',
        category: 'technical',
        severity: 'high',
        status: 'fail',
        title: 'XML sitemap parse errors',
        description: `Encountered parse errors in ${parseErrorSitemaps.length} sitemap(s). Invalid XML prevents search engines from parsing submitted URLs.`,
        recommendation: 'Validate XML syntax and ensure sitemap endpoints return valid, uncorrupted XML documents.',
        pageUrl: seedUrl,
        evidence: {
          erroredSitemaps: parseErrorSitemaps.map((e) => ({
            url: e.sitemapUrl || e.url,
            error: e.errorMessage || e.error,
            status: e.status,
          })),
          errorCount: parseErrorSitemaps.length,
        },
      });
    } else {
      recordLedger(
        'TECH_SITEMAP_PARSE_ERROR',
        'executed_pass',
        'pass',
        true,
        `All ${fetchedSitemaps.length} retrieved XML sitemap(s) parsed cleanly`
      );
    }

    return { findings, ledgerRecords };
  }

  /**
   * Backward-compatible sitewide evaluation returning findings.
   */
  public static evaluateSitewide(
    pages: StandaloneCrawlPage[],
    auditId: string,
    auditContext?: StandaloneAuditContext
  ): StandaloneSeoFinding[] {
    return this.evaluateSitewideDetailed(pages, auditId, auditContext).findings;
  }

  /**
   * Complete audit evaluation returning all canonical findings and the full execution ledger.
   */
  public static evaluateAudit(
    pages: StandaloneCrawlPage[],
    auditId: string,
    auditContext?: StandaloneAuditContext
  ): PageEvaluationResult {
    const allFindings: StandaloneSeoFinding[] = [];
    const allLedger: StandaloneRuleExecutionRecord[] = [];

    const usablePages = pages.filter(
      (p) =>
        p.fetchStatus === 'success' &&
        p.httpStatus >= 200 &&
        p.httpStatus < 400 &&
        (p.contentTypeCategory === 'HTML_DOCUMENT' ||
          (!p.contentTypeCategory && (p.headers?.['content-type']?.includes('text/html') ?? true)))
    );

    // Page evaluations
    for (const p of pages) {
      const { findings, ledgerRecords } = this.evaluatePageDetailed(p, auditId, auditContext);
      allFindings.push(...findings);
      allLedger.push(...ledgerRecords);
    }

    // Sitewide evaluations
    const { findings: siteFindings, ledgerRecords: siteLedger } = this.evaluateSitewideDetailed(
      usablePages,
      auditId,
      auditContext
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
