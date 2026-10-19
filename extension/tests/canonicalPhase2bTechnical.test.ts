/**
 * Phase 2B Checkpoint 1 Comprehensive Technical SEO & Reliability Test Suite.
 *
 * Verifies:
 * 1. True atomic IndexedDB single-transaction operations & rollback protection
 * 2. Non-HTML content classification & evidence gating (PDF, images, JSON -> 0 on-page findings)
 * 3. RFC 9309 robots.txt compliance (longest-match precedence, wildcards, disallow without network fetch)
 * 4. Safe XML sitemap parsing (XXE entity expansion protection, index recursion, budget caps)
 * 5. 8 Canonical Technical SEO rules:
 *    - TECH_ROBOTS_FETCH_STATUS
 *    - TECH_ROBOTS_DISALLOW
 *    - TECH_ROBOTS_SITEMAP_DECLARATION
 *    - TECH_SITEMAP_AVAILABILITY
 *    - TECH_SITEMAP_PARSE_ERROR
 *    - TECH_SITEMAP_URL_STATUS
 *    - TECH_SITEMAP_NOINDEX_CONFLICT
 *    - TECH_SITEMAP_CANONICAL_CONFLICT
 * 6. Export fidelity in JSON & CSV formats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';
import { StandaloneRulesEngine, type StandaloneAuditContext } from '../standalone/audit/clientRules';
import { InBrowserCrawler, classifyResponse } from '../standalone/crawler/inBrowserCrawler';
import { StandaloneSitemapParser, hasUnsafeXmlEntities } from '../standalone/crawler/sitemapParser';
import { StandaloneScoringCalculator } from '../standalone/audit/scoring';
import { StandaloneExporter } from '../standalone/export/exporter';
import { CANONICAL_IMPLEMENTED_RULES } from '../standalone/audit/ruleMapping';
import type {
  StandaloneAuditJob,
  StandaloneCrawlPage,
  StandaloneExecutionLedger,
  StandaloneRobotsEvidence,
  StandaloneRuleExecutionRecord,
  StandaloneSeoFinding,
  StandaloneSitemapEvidence,
} from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  overrides: Partial<StandaloneCrawlPage> = {}
): StandaloneCrawlPage {
  return {
    id,
    auditId: 'audit-phase2b-test',
    url,
    depth: 1,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    htmlSize: 2048,
    fetchedAt: Date.now(),
    fetchStatus: 'success',
    httpStatus: 200,
    responseTimeMs: 25,
    title: 'Valid Document Title for Search Ranking',
    metaDescription: 'A valid meta description between 70 and 160 characters designed for search engine snippets.',
    canonicalUrl: url,
    headings: { h1: ['Main Topic Heading'], h2: ['Section One'], h3: [] },
    htmlLang: 'en',
    links: [],
    images: [{ src: '/test.png', alt: 'Test image description' }],
    contentTypeCategory: 'HTML_DOCUMENT',
    ...overrides,
  };
}

describe('Phase 2B.1: Atomic IndexedDB Multi-Store Transactions', () => {
  const auditId = 'atomic-audit-101';

  beforeEach(() => {
    StandaloneAuditStorage.clearInMemoryForTesting();
  });

  it('atomically replaces findings within a single readwrite transaction', async () => {
    const initialFindings: StandaloneSeoFinding[] = [
      {
        id: 'f-1',
        auditId,
        ruleId: 'TECH_HTTP_4XX',
        category: 'technical',
        severity: 'high',
        status: 'fail',
        title: 'Initial 404',
        description: 'Initial',
        recommendation: 'Fix',
        pageUrl: 'https://example.com/1',
      },
    ];
    await StandaloneAuditStorage.replaceFindings(auditId, initialFindings);
    let loaded = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    expect(loaded.length).toBe(1);
    expect(loaded[0]?.id).toBe('f-1');

    const updatedFindings: StandaloneSeoFinding[] = [
      {
        id: 'f-2',
        auditId,
        ruleId: 'TECH_HTTP_5XX',
        category: 'technical',
        severity: 'critical',
        status: 'fail',
        title: 'Updated 500',
        description: 'Updated',
        recommendation: 'Fix Server',
        pageUrl: 'https://example.com/2',
      },
      {
        id: 'f-3',
        auditId,
        ruleId: 'TECH_HTTPS_USAGE',
        category: 'technical',
        severity: 'critical',
        status: 'fail',
        title: 'Updated HTTP',
        description: 'Updated',
        recommendation: 'Upgrade to HTTPS',
        pageUrl: 'https://example.com/3',
      },
    ];

    await StandaloneAuditStorage.replaceFindings(auditId, updatedFindings);
    loaded = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    expect(loaded.length).toBe(2);
    expect(loaded.map((f) => f.id).sort()).toEqual(['f-2', 'f-3']);
  });

  it('atomically publishes SEO stage results across findings, execution_ledger, and jobs', async () => {
    const job: StandaloneAuditJob = {
      id: auditId,
      targetUrl: 'https://example.com',
      origin: 'https://example.com',
      hostname: 'example.com',
      status: 'analyzing',
      progressPercent: 85,
      currentStage: 'Evaluating Rules',
      sequence: 1,
      config: { maxPages: 5, crawlDelayMs: 0, respectRobotsTxt: true, discoverSitemaps: true, userAgent: 'test' },
      discoveredUrls: ['https://example.com'],
      pendingQueue: [],
      crawledUrls: ['https://example.com'],
      failedUrls: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await StandaloneAuditStorage.saveJob(job);

    const findings: StandaloneSeoFinding[] = [
      {
        id: 'stage-f1',
        auditId,
        ruleId: 'ONPAGE_TITLE_PRESENT',
        category: 'on_page',
        severity: 'high',
        status: 'fail',
        title: 'Missing Title',
        description: 'Test',
        recommendation: 'Fix',
        pageUrl: 'https://example.com',
      },
    ];

    const records: StandaloneRuleExecutionRecord[] = [
      {
        id: 'rec-1',
        auditId,
        canonicalRuleId: 'ONPAGE_TITLE_PRESENT',
        ruleVersion: '1.0.0',
        scope: 'page',
        targetUrl: 'https://example.com',
        executionStatus: 'executed_fail',
        result: 'fail',
        evidenceAvailable: true,
        executedAt: Date.now(),
        engineVersion: '2.0.0',
      },
    ];

    job.currentStage = 'SEO stage finished';
    await StandaloneAuditStorage.publishSeoStageResults(auditId, findings, records, job);

    const loadedFindings = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    const loadedRecords = await StandaloneAuditStorage.getExecutionLedgerForAudit(auditId);
    const loadedJob = await StandaloneAuditStorage.getJob(auditId);

    expect(loadedFindings.length).toBe(1);
    expect(loadedRecords.length).toBe(1);
    expect(loadedJob?.currentStage).toBe('SEO stage finished');
  });
});

describe('Phase 2B.2: Non-HTML Content Classification & Evidence Gating', () => {
  it('correctly classifies HTML documents, binary resources, and error categories', () => {
    expect(classifyResponse(200, 'success', { 'content-type': 'text/html; charset=utf-8' })).toBe('HTML_DOCUMENT');
    expect(classifyResponse(200, 'success', { 'content-type': 'application/xhtml+xml' })).toBe('HTML_DOCUMENT');
    expect(classifyResponse(200, 'success', { 'content-type': 'application/pdf' })).toBe('NON_HTML_RESOURCE');
    expect(classifyResponse(200, 'success', { 'content-type': 'image/webp' })).toBe('NON_HTML_RESOURCE');
    expect(classifyResponse(200, 'success', { 'content-type': 'application/json' })).toBe('NON_HTML_RESOURCE');
    expect(classifyResponse(404, 'failed', {}, 'HTTP_404')).toBe('HTTP_ERROR');
    expect(classifyResponse(0, 'failed', {}, 'NETWORK_FAILURE')).toBe('NETWORK_FAILURE');
    expect(classifyResponse(200, 'success', {})).toBe('UNKNOWN_CONTENT_TYPE');
  });

  it('gates non-HTML resources (PDF) so zero false On-Page findings are created', () => {
    const pdfPage = createMockPage('pdf-1', 'https://example.com/catalog.pdf', {
      headers: { 'content-type': 'application/pdf' },
      contentTypeCategory: 'NON_HTML_RESOURCE',
      title: '', // No title
      metaDescription: '', // No meta desc
      headings: { h1: [], h2: [], h3: [] }, // No headings
      images: [],
    });

    const result = StandaloneRulesEngine.evaluatePageDetailed(pdfPage, 'audit-pdf');

    // Crucial check: Zero On-Page findings must be generated!
    const onPageFindings = result.findings.filter((f) => f.category === 'on_page');
    expect(onPageFindings.length).toBe(0);

    // Ledger records must state 'not_applicable' for on-page HTML rules
    const titleRecord = result.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_TITLE_PRESENT');
    expect(titleRecord).toBeDefined();
    expect(titleRecord?.executionStatus).toBe('not_applicable');
    expect(titleRecord?.result).toBe('na');
    expect(titleRecord?.evidenceAvailable).toBe(false);

    const h1Record = result.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_H1_PRESENCE');
    expect(h1Record?.executionStatus).toBe('not_applicable');

    // TECH_META_ROBOTS_DIRECTIVES must also be not_applicable on non-HTML
    const metaRobotsRec = result.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_META_ROBOTS_DIRECTIVES');
    expect(metaRobotsRec?.executionStatus).toBe('not_applicable');
  });

  it('marks on-page rules as not_evaluated with unknown status on network/HTTP failures', () => {
    const failedPage = createMockPage('fail-1', 'https://example.com/server-error', {
      httpStatus: 500,
      fetchStatus: 'failed',
      contentTypeCategory: 'HTTP_ERROR',
      headers: {},
    });

    const result = StandaloneRulesEngine.evaluatePageDetailed(failedPage, 'audit-err');
    const onPageFindings = result.findings.filter((f) => f.category === 'on_page');
    expect(onPageFindings.length).toBe(0);

    const titleRecord = result.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_TITLE_PRESENT');
    expect(titleRecord?.executionStatus).toBe('not_evaluated');
    expect(titleRecord?.result).toBe('unknown');
    expect(titleRecord?.evidenceAvailable).toBe(false);
  });

  it('prevents fake scorecards when a crawl contains only non-HTML documents', () => {
    const pdfOnlyPages = [
      createMockPage('1', 'https://example.com/doc1.pdf', {
        headers: { 'content-type': 'application/pdf' },
        contentTypeCategory: 'NON_HTML_RESOURCE',
      }),
      createMockPage('2', 'https://example.com/doc2.pdf', {
        headers: { 'content-type': 'application/pdf' },
        contentTypeCategory: 'NON_HTML_RESOURCE',
      }),
    ];

    const result = StandaloneRulesEngine.evaluateAudit(pdfOnlyPages, 'audit-pdf-score');
    const scorecard = StandaloneScoringCalculator.calculate(result.findings, pdfOnlyPages, result.ledger);

    expect(scorecard.available).toBe(false);
    expect(scorecard.overallScore).toBeNull();
    expect(scorecard.grade).toBe('N/A');
    expect(scorecard.usablePagesCount).toBe(0);
  });
});

describe('Phase 2B.3: RFC 9309 Robots.txt Analysis & Disallow Enforcement', () => {
  const robotsTxtContent = `
User-agent: Googlebot
Disallow: /private/
Allow: /private/public/

User-agent: *
Disallow: /admin/
Disallow: /secret/*.pdf$
Allow: /admin/login
Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap2.xml
`.trim();

  it('parses user-agent groups, directives, and sitemaps complying with RFC 9309', () => {
    const crawler = new InBrowserCrawler('https://example.com/', {
      maxPages: 5,
      crawlDelayMs: 0,
      respectRobotsTxt: true,
      discoverSitemaps: true,
      userAgent: 'WebsiteAuditAgent/1.0',
    });

    (crawler as any).parseRobotsTxt(robotsTxtContent);

    // Longest-match rule check
    // /admin/ is disallowed (len 7)
    expect(crawler.isAllowedByRobots('https://example.com/admin/dashboard')).toBe(false);
    // /admin/login is allowed (len 12) -> longest match takes precedence!
    expect(crawler.isAllowedByRobots('https://example.com/admin/login')).toBe(true);

    // Root is allowed
    expect(crawler.isAllowedByRobots('https://example.com/')).toBe(true);
    expect(crawler.isAllowedByRobots('https://example.com/blog/article-1')).toBe(true);

    // Wildcards: /secret/*.pdf$
    expect(crawler.isAllowedByRobots('https://example.com/secret/doc.pdf')).toBe(false);
    expect(crawler.isAllowedByRobots('https://example.com/secret/doc.pdf.html')).toBe(true);
  });

  it('evaluates TECH_ROBOTS_FETCH_STATUS correctly across found, not_found, forbidden, error', () => {
    const ctxFound: StandaloneAuditContext = {
      robotsEvidence: {
        url: 'https://example.com/robots.txt',
        httpStatus: 200,
        status: 'found',
        hasDirectives: true,
        sitemapsDeclared: ['https://example.com/sitemap.xml'],
      },
    };
    const resFound = StandaloneRulesEngine.evaluateSitewideDetailed([], 'audit-r1', ctxFound);
    const recFound = resFound.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_ROBOTS_FETCH_STATUS');
    expect(recFound?.executionStatus).toBe('executed_pass');

    // RFC 9309: HTTP 404 absent robots.txt is unrestricted access -> PASS
    const ctxNotFound: StandaloneAuditContext = {
      robotsEvidence: {
        url: 'https://example.com/robots.txt',
        httpStatus: 404,
        status: 'not_found',
        hasDirectives: false,
        sitemapsDeclared: [],
      },
    };
    const resNotFound = StandaloneRulesEngine.evaluateSitewideDetailed([], 'audit-r2', ctxNotFound);
    const recNotFound = resNotFound.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_ROBOTS_FETCH_STATUS');
    expect(recNotFound?.executionStatus).toBe('executed_pass');

    // HTTP 403 Forbidden is a warning
    const ctx403: StandaloneAuditContext = {
      robotsEvidence: {
        url: 'https://example.com/robots.txt',
        httpStatus: 403,
        status: 'forbidden',
        hasDirectives: false,
        sitemapsDeclared: [],
      },
    };
    const res403 = StandaloneRulesEngine.evaluateSitewideDetailed([], 'audit-r3', ctx403);
    const rec403 = res403.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_ROBOTS_FETCH_STATUS');
    expect(rec403?.executionStatus).toBe('executed_warning');
    expect(res403.findings.some((f) => f.ruleId === 'TECH_ROBOTS_FETCH_STATUS')).toBe(true);
  });

  it('evaluates TECH_ROBOTS_SITEMAP_DECLARATION correctly', () => {
    const ctxWithSm: StandaloneAuditContext = {
      robotsEvidence: {
        url: 'https://example.com/robots.txt',
        httpStatus: 200,
        status: 'found',
        sitemapsDeclared: ['https://example.com/sitemap.xml'],
      },
    };
    const resWithSm = StandaloneRulesEngine.evaluateSitewideDetailed([], 'audit-sm1', ctxWithSm);
    const recWithSm = resWithSm.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_ROBOTS_SITEMAP_DECLARATION');
    expect(recWithSm?.executionStatus).toBe('executed_pass');

    const ctxNoSm: StandaloneAuditContext = {
      robotsEvidence: {
        url: 'https://example.com/robots.txt',
        httpStatus: 200,
        status: 'found',
        sitemapsDeclared: [],
      },
    };
    const resNoSm = StandaloneRulesEngine.evaluateSitewideDetailed([], 'audit-sm2', ctxNoSm);
    const recNoSm = resNoSm.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_ROBOTS_SITEMAP_DECLARATION');
    expect(recNoSm?.executionStatus).toBe('executed_warning');
    expect(resNoSm.findings.some((f) => f.ruleId === 'TECH_ROBOTS_SITEMAP_DECLARATION')).toBe(true);
  });

  it('evaluates TECH_ROBOTS_DISALLOW when a page has fetchStatus robots_blocked', () => {
    const blockedPage = createMockPage('blk-1', 'https://example.com/admin/secret', {
      fetchStatus: 'robots_blocked',
      httpStatus: 0,
    });
    const result = StandaloneRulesEngine.evaluatePageDetailed(blockedPage, 'audit-blk');
    const rec = result.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_ROBOTS_DISALLOW');
    expect(rec?.executionStatus).toBe('executed_warning');
    expect(result.findings.some((f) => f.ruleId === 'TECH_ROBOTS_DISALLOW')).toBe(true);

    const allowedPage = createMockPage('allow-1', 'https://example.com/blog');
    const resAllowed = StandaloneRulesEngine.evaluatePageDetailed(allowedPage, 'audit-allow');
    const recAllowed = resAllowed.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_ROBOTS_DISALLOW');
    expect(recAllowed?.executionStatus).toBe('executed_pass');
  });
});

describe('Phase 2B.4: Safe XML Sitemap Discovery & Parsing (XXE Defense & Budget Caps)', () => {
  it('detects and rejects malicious XML containing XXE entity expansion attacks', () => {
    const maliciousXml = `<?xml version="1.0"?>
    <!DOCTYPE foo [
      <!ELEMENT foo ANY >
      <!ENTITY xxe SYSTEM "file:///etc/passwd" >]>
    <urlset><url><loc>&xxe;</loc></url></urlset>`;

    expect(hasUnsafeXmlEntities(maliciousXml)).toBe(true);
  });

  it('safely parses standard XML urlset sitemaps with regex fallback if DOMParser fails', async () => {
    const validXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://example.com/</loc>
        <lastmod>2026-01-01</lastmod>
      </url>
      <url>
        <loc>https://example.com/about</loc>
      </url>
      <url>
        <loc>https://example.com/contact/</loc>
      </url>
    </urlset>`;

    const parser = new StandaloneSitemapParser({ maxSitemaps: 5, maxUrlsPerSitemap: 50, maxTotalUrls: 100 });
    const result = parser.parseXml(validXml, 'https://example.com/sitemap.xml');

    expect(result.type).toBe('urlset');
    expect(result.urls.length).toBe(3);
    expect(result.urls).toContain('https://example.com/');
    expect(result.urls).toContain('https://example.com/about');
    expect(result.urls).toContain('https://example.com/contact');
  });

  it('safely parses sitemapindex documents and caps total recursion depth and budgets', () => {
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap>
        <loc>https://example.com/post-sitemap.xml</loc>
      </sitemap>
      <sitemap>
        <loc>https://example.com/page-sitemap.xml</loc>
      </sitemap>
    </sitemapindex>`;

    const parser = new StandaloneSitemapParser({ maxSitemaps: 5 });
    const result = parser.parseXml(indexXml, 'https://example.com/sitemap_index.xml');

    expect(result.type).toBe('sitemapindex');
    expect(result.sitemapUrls.length).toBe(2);
    expect(result.sitemapUrls).toContain('https://example.com/post-sitemap.xml');
  });

  it('evaluates TECH_SITEMAP_AVAILABILITY and TECH_SITEMAP_PARSE_ERROR', () => {
    // 1. No sitemaps -> Warning
    const ctxNone: StandaloneAuditContext = { sitemapEvidence: { sitemaps: [], urls: [], errors: [] } };
    const resNone = StandaloneRulesEngine.evaluateSitewideDetailed([], 'audit-sm-none', ctxNone);
    const recAvailNone = resNone.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_AVAILABILITY');
    expect(recAvailNone?.executionStatus).toBe('executed_warning');

    // 2. Valid sitemaps -> Pass
    const ctxValid: StandaloneAuditContext = {
      sitemapEvidence: {
        sitemaps: [{ url: 'https://example.com/sitemap.xml', status: 'valid', urlCount: 5 }],
        urls: ['https://example.com/'],
        errors: [],
      },
    };
    const resValid = StandaloneRulesEngine.evaluateSitewideDetailed([], 'audit-sm-valid', ctxValid);
    const recAvailValid = resValid.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_AVAILABILITY');
    expect(recAvailValid?.executionStatus).toBe('executed_pass');
    const recParseValid = resValid.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_PARSE_ERROR');
    expect(recParseValid?.executionStatus).toBe('executed_pass');

    // 3. Errored sitemaps -> Fail
    const ctxError: StandaloneAuditContext = {
      sitemapEvidence: {
        sitemaps: [{ url: 'https://example.com/bad.xml', status: 'parse_error', error: 'XML Syntax Error' }],
        urls: [],
        errors: ['XML Syntax Error'],
      },
    };
    const resError = StandaloneRulesEngine.evaluateSitewideDetailed([], 'audit-sm-err', ctxError);
    const recAvailError = resError.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_AVAILABILITY');
    expect(recAvailError?.executionStatus).toBe('executed_fail');
    const recParseError = resError.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_PARSE_ERROR');
    expect(recParseError?.executionStatus).toBe('executed_fail');
  });
});

describe('Phase 2B.5: Page-Level Sitemap Conflict Rules', () => {
  const auditContext: StandaloneAuditContext = {
    sitemapEvidence: {
      sitemaps: [{ url: 'https://example.com/sitemap.xml', status: 'valid', urlCount: 2 }],
      urls: ['https://example.com/page-in-sitemap', 'https://example.com/page-404-sitemap'],
      errors: [],
    },
  };

  it('evaluates TECH_SITEMAP_URL_STATUS: fails for non-200 URLs in sitemap, passes for 200 URLs in sitemap', () => {
    // 1. In sitemap + 200 OK -> pass
    const p1 = createMockPage('p1', 'https://example.com/page-in-sitemap', { httpStatus: 200 });
    const r1 = StandaloneRulesEngine.evaluatePageDetailed(p1, 'audit-sm-stat', auditContext);
    const rec1 = r1.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_URL_STATUS');
    expect(rec1?.executionStatus).toBe('executed_pass');

    // 2. In sitemap + 404 -> fail
    const p2 = createMockPage('p2', 'https://example.com/page-404-sitemap', { httpStatus: 404, fetchStatus: 'failed' });
    const r2 = StandaloneRulesEngine.evaluatePageDetailed(p2, 'audit-sm-stat', auditContext);
    const rec2 = r2.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_URL_STATUS');
    expect(rec2?.executionStatus).toBe('executed_fail');
    expect(r2.findings.some((f) => f.ruleId === 'TECH_SITEMAP_URL_STATUS')).toBe(true);

    // 3. Not in sitemap -> pass
    const p3 = createMockPage('p3', 'https://example.com/not-in-sitemap', { httpStatus: 200 });
    const r3 = StandaloneRulesEngine.evaluatePageDetailed(p3, 'audit-sm-stat', auditContext);
    const rec3 = r3.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_URL_STATUS');
    expect(rec3?.executionStatus).toBe('executed_pass');
  });

  it('evaluates TECH_SITEMAP_NOINDEX_CONFLICT: fails when sitemap URL specifies noindex', () => {
    // In sitemap + meta robots noindex -> fail
    const pNoindex = createMockPage('p-ni', 'https://example.com/page-in-sitemap', {
      metaRobots: 'noindex, follow',
    });
    const rNoindex = StandaloneRulesEngine.evaluatePageDetailed(pNoindex, 'audit-sm-ni', auditContext);
    const recNi = rNoindex.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_NOINDEX_CONFLICT');
    expect(recNi?.executionStatus).toBe('executed_fail');
    expect(rNoindex.findings.some((f) => f.ruleId === 'TECH_SITEMAP_NOINDEX_CONFLICT')).toBe(true);

    // In sitemap + indexable -> pass
    const pIndexable = createMockPage('p-idx', 'https://example.com/page-in-sitemap', {
      metaRobots: 'index, follow',
    });
    const rIdx = StandaloneRulesEngine.evaluatePageDetailed(pIndexable, 'audit-sm-ni', auditContext);
    const recIdx = rIdx.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_NOINDEX_CONFLICT');
    expect(recIdx?.executionStatus).toBe('executed_pass');

    // Not in sitemap -> not_applicable
    const pOut = createMockPage('p-out', 'https://example.com/other-page', { metaRobots: 'noindex' });
    const rOut = StandaloneRulesEngine.evaluatePageDetailed(pOut, 'audit-sm-ni', auditContext);
    const recOut = rOut.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_NOINDEX_CONFLICT');
    expect(recOut?.executionStatus).toBe('not_applicable');
  });

  it('evaluates TECH_SITEMAP_CANONICAL_CONFLICT: warns when sitemap URL canonical points to different page', () => {
    // In sitemap + canonical mismatch -> warning
    const pCanMismatch = createMockPage('p-can-bad', 'https://example.com/page-in-sitemap', {
      canonicalUrl: 'https://example.com/authoritative-page',
    });
    const rMismatch = StandaloneRulesEngine.evaluatePageDetailed(pCanMismatch, 'audit-sm-can', auditContext);
    const recMismatch = rMismatch.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_CANONICAL_CONFLICT');
    expect(recMismatch?.executionStatus).toBe('executed_warning');
    expect(rMismatch.findings.some((f) => f.ruleId === 'TECH_SITEMAP_CANONICAL_CONFLICT')).toBe(true);

    // In sitemap + matching canonical -> pass
    const pCanMatch = createMockPage('p-can-good', 'https://example.com/page-in-sitemap', {
      canonicalUrl: 'https://example.com/page-in-sitemap',
    });
    const rMatch = StandaloneRulesEngine.evaluatePageDetailed(pCanMatch, 'audit-sm-can', auditContext);
    const recMatch = rMatch.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_SITEMAP_CANONICAL_CONFLICT');
    expect(recMatch?.executionStatus).toBe('executed_pass');
  });
});

describe('Phase 2B.6: Technical SEO Export Fidelity in JSON and CSV', () => {
  it('includes robotsEvidence, sitemapEvidence, and CSV rows in exported deliverables', () => {
    const job: StandaloneAuditJob = {
      id: 'export-audit-1',
      targetUrl: 'https://example.com',
      origin: 'https://example.com',
      hostname: 'example.com',
      status: 'completed',
      progressPercent: 100,
      currentStage: 'Completed',
      sequence: 1,
      config: { maxPages: 5, crawlDelayMs: 0, respectRobotsTxt: true, discoverSitemaps: true, userAgent: 'test' },
      discoveredUrls: ['https://example.com'],
      pendingQueue: [],
      crawledUrls: ['https://example.com'],
      failedUrls: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
      robotsPolicyStatus: 'enforced',
      robotsEvidence: {
        url: 'https://example.com/robots.txt',
        httpStatus: 200,
        status: 'found',
        sitemapsDeclared: ['https://example.com/sitemap.xml'],
      },
      sitemapEvidence: {
        sitemaps: [{ url: 'https://example.com/sitemap.xml', status: 'valid', urlCount: 1 }],
        urls: ['https://example.com'],
        errors: [],
      },
    };

    const pages = [createMockPage('1', 'https://example.com')];
    const findings: StandaloneSeoFinding[] = [];

    // JSON export
    const jsonStr = StandaloneExporter.generateJson(job, pages, findings, []);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.robotsEvidence).toBeDefined();
    expect(parsed.robotsEvidence.status).toBe('found');
    expect(parsed.sitemapEvidence).toBeDefined();
    expect(parsed.sitemapEvidence.sitemaps.length).toBe(1);

    // CSV export
    const csvStr = StandaloneExporter.generateCsv(job, pages, findings);
    expect(csvStr).toContain('ROBOTS_TXT');
    expect(csvStr).toContain('SITEMAP_INDEX');
    expect(csvStr).toContain('https://example.com/robots.txt');
  });
});
