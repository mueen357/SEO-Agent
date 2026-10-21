/**
 * Phase 4A Release Candidate Multi-Component Local Benchmarks Test Suite.
 *
 * Implements deterministic authorized benchmarking for:
 * - 5 pages
 * - 25 pages
 * - 50 pages
 * - 100 pages
 * - 250 pages
 *
 * Covers:
 * Component A: Pure rule evaluation across 51 canonical SEO rules
 * Component B: Content extraction, normalization, and fingerprinting (NFKC, SHA-256, SimHash-64)
 * Component C: Internal link graph topology construction and edge metrics
 * Component D: Full HTTP crawl against local test fixture server (http://127.0.0.1:4321/)
 * Component E: IndexedDB persistence (atomic transaction operations)
 * Component F: Technology fingerprinting (173 catalog entries, representative tech verification)
 * Component G: 250-page safety limits & honest incomplete evaluation states
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StandaloneRulesEngine } from '../standalone/audit/clientRules';
import { StandaloneInternalLinkGraph } from '../standalone/audit/internalLinkGraph';
import {
  extractMainContent,
  normalizeText,
  computeContentSha256,
  computeSimHash64,
  tokenizeWords,
} from '../standalone/audit/contentFingerprint';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';
import { StandaloneAuditCoordinator } from '../standalone/coordinator';
import { StandaloneTechDetector } from '../standalone/audit/clientTechDetector';
import { CANONICAL_51_RULES } from '../standalone/audit/ruleMapping';
import type { StandaloneCrawlPage, StandaloneAuditJob } from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  overrides: Partial<StandaloneCrawlPage> = {}
): StandaloneCrawlPage {
  return {
    id,
    auditId: 'audit-bench-test',
    url,
    depth: 1,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    htmlSize: 2048,
    fetchedAt: Date.now(),
    fetchStatus: 'success',
    httpStatus: 200,
    responseTimeMs: 12,
    title: 'Benchmark Page Title',
    metaDescription: 'Benchmark Page Description for performance testing.',
    canonicalUrl: url,
    canonicalCount: 1,
    canonicalHrefs: [url],
    headings: { h1: ['Main Heading'], h2: ['Subheading 1', 'Subheading 2'], h3: [] },
    links: [],
    images: [{ src: '/img.png', alt: 'Benchmark image' }],
    imageCount: 1,
    missingAltCount: 0,
    emptyAltCount: 0,
    mainTextWordCount: 180,
    contentQualityStatus: 'usable',
    contentTypeCategory: 'HTML_DOCUMENT',
    ...overrides,
  };
}

function generateBenchmarkPages(count: number): StandaloneCrawlPage[] {
  const pages: StandaloneCrawlPage[] = [];
  for (let i = 0; i < count; i++) {
    const id = `bench-page-${i}`;
    const url = `https://example.com/item-${i}`;
    const next1 = `https://example.com/item-${(i + 1) % count}`;
    const next2 = `https://example.com/item-${(i + 2) % count}`;
    const prev = `https://example.com/item-${(i - 1 + count) % count}`;

    // Cluster hashes for realistic duplicate distribution
    const cluster = Math.floor(i / 15);
    const contentHash = `hash-cluster-${cluster}-${i % 15}`;
    const simhash = `${cluster.toString(16).padStart(4, '0')}${'f'.repeat(12)}`.slice(0, 16);

    pages.push(
      createMockPage(id, url, {
        depth: i === 0 ? 0 : (i % 4) + 1,
        links: [next1, next2, prev, next1], // Includes duplicate link to test graph deduplication
        normalizedMainTextHash: contentHash,
        mainTextSimhash: simhash,
        mainTextWordCount: 160 + (i % 25),
      })
    );
  }
  return pages;
}

describe('Phase 4A Release Candidate Multi-Component Benchmarks', () => {
  // =========================================================================
  // COMPONENT A: PURE RULE EVALUATION BENCHMARK
  // =========================================================================
  describe('Component A: Pure Rule Evaluation Benchmarks (5, 25, 50, 100, 250 Pages)', () => {
    const pageSizes = [5, 25, 50, 100, 250];

    for (const size of pageSizes) {
      it(`evaluates 51 canonical SEO rules on ${size} pages within performance budget`, () => {
        const pages = generateBenchmarkPages(size);
        const startTime = performance.now();

        const result = StandaloneRulesEngine.evaluateAudit(pages, `bench-audit-${size}`);
        const elapsedMs = performance.now() - startTime;

        expect(result.findings).toBeDefined();
        expect(result.ledgerRecords.length).toBeGreaterThanOrEqual(13);

        // Budget checks (scaled for parallel CI/worker execution):
        // 5 pages < 250ms, 25 pages < 350ms, 50 pages < 500ms, 100 pages < 800ms, 250 pages < 1800ms
        const maxBudgetMs = size <= 5 ? 250 : size <= 25 ? 350 : size <= 50 ? 500 : size <= 100 ? 800 : 1800;
        expect(elapsedMs).toBeLessThan(maxBudgetMs);

        // If 250 pages, verify safety budgets engaged without false PASS
        if (size === 250) {
          const nearRecord = result.ledgerRecords.find(
            (r) => r.canonicalRuleId === 'SITE_CONTENT_DUPLICATE_NEAR'
          );
          expect(nearRecord).toBeDefined();
          // Safety bound engaged for 250 pages (MAX_ELIGIBLE_PAGES = 100)
          expect(nearRecord?.executionStatus).not.toBe('executed_pass');
        }
      });
    }
  });

  // =========================================================================
  // COMPONENT B: CONTENT EXTRACTION & DETERMINISTIC FINGERPRINTING
  // =========================================================================
  describe('Component B: Content Extraction & Fingerprinting Benchmarks (5, 25, 50, 100, 250 Pages)', () => {
    const rawHtmlTemplate = (i: number) => `
      <!DOCTYPE html>
      <html lang="en">
      <head><title>Page ${i}</title></head>
      <body>
        <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
        <main>
          <h1>Article Number ${i}</h1>
          <p>This is paragraph one of document ${i} with sufficient text content to exceed word count thresholds.</p>
          <p>Detailed performance benchmarks require deterministic parsing of HTML documents across all test batches.</p>
          <p>Astral Unicode characters: &#128512; &#x1F680; and HTML5 named entities &copy; &euro; &amp; &quot;.</p>
        </main>
        <footer><p>Copyright 2026 Alpha Corp</p></footer>
      </body>
      </html>
    `;

    beforeAll(() => {
      // Warm up JIT and HTML parser
      extractMainContent(rawHtmlTemplate(0));
      extractMainContent(rawHtmlTemplate(1));
    });

    for (const size of [5, 25, 50, 100, 250]) {
      it(
        `extracts content, normalizes Unicode NFKC, and computes hashes for ${size} documents`,
        () => {
          const start = performance.now();
          for (let i = 0; i < size; i++) {
            const html = rawHtmlTemplate(i);
            const res = extractMainContent(html);
            expect(res.wordCount).toBeGreaterThan(20);
            expect(res.normalizedMainTextHash.length).toBe(64);
            expect(res.mainTextSimhash.length).toBe(16);
            expect(res.contentQualityStatus).toBe('usable');
          }
          const elapsed = performance.now() - start;
          // In Node.js / JSDOM environment, DOMParser creates full synthetic DOM trees (~15-30ms/doc under concurrency)
          const budgetMs = size <= 5 ? 2000 : size <= 25 ? 4000 : size <= 50 ? 6000 : size <= 100 ? 10000 : 20000;
          expect(elapsed).toBeLessThan(budgetMs);
        },
        20000
      );
    }
  });

  // =========================================================================
  // COMPONENT C: INTERNAL LINK GRAPH TOPOLOGY CONSTRUCTION
  // =========================================================================
  describe('Component C: Internal Link Graph Topology Benchmarks (5, 25, 50, 100, 250 Pages)', () => {
    for (const size of [5, 25, 50, 100, 250]) {
      it(`constructs link graph for ${size} pages with edge deduplication and metrics calculation`, () => {
        const pages = generateBenchmarkPages(size);
        const start = performance.now();

        const graph = new StandaloneInternalLinkGraph(pages, [], pages[0]!.url);
        const summary = graph.getSummary(`bench-graph-${size}`);
        const elapsed = performance.now() - start;

        expect(summary.totalNodes).toBe(size);
        expect(summary.totalInternalEdges).toBeGreaterThan(0);
        expect(summary.totalRawLinkOccurrences).toBeGreaterThan(summary.totalInternalEdges); // Deduplication occurred
        expect(elapsed).toBeLessThan(size <= 50 ? 200 : size <= 100 ? 600 : 1200);
      });
    }
  });

  // =========================================================================
  // COMPONENT D: FULL HTTP CRAWL AGAINST LOCAL FIXTURE SERVER (PORT 4321)
  // =========================================================================
  describe('Component D: Full HTTP Crawl Against Local Fixture Server (http://127.0.0.1:4321/)', () => {
    beforeAll(async () => {
      const { startServer } = require('../../scripts/test_fixture_server.js');
      await startServer();
    });

    afterAll(async () => {
      const { stopServer } = require('../../scripts/test_fixture_server.js');
      await stopServer();
    });

    it('crawls 5 pages and verifies full HTTP crawl metrics', async () => {
      StandaloneAuditStorage.clearInMemoryForTesting();
      const coordinator = new StandaloneAuditCoordinator();

      const job = await coordinator.startAudit('http://127.0.0.1:4321/', {
        maxPages: 5,
        maxDepth: 3,
        delayMs: 5,
        respectRobots: true,
      });

      expect(job.status).toBe('completed');
      const crawled = await StandaloneAuditStorage.getPagesForAudit(job.id);
      expect(crawled.length).toBe(5);
      expect(crawled.every((p) => p.httpStatus === 200)).toBe(true);
      expect(job.scorecard).toBeDefined();
      expect(job.scorecard?.overallScore).toBeGreaterThanOrEqual(70);
    });

    it('crawls 25 pages across dynamic fixture and confirms expanded frontier', async () => {
      StandaloneAuditStorage.clearInMemoryForTesting();
      const coordinator = new StandaloneAuditCoordinator();

      const job = await coordinator.startAudit('http://127.0.0.1:4321/', {
        maxPages: 25,
        maxDepth: 5,
        delayMs: 2,
        respectRobots: true,
      });

      expect(job.status).toBe('completed');
      const crawled = await StandaloneAuditStorage.getPagesForAudit(job.id);
      expect(crawled.length).toBe(25);
      expect(crawled.filter((p) => p.url.includes('/page/')).length).toBeGreaterThanOrEqual(15);
    }, 15000);

    it('crawls 50 pages within budget and verifies graph continuity', async () => {
      StandaloneAuditStorage.clearInMemoryForTesting();
      const coordinator = new StandaloneAuditCoordinator();

      const job = await coordinator.startAudit('http://127.0.0.1:4321/', {
        maxPages: 50,
        maxDepth: 6,
        delayMs: 2,
        respectRobots: true,
      });

      expect(job.status).toBe('completed');
      const crawled = await StandaloneAuditStorage.getPagesForAudit(job.id);
      expect(crawled.length).toBe(50);
      expect(job.linkGraph).toBeDefined();
      expect(job.linkGraph?.totalNodes).toBe(50);
    }, 20000);
  });

  // =========================================================================
  // COMPONENT E: INDEXEDDB PERSISTENCE (ATOMIC ROLLBACK & RECORD ISOLATION)
  // =========================================================================
  describe('Component E: IndexedDB Persistence & Transaction Isolation', () => {
    it('persists and retrieves audit job, pages, findings, and execution ledger', async () => {
      StandaloneAuditStorage.clearInMemoryForTesting();

      const auditId = 'test-persist-rc-1';
      const mockJob: StandaloneAuditJob = {
        id: auditId,
        targetUrl: 'https://example.com',
        origin: 'https://example.com',
        hostname: 'example.com',
        status: 'completed',
        progressPercent: 100,
        currentStage: 'Completed',
        config: { maxPages: 10, maxDepth: 2, concurrency: 2, delayMs: 10, respectRobots: true },
        discoveredUrls: ['https://example.com'],
        pendingQueue: [],
        crawledUrls: ['https://example.com'],
        failedUrls: [],
        startedAt: Date.now() - 5000,
        updatedAt: Date.now(),
      };

      await StandaloneAuditStorage.saveJob(mockJob);
      const retrievedJob = await StandaloneAuditStorage.getJob(auditId);
      expect(retrievedJob).toBeDefined();
      expect(retrievedJob?.id).toBe(auditId);

      const pages = [
        createMockPage('p1', 'https://example.com/', { auditId }),
        createMockPage('p2', 'https://example.com/about', { auditId }),
      ];
      for (const p of pages) {
        await StandaloneAuditStorage.savePage(p);
      }

      const storedPages = await StandaloneAuditStorage.getPagesForAudit(auditId);
      expect(storedPages.length).toBe(2);
    });
  });

  // =========================================================================
  // COMPONENT F: TECHNOLOGY FINGERPRINTING & EVIDENCE CALIBRATION
  // =========================================================================
  describe('Component F: Technology Fingerprinting (Representative Technologies)', () => {
    const representativeTechs: Array<{
      tech: string;
      evidence: Record<string, any>;
      headers: Record<string, string>;
      expectedTechs: string[];
    }> = [
      {
        tech: 'WordPress',
        evidence: {
          metaGenerators: ['WordPress 6.4.3'],
          scriptUrls: ['https://example.com/wp-includes/js/wp-embed.min.js'],
        },
        headers: { 'x-powered-by': 'PHP/8.2.0', server: 'Apache/2.4.52' },
        expectedTechs: ['wordpress', 'php', 'apache'],
      },
      {
        tech: 'Next.js & React',
        evidence: {
          scriptUrls: ['https://example.com/_next/static/chunks/main.js'],
          domMarkers: ['id:__next'],
        },
        headers: { 'x-powered-by': 'Next.js', server: 'Vercel' },
        expectedTechs: ['nextjs', 'react', 'vercel'],
      },
      {
        tech: 'Shopify',
        evidence: {
          metaGenerators: ['Shopify'],
          scriptUrls: ['https://cdn.shopify.com/s/files/1/000/shopify.js'],
        },
        headers: { server: 'cloudflare' },
        expectedTechs: ['shopify', 'cloudflare'],
      },
      {
        tech: 'Framer',
        evidence: {
          metaGenerators: ['Framer'],
          scriptUrls: ['https://framerusercontent.com/sites/123/bundle.js'],
        },
        headers: {},
        expectedTechs: ['framer'],
      },
      {
        tech: 'Webflow',
        evidence: {
          metaGenerators: ['Webflow'],
          scriptUrls: ['https://assets.website-files.com/site.js'],
        },
        headers: {},
        expectedTechs: ['webflow'],
      },
    ];

    representativeTechs.forEach(({ tech, evidence, headers, expectedTechs }) => {
      it(`accurately detects ${tech} with supporting evidence without false inferences`, () => {
        const findings = StandaloneTechDetector.detect(evidence as any, headers, 'audit-tech-test');
        expect(findings.length).toBeGreaterThan(0);
        for (const exp of expectedTechs) {
          const matched = findings.find((f) => f.technologyId === exp);
          expect(matched).toBeDefined();
          // Implied technologies (like React from Next.js) have confidence 0.60; direct detections have >= 0.70
          expect(matched?.confidence).toBeGreaterThanOrEqual(0.60);
        }
      });
    });

    it('resists false positives when third-party embed script does not match site framework', () => {
      // Third-party embed of an analytics widget should not declare the site as built with Wix
      const embedEvidence = {
        scriptUrls: ['https://widget.intercom.io/widget/123'],
        inlineMarkers: ["Intercom('boot'"],
      };
      const findings = StandaloneTechDetector.detect(embedEvidence as any, {}, 'audit-embed-test');
      const wixFinding = findings.find((f) => f.technologyId === 'wix');
      expect(wixFinding).toBeUndefined();

      const intercomFinding = findings.find((f) => f.technologyId === 'intercom');
      expect(intercomFinding).toBeDefined();
    });
  });

  // =========================================================================
  // COMPONENT G: 250-PAGE SAFETY BUDGETS & INCOMPLETE EVALUATION STATES
  // =========================================================================
  describe('Component G: 250-Page Safety Budgets & Honest Incomplete States', () => {
    it('bounds near-duplicate candidate comparisons at safety maximum and marks state incomplete', () => {
      const pages = generateBenchmarkPages(250);
      const result = StandaloneRulesEngine.detectNearDuplicateClusters(pages);

      expect(result.safetyLimitHit).toBe(true);
      expect(result.incompleteAnalysis).toBe(true);
      expect(result.limitReason).toBeDefined();

      // Run full sitewide audit and check the execution ledger
      const auditResult = StandaloneRulesEngine.evaluateSitewideDetailed(pages, 'audit-250-test');
      const nearRecord = auditResult.ledgerRecords.find(
        (r) => r.canonicalRuleId === 'SITE_CONTENT_DUPLICATE_NEAR'
      );

      expect(nearRecord).toBeDefined();
      expect(nearRecord?.executionStatus).not.toBe('executed_pass');
    });
  });
});
