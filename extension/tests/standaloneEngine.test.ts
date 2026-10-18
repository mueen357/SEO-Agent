/**
 * Standalone In-Browser Audit Engine Unit Tests.
 *
 * Verifies all modules of the standalone architecture:
 * 1. URL normalization, same-origin scope, SSRF defense, duplicate prevention
 * 2. In-browser DOM parsing and evidence extraction
 * 3. Client SEO rules engine (On-Page, Technical, Site-Wide)
 * 4. Client Technology detection engine (Multi-vector fingerprints & version extraction)
 * 5. Scoring and availability gating
 * 6. In-browser crawler budgets, concurrency, and cancellation
 * 7. Exporter (JSON & CSV formatting with RFC 4180 escaping)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InBrowserCrawler } from '../standalone/crawler/inBrowserCrawler';
import { StandaloneDomParser } from '../standalone/audit/domParserEngine';
import { StandaloneRulesEngine } from '../standalone/audit/clientRules';
import { StandaloneTechDetector } from '../standalone/audit/clientTechDetector';
import { StandaloneScoringCalculator } from '../standalone/audit/scoring';
import { StandaloneExporter } from '../standalone/export/exporter';
import type {
  StandaloneAuditConfig,
  StandaloneCrawlPage,
  StandaloneAuditJob,
  StandaloneTechFinding,
  StandaloneSeoFinding,
} from '../standalone/types';

describe('Standalone Engine - URL Handling & Security', () => {
  const defaultConfig: StandaloneAuditConfig = {
    maxPages: 10,
    maxDepth: 3,
    concurrency: 1,
    delayMs: 0,
    respectRobots: true,
  };

  it('normalizes URLs by stripping fragments and trailing slashes', () => {
    const crawler = new InBrowserCrawler('https://example.com/', defaultConfig);

    expect(crawler.normalizeUrl('https://example.com/about/#team')).toBe('https://example.com/about');
    expect(crawler.normalizeUrl('https://example.com/pricing/')).toBe('https://example.com/pricing');
    expect(crawler.normalizeUrl('https://example.com/search?q=seo&page=1#results')).toBe(
      'https://example.com/search?q=seo&page=1'
    );
  });

  it('enforces strict same-origin scope and rejects off-domain URLs', () => {
    const crawler = new InBrowserCrawler('https://example.com/', defaultConfig);

    expect(crawler.isInScope('https://example.com/blog')).toBe(true);
    expect(crawler.isInScope('https://example.com/features/subpage')).toBe(true);
    expect(crawler.isInScope('https://subdomain.example.com/page')).toBe(false);
    expect(crawler.isInScope('https://evil-phishing.com/page')).toBe(false);
    expect(crawler.isInScope('http://example.com/insecure')).toBe(false); // protocol mismatch

    // Exact seed origin with port: when seed is port 4321, port 8000 must NOT be in scope!
    const localCrawler = new InBrowserCrawler('http://127.0.0.1:4321/', defaultConfig);
    expect(localCrawler.isInScope('http://127.0.0.1:4321/')).toBe(true);
    expect(localCrawler.isInScope('http://127.0.0.1:4321/about')).toBe(true);
    expect(localCrawler.isInScope('http://127.0.0.1:8000/')).toBe(false);
    expect(localCrawler.isInScope('http://localhost:4321/')).toBe(false);
  });

  it('defends against SSRF by blocking localhost, private subnets, and cloud metadata', () => {
    const crawler = new InBrowserCrawler('https://example.com/', defaultConfig);

    expect(crawler.isPrivateOrForbiddenHost('localhost')).toBe(true);
    expect(crawler.isPrivateOrForbiddenHost('127.0.0.1')).toBe(true);
    expect(crawler.isPrivateOrForbiddenHost('127.1.2.3')).toBe(true);
    expect(crawler.isPrivateOrForbiddenHost('10.0.0.5')).toBe(true);
    expect(crawler.isPrivateOrForbiddenHost('192.168.1.1')).toBe(true);
    expect(crawler.isPrivateOrForbiddenHost('172.16.0.100')).toBe(true);
    expect(crawler.isPrivateOrForbiddenHost('169.254.169.254')).toBe(true);
    expect(crawler.isPrivateOrForbiddenHost('metadata.google.internal')).toBe(true);
    expect(crawler.isPrivateOrForbiddenHost('my-corp.local')).toBe(true);

    expect(crawler.isPrivateOrForbiddenHost('example.com')).toBe(false);
    expect(crawler.isPrivateOrForbiddenHost('google.com')).toBe(false);
  });

  it('filters out non-HTML static asset extensions', () => {
    const crawler = new InBrowserCrawler('https://example.com/', defaultConfig);

    expect(crawler.isInScope('https://example.com/images/hero.png')).toBe(false);
    expect(crawler.isInScope('https://example.com/assets/style.css')).toBe(false);
    expect(crawler.isInScope('https://example.com/bundle.js')).toBe(false);
    expect(crawler.isInScope('https://example.com/whitepaper.pdf')).toBe(false);
    expect(crawler.isInScope('https://example.com/blog/article-1')).toBe(true);
  });
});

describe('Standalone Engine - DOMParser Evidence Extraction', () => {
  it('extracts metadata, canonicals, robots, headings, links, and technology signatures', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Next Generation Platform - High Performance Web Audit</title>
          <meta name="description" content="Comprehensive SEO audit engine running completely inside the Chrome browser." />
          <link rel="canonical" href="https://example.com/product" />
          <meta name="robots" content="index, follow" />
          <meta name="generator" content="WordPress 6.4.3" />
          <script src="/_next/static/chunks/main.js"></script>
          <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css" />
        </head>
        <body>
          <h1>Supercharge Your Search Visibility</h1>
          <h2>Key Highlights</h2>
          <h3>Zero Setup Required</h3>
          <h3>100% Client-Side Privacy</h3>
          <img src="/assets/hero.webp" alt="Dashboard Illustration" />
          <img src="/assets/spacer.gif" />
          <a href="/pricing">View Plans</a>
          <a href="https://external-partner.com/docs">External Reference</a>
          <script>
            window.__NEXT_DATA__ = { props: { pageProps: {} } };
          </script>
        </body>
      </html>
    `;

    const evidence = StandaloneDomParser.parse(sampleHtml, 'https://example.com/product');

    expect(evidence.title).toBe('Next Generation Platform - High Performance Web Audit');
    expect(evidence.metaDescription).toBe('Comprehensive SEO audit engine running completely inside the Chrome browser.');
    expect(evidence.canonicalUrl).toBe('https://example.com/product');
    expect(evidence.metaRobots).toBe('index, follow');
    expect(evidence.metaGenerators).toContain('WordPress 6.4.3');

    expect(evidence.headings.h1).toEqual(['Supercharge Your Search Visibility']);
    expect(evidence.headings.h2).toEqual(['Key Highlights']);
    expect(evidence.headings.h3).toEqual(['Zero Setup Required', '100% Client-Side Privacy']);

    expect(evidence.images).toHaveLength(2);
    expect(evidence.images[0]?.alt).toBe('Dashboard Illustration');
    expect(evidence.images[1]?.alt).toBe('');

    expect(evidence.links).toContain('https://example.com/pricing');
    expect(evidence.links).toContain('https://external-partner.com/docs');

    expect(evidence.scriptSources).toContain('/_next/static/chunks/main.js');
    expect(evidence.stylesheetHrefs).toContain('/wp-content/themes/twentytwentyfour/style.css');
    expect(evidence.inlineMarkers).toContain('__NEXT_DATA__');
  });
});

describe('Standalone Engine - Client SEO Rules Engine', () => {
  const dummyPage: StandaloneCrawlPage = {
    id: 'page-1',
    auditId: 'audit-test',
    url: 'https://example.com/',
    depth: 0,
    httpStatus: 200,
    fetchStatus: 'success',
    title: 'Optimal Title for Search Engine Ranking and User Clicks',
    metaDescription: 'A comprehensive, well-structured meta description designed to maximize CTR in search results.',
    headings: {
      h1: ['Main Purpose of the Page'],
      h2: ['Feature One', 'Feature Two'],
      h3: ['Detail A'],
    },
    canonicalUrl: 'https://example.com/',
    metaRobots: 'index, follow',
    links: ['https://example.com/about'],
    images: [{ src: '/img.png', alt: 'Descriptive alt text' }],
    headers: { 'strict-transport-security': 'max-age=31536000' },
    htmlSize: 15400,
    responseTimeMs: 145,
    fetchedAt: Date.now(),
  };

  it('produces no critical errors for a fully optimized page', () => {
    const findings = StandaloneRulesEngine.evaluatePage(dummyPage, 'audit-test');

    const criticalOrHigh = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
    expect(criticalOrHigh).toHaveLength(0);
  });

  it('fails rules when title is missing, h1 is absent, and images lack alt attributes on a valid HTML page', () => {
    const brokenPage: StandaloneCrawlPage = {
      ...dummyPage,
      url: 'http://example.com/broken',
      title: '',
      metaDescription: '',
      headings: { h1: [], h2: [], h3: [] },
      images: [{ src: '/bad.jpg', alt: '' }],
      canonicalUrl: undefined,
      httpStatus: 200,
      fetchStatus: 'success',
      responseTimeMs: 3200,
    };

    const findings = StandaloneRulesEngine.evaluatePage(brokenPage, 'audit-test');

    const titleMissing = findings.find((f) => f.ruleId === 'ONPAGE_TITLE_TAG' && f.status === 'fail');
    expect(titleMissing).toBeDefined();

    const descMissing = findings.find((f) => f.ruleId === 'ONPAGE_META_DESC' && f.status === 'fail');
    expect(descMissing).toBeDefined();

    const h1Missing = findings.find((f) => f.ruleId === 'ONPAGE_H1_PRIMARY' && f.status === 'fail');
    expect(h1Missing).toBeDefined();

    const imgMissingAlt = findings.find((f) => f.ruleId === 'ONPAGE_IMAGES' && f.status === 'warning');
    expect(imgMissingAlt).toBeDefined();

    const httpInsecure = findings.find((f) => f.ruleId === 'TECH_HTTPS_SECURITY' && f.status === 'fail');
    expect(httpInsecure).toBeDefined();
  });

  it('does NOT report false on-page SEO issues for failed or inaccessible pages (httpStatus: 0, fetchStatus: "failed")', () => {
    const failedPage: StandaloneCrawlPage = {
      ...dummyPage,
      url: 'http://127.0.0.1:4321/',
      title: undefined,
      metaDescription: undefined,
      headings: { h1: [], h2: [], h3: [] },
      images: [],
      canonicalUrl: undefined,
      httpStatus: 0,
      fetchStatus: 'failed',
      errorCode: 'FETCH_NETWORK_ERROR',
      errorMessage: 'Network error: Failed to fetch',
    };

    const findings = StandaloneRulesEngine.evaluatePage(failedPage, 'audit-test');
    // Inaccessible pages must NOT have false Missing Title, Missing H1, or Missing Canonical findings!
    expect(findings).toHaveLength(0);
  });

  it('reports genuine HTTP 4xx/5xx status error without reporting false on-page element issues', () => {
    const error500Page: StandaloneCrawlPage = {
      ...dummyPage,
      url: 'https://example.com/server-error',
      title: undefined,
      metaDescription: undefined,
      headings: { h1: [], h2: [], h3: [] },
      images: [],
      canonicalUrl: undefined,
      httpStatus: 500,
      fetchStatus: 'failed',
    };

    const findings = StandaloneRulesEngine.evaluatePage(error500Page, 'audit-test');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('TECH_HTTP_STATUS');
    expect(findings[0]?.severity).toBe('critical');
    // Ensure no false on-page HTML findings on 500 error
    expect(findings.some((f) => f.ruleId === 'ONPAGE_TITLE_TAG')).toBe(false);
    expect(findings.some((f) => f.ruleId === 'ONPAGE_H1_PRIMARY')).toBe(false);
  });

  it('permits HTTP for explicitly authorized local development fixture without critical defect', () => {
    const localDevPage: StandaloneCrawlPage = {
      ...dummyPage,
      url: 'http://127.0.0.1:4321/',
      httpStatus: 200,
      fetchStatus: 'success',
    };

    const findings = StandaloneRulesEngine.evaluatePage(localDevPage, 'audit-test');
    const httpsFinding = findings.find((f) => f.ruleId === 'TECH_HTTPS_SECURITY');

    expect(httpsFinding).toBeDefined();
    expect(httpsFinding?.status).toBe('pass'); // Pass, not critical defect
    expect(httpsFinding?.title).toContain('Local Development Fixture');
  });

  it('evaluates site-wide graph rules correctly', () => {
    const pages: StandaloneCrawlPage[] = [
      dummyPage,
      {
        ...dummyPage,
        id: 'page-2',
        url: 'https://example.com/orphan',
        links: [],
      },
    ];

    const sitewideFindings = StandaloneRulesEngine.evaluateSitewide(pages, 'audit-test');

    const orphanFinding = sitewideFindings.find((f) => f.ruleId === 'SITE_ORPHAN_PAGES');
    expect(orphanFinding).toBeDefined();
    expect(orphanFinding?.pageUrl).toBe('https://example.com/orphan');
  });
});

describe('Standalone Engine - Client Technology Detection', () => {
  it('detects WordPress, themes, and versions from generator and assets', () => {
    const evidence = {
      title: 'Blog',
      metaDescription: '',
      metaGenerators: ['WordPress 6.4.2'],
      headings: { h1: [], h2: [], h3: [] },
      images: [],
      links: [],
      scriptSources: ['https://wp-example.org/wp-includes/js/jquery/jquery.min.js'],
      stylesheetHrefs: ['https://wp-example.org/wp-content/themes/astra/style.css'],
      domMarkers: [],
      bodyClasses: [],
      inlineMarkers: ['wp.apiFetch'],
    };

    const headers = { 'x-powered-by': 'PHP/8.2.14' };
    const detected = StandaloneTechDetector.detect(evidence, headers, 'audit-wp');
    const techIds = detected.map((t) => t.technologyId);

    expect(techIds).toContain('wordpress');

    const wpFinding = detected.find((t) => t.technologyId === 'wordpress');
    expect(wpFinding?.versionOrNull).toBe('6.4.2');
    expect(wpFinding?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects Next.js and Cloudflare from headers and scripts', () => {
    const evidence = {
      title: 'Modern Next App',
      metaDescription: '',
      metaGenerators: [],
      headings: { h1: [], h2: [], h3: [] },
      images: [],
      links: [],
      scriptSources: ['https://next-example.com/_next/static/chunks/app/layout.js'],
      stylesheetHrefs: [],
      domMarkers: ['id:__next'],
      bodyClasses: [],
      inlineMarkers: ['__NEXT_DATA__'],
    };

    const headers = {
      server: 'cloudflare',
      'cf-ray': '87c9f8012a-EWR',
    };

    const detected = StandaloneTechDetector.detect(evidence, headers, 'audit-next');
    const techIds = detected.map((t) => t.technologyId);

    expect(techIds).toContain('nextjs');
    expect(techIds).toContain('cloudflare');
  });
});

describe('Standalone Engine - Scorecard & Availability Gating', () => {
  it('calculates weighted category scores and overall grade', () => {
    const findings: StandaloneSeoFinding[] = [
      {
        id: '1',
        auditId: 'a',
        ruleId: 'R1',
        category: 'on_page',
        severity: 'high',
        status: 'fail',
        title: 'Issue 1',
        description: 'desc',
        recommendation: 'rec',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
      {
        id: '2',
        auditId: 'a',
        ruleId: 'R2',
        category: 'technical',
        severity: 'critical',
        status: 'warning',
        title: 'Issue 2',
        description: 'desc',
        recommendation: 'rec',
        pageUrl: 'https://example.com/',
        evidence: {},
      },
    ];

    const scorecard = StandaloneScoringCalculator.calculate(findings, 5);

    expect(scorecard.available).toBe(true);
    expect(scorecard.overallScore).toBeGreaterThan(0);
    expect(scorecard.overallScore).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(scorecard.grade);
    expect(scorecard.pagesCrawled).toBe(5);
  });

  it('truthfully reports available=false and N/A grade when 0 usable pages were crawled', () => {
    const emptyScorecard = StandaloneScoringCalculator.calculate([], 0);
    expect(emptyScorecard.available).toBe(false);
    expect(emptyScorecard.overallScore).toBeNull();
    expect(emptyScorecard.grade).toBe('N/A');
    expect(emptyScorecard.reason).toBe('Crawl failed / insufficient evidence');
  });

  it('rejects scoring when all pages failed to fetch even if crawl attempted pages', () => {
    const failedPages: StandaloneCrawlPage[] = [
      {
        id: 'p1',
        auditId: 'test',
        url: 'http://127.0.0.1:4321/',
        depth: 0,
        httpStatus: 0,
        fetchStatus: 'failed',
        errorCode: 'FETCH_NETWORK_ERROR',
        headings: { h1: [], h2: [], h3: [] },
        links: [],
        images: [],
        headers: {},
        htmlSize: 0,
        responseTimeMs: 120,
        fetchedAt: Date.now(),
      },
    ];

    const scorecard = StandaloneScoringCalculator.calculate([], failedPages);
    expect(scorecard.available).toBe(false);
    expect(scorecard.overallScore).toBeNull();
    expect(scorecard.grade).toBe('N/A');
    expect(scorecard.usablePagesCount).toBe(0);
    expect(scorecard.attemptedPagesCount).toBe(1);
    expect(scorecard.failedPagesCount).toBe(1);
  });

  it('calculates score correctly on partial crawl with some usable pages and some failed pages', () => {
    const mixedPages: StandaloneCrawlPage[] = [
      {
        id: 'p1',
        auditId: 'test',
        url: 'http://127.0.0.1:4321/',
        depth: 0,
        httpStatus: 200,
        fetchStatus: 'success',
        headings: { h1: ['Home'], h2: [], h3: [] },
        links: [],
        images: [],
        headers: {},
        htmlSize: 1000,
        responseTimeMs: 80,
        fetchedAt: Date.now(),
      },
      {
        id: 'p2',
        auditId: 'test',
        url: 'http://127.0.0.1:4321/broken',
        depth: 1,
        httpStatus: 500,
        fetchStatus: 'failed',
        errorCode: 'FETCH_NETWORK_ERROR',
        headings: { h1: [], h2: [], h3: [] },
        links: [],
        images: [],
        headers: {},
        htmlSize: 0,
        responseTimeMs: 90,
        fetchedAt: Date.now(),
      },
    ];

    const scorecard = StandaloneScoringCalculator.calculate([], mixedPages);
    expect(scorecard.available).toBe(true);
    expect(scorecard.overallScore).toBeGreaterThan(0);
    expect(scorecard.usablePagesCount).toBe(1);
    expect(scorecard.attemptedPagesCount).toBe(2);
    expect(scorecard.failedPagesCount).toBe(1);
  });
});

describe('Standalone Engine - Crawler Concurrency, Budgets & Cancellation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('respects maxPages crawl budget and stops when budget is reached', async () => {
    const config: StandaloneAuditConfig = {
      maxPages: 2,
      maxDepth: 3,
      concurrency: 1,
      delayMs: 0,
      respectRobots: true,
    };

    const crawler = new InBrowserCrawler('https://mock-site.com/', config);

    const mockHtml = `
      <html>
        <body>
          <a href="/page1">P1</a>
          <a href="/page2">P2</a>
          <a href="/page3">P3</a>
          <a href="/page4">P4</a>
        </body>
      </html>
    `;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => mockHtml,
    } as any);

    const crawledPages: StandaloneCrawlPage[] = [];

    await crawler.run({
      onPageCrawled: async (page) => {
        crawledPages.push(page);
      },
      onProgress: () => {},
      isCancelled: () => false,
    });

    expect(crawledPages.length).toBe(2); // strictly clamped by maxPages: 2
  });

  it('halts crawl execution immediately when isCancelled returns true', async () => {
    const config: StandaloneAuditConfig = {
      maxPages: 50,
      maxDepth: 3,
      concurrency: 1,
      delayMs: 0,
      respectRobots: true,
    };

    const crawler = new InBrowserCrawler('https://mock-site.com/', config);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '<html><body><a href="/page1">1</a><a href="/page2">2</a></body></html>',
    } as any);

    let cancelTriggered = false;
    const crawledPages: StandaloneCrawlPage[] = [];

    await crawler.run({
      onPageCrawled: async (page) => {
        crawledPages.push(page);
        cancelTriggered = true; // cancel after 1st page
      },
      onProgress: () => {},
      isCancelled: () => cancelTriggered,
    });

    expect(crawledPages.length).toBe(1);
  });
});

describe('Standalone Engine - Exporter', () => {
  const mockJob: StandaloneAuditJob = {
    id: 'audit-export-test',
    targetUrl: 'https://export-example.com/',
    origin: 'https://export-example.com',
    hostname: 'export-example.com',
    status: 'completed',
    progressPercent: 100,
    currentStage: 'Done',
    config: { maxPages: 10, maxDepth: 2, concurrency: 1, delayMs: 0, respectRobots: true },
    discoveredUrls: ['https://export-example.com/'],
    pendingQueue: [],
    crawledUrls: ['https://export-example.com/'],
    failedUrls: [],
    startedAt: 1700000000000,
    updatedAt: 1700000005000,
  };

  const mockTechs: StandaloneTechFinding[] = [
    {
      id: 't1',
      auditId: 'audit-export-test',
      technologyId: 'wordpress',
      name: 'WordPress',
      category: 'cms',
      confidence: 1.0,
      status: 'detected',
      provenance: 'first_party',
      evidenceSummary: 'Declared in meta generator tag: "WordPress 6.4.2"',
      versionOrNull: '6.4.2',
    },
  ];

  const mockPages: StandaloneCrawlPage[] = [
    {
      id: 'p1',
      auditId: 'audit-export-test',
      url: 'https://export-example.com/',
      depth: 0,
      httpStatus: 200,
      fetchStatus: 'success',
      headings: { h1: ['Home'], h2: [], h3: [] },
      links: [],
      images: [],
      headers: {},
      htmlSize: 12000,
      responseTimeMs: 95,
      fetchedAt: 1700000001000,
    },
  ];

  const mockFindings: StandaloneSeoFinding[] = [
    {
      id: 'f1',
      auditId: 'audit-export-test',
      ruleId: 'ONPAGE_TITLE_TAG',
      category: 'on_page',
      severity: 'medium',
      status: 'warning',
      title: 'Title tag length is 42 chars',
      description: 'Title is within bounds',
      recommendation: 'Keep as is',
      pageUrl: 'https://export-example.com/',
      evidence: {},
    },
    {
      id: 'f2',
      auditId: 'audit-export-test',
      ruleId: 'ONPAGE_H1_PRIMARY',
      category: 'on_page',
      severity: 'medium',
      status: 'warning',
      title: 'Found "Quotes" inside title',
      description: 'Multiple H1 found',
      recommendation: 'Use single H1',
      pageUrl: 'https://export-example.com/',
      evidence: {},
    },
  ];

  it('generates valid JSON export string with all entities', () => {
    const jsonStr = StandaloneExporter.generateJson(mockJob, mockPages, mockFindings, mockTechs);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.audit.id).toBe('audit-export-test');
    expect(parsed.technologies[0].name).toBe('WordPress');
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.findings).toHaveLength(2);
  });

  it('generates valid CSV export string with proper escaping of quotes and commas', () => {
    const csvStr = StandaloneExporter.generateCsv(mockJob, mockPages, mockFindings);

    expect(csvStr).toContain('Type,Page URL,Rule / Status,Severity / HTTP,Title / Evidence,Recommendation');
    expect(csvStr).toContain('PAGE,"https://export-example.com/","success","200"');
    expect(csvStr).toContain('SEO_ISSUE,"https://export-example.com/","ONPAGE_H1_PRIMARY"');
    // Verify quotes are escaped with double quotes
    expect(csvStr).toContain('""Quotes"" inside title');
  });
});

describe('Standalone Engine - Safe Browser Crawling & URL Scope Defenses', () => {
  const config: StandaloneAuditConfig = {
    maxPages: 5,
    maxDepth: 2,
    concurrency: 1,
    delayMs: 0,
    respectRobots: true,
  };

  it('rejects URLs containing embedded credentials', () => {
    const crawler = new InBrowserCrawler('https://example.com/', config);
    expect(crawler.isInScope('https://user:password@example.com/admin')).toBe(false);
    expect(crawler.isInScope('https://alice@example.com/profile')).toBe(false);
    expect(crawler.isInScope('https://example.com/safe/path')).toBe(true);
  });

  it('parses robots.txt directives and blocks disallowed paths', () => {
    const crawler = new InBrowserCrawler('https://example.com/', config);
    const robotsTxt = `
      User-agent: Googlebot
      Disallow: /google-only/

      User-agent: *
      Disallow: /admin/
      Disallow: /private/secret.html
      Allow: /public/
    `;
    crawler.parseRobotsTxt(robotsTxt);

    expect(crawler.isAllowedByRobots('/admin/dashboard')).toBe(false);
    expect(crawler.isAllowedByRobots('/private/secret.html')).toBe(false);
    expect(crawler.isAllowedByRobots('/public/about')).toBe(true);
    expect(crawler.isAllowedByRobots('/blog/article-1')).toBe(true);
  });

  it('resumes durable frontier from previous state without re-crawling seen URLs', () => {
    const crawler = new InBrowserCrawler(
      'https://example.com/',
      config,
      [{ url: 'https://example.com/page-2', depth: 1 }],
      ['https://example.com/', 'https://example.com/page-2']
    );

    const pending = crawler.getPendingQueue();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.url).toBe('https://example.com/page-2');

    const discovered = crawler.getDiscoveredUrls();
    expect(discovered).toContain('https://example.com/');
    expect(discovered).toContain('https://example.com/page-2');
  });
});

describe('Standalone Engine - Technology Evidence Fidelity & CMS Fixtures', () => {
  const auditId = 'test-tech-evidence-audit';

  it('detects WordPress from original meta generator, wp-content assets, and inline markers', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>WordPress Blog</title>
          <meta name="generator" content="WordPress 6.4.2" />
          <link rel="stylesheet" href="https://example.com/wp-content/themes/twentytwentyfour/style.css" />
          <script src="https://example.com/wp-includes/js/wp-embed.min.js"></script>
        </head>
        <body class="home blog wp-custom-logo">
          <script>window.wp = { apiFetch: function() {} };</script>
          <h1>Welcome to WordPress</h1>
        </body>
      </html>
    `;
    const evidence = StandaloneDomParser.parse(html, 'https://example.com/');
    expect(evidence.metaGenerators).toContain('WordPress 6.4.2');
    expect(evidence.stylesheetHrefs.some((h) => h.includes('wp-content'))).toBe(true);
    expect(evidence.scriptSources.some((s) => s.includes('wp-includes'))).toBe(true);

    const techs = StandaloneTechDetector.detect(evidence, {}, auditId);
    const wp = techs.find((t) => t.technologyId === 'wordpress');
    expect(wp).toBeDefined();
    expect(wp?.version).toBe('6.4.2');
    expect(wp?.status).toBe('confirmed');
  });

  it('detects Framer from hydration attribute and inline scripts', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Framer Portfolio</title></head>
        <body>
          <div data-framer-hydrate-v2="framer-root">
            <script>window.__framer__ = { version: "v2" };</script>
            <h1>Built with Framer</h1>
          </div>
        </body>
      </html>
    `;
    const evidence = StandaloneDomParser.parse(html, 'https://example.com/');
    expect(evidence.domMarkers).toContain('data-framer-hydrate-v2');
    expect(evidence.inlineMarkers).toContain('__framer__');

    const techs = StandaloneTechDetector.detect(evidence, {}, auditId);
    const framer = techs.find((t) => t.technologyId === 'framer');
    expect(framer).toBeDefined();
    expect(framer?.status).toBe('confirmed');
  });

  it('detects Shopify from CDN scripts and inline theme object', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Modern Store</title>
          <script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
        </head>
        <body>
          <script>Shopify = { theme: { name: 'Dawn', id: 1234 } };</script>
          <h1>Store Products</h1>
        </body>
      </html>
    `;
    const evidence = StandaloneDomParser.parse(html, 'https://example.com/');
    expect(evidence.scriptSources.some((s) => s.includes('cdn.shopify.com'))).toBe(true);
    expect(evidence.inlineMarkers).toContain('Shopify.theme');

    const techs = StandaloneTechDetector.detect(evidence, {}, auditId);
    const shopify = techs.find((t) => t.technologyId === 'shopify');
    expect(shopify).toBeDefined();
    expect(shopify?.status).toBe('confirmed');
  });

  it('detects Next.js and React from __NEXT_DATA__ and chunks', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Next.js App</title>
          <script src="/_next/static/chunks/main-app.js"></script>
        </head>
        <body>
          <div id="__next">
            <h1>Server Rendered React</h1>
            <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>
          </div>
        </body>
      </html>
    `;
    const evidence = StandaloneDomParser.parse(html, 'https://example.com/');
    expect(evidence.domMarkers).toContain('id:__next');
    expect(evidence.inlineMarkers).toContain('__NEXT_DATA__');

    const techs = StandaloneTechDetector.detect(evidence, {}, auditId);
    const nextjs = techs.find((t) => t.technologyId === 'nextjs');
    const react = techs.find((t) => t.technologyId === 'react');
    expect(nextjs).toBeDefined();
    expect(react).toBeDefined();
  });

  it('detects Webflow from data-wf-site attribute and webflow js', () => {
    const html = `
      <!DOCTYPE html>
      <html data-wf-site="602938472910394827">
        <head>
          <title>Webflow Agency</title>
          <script src="https://assets.website-files.com/js/webflow.js"></script>
        </head>
        <body>
          <h1>Design Agency</h1>
        </body>
      </html>
    `;
    const evidence = StandaloneDomParser.parse(html, 'https://example.com/');
    expect(evidence.domMarkers).toContain('data-wf-site');

    const techs = StandaloneTechDetector.detect(evidence, {}, auditId);
    const webflow = techs.find((t) => t.technologyId === 'webflow');
    expect(webflow).toBeDefined();
    expect(webflow?.status).toBe('confirmed');
  });

  it('handles Plain HTML with zero false positive technology findings', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Clean Semantic HTML5 Website</title>
          <meta name="description" content="Handcrafted static HTML site without any frameworks or CMS." />
        </head>
        <body>
          <header><nav><a href="/">Home</a></nav></header>
          <main>
            <h1>Standard Semantic Markup</h1>
            <p>Simple content rendered with zero runtime libraries.</p>
          </main>
        </body>
      </html>
    `;
    const evidence = StandaloneDomParser.parse(html, 'https://example.com/');
    const techs = StandaloneTechDetector.detect(evidence, {}, auditId);
    expect(techs).toHaveLength(0);
  });

  it('handles Unknown Backend with custom headers without false positives', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Proprietary Internal Service</title></head>
        <body><h1>Custom System</h1></body>
      </html>
    `;
    const evidence = StandaloneDomParser.parse(html, 'https://example.com/');
    const headers = {
      'x-custom-engine': 'internal-v4',
      'content-type': 'text/html; charset=utf-8',
      'server': 'custom-gw',
    };
    const techs = StandaloneTechDetector.detect(evidence, headers, auditId);
    expect(techs).toHaveLength(0);
  });
});

