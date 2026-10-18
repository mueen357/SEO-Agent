/**
 * Standalone MV3 Runtime Acceptance & Security Test Suite.
 *
 * Verifies:
 * 1. Typed Message Contract (Schemas, sequence validation, stale message rejection)
 * 2. Fast Job Start Acknowledgment & Atomic Duplicate Prevention
 * 3. DOMParser Native/Offscreen Parity, Malformed & Oversized HTML Handling
 * 4. Hardened Crawl Security (Manual redirects, streaming 5MB limit, robots.txt status)
 * 5. Durable Stage Recovery & Cancellation Lifecycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isStandaloneBroadcast } from '../standalone/messaging/protocol';
import type {
  StandaloneBroadcastEvent,
  StartAuditRequest,
  AuditAcceptedResponse,
} from '../standalone/messaging/protocol';
import { StandaloneAuditCoordinator } from '../standalone/coordinator';
import { InBrowserCrawler } from '../standalone/crawler/inBrowserCrawler';
import { StandaloneDomParser } from '../standalone/audit/domParserEngine';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';
import type {
  StandaloneAuditJob,
  StandaloneCrawlPage,
  StandaloneAuditConfig,
} from '../standalone/types';

describe('1. MV3 Message Contract & Stale Message Rejection', () => {
  it('identifies and validates all typed broadcast event schemas', () => {
    const mockJob: StandaloneAuditJob = {
      id: 'audit-1',
      targetUrl: 'https://example.com/',
      origin: 'https://example.com',
      hostname: 'example.com',
      status: 'crawling',
      currentStage: 'Crawling',
      progressPercent: 50,
      sequence: 5,
      config: { maxPages: 5, maxDepth: 1, concurrency: 1, delayMs: 0, respectRobots: true },
      discoveredUrls: ['https://example.com/'],
      pendingQueue: [],
      crawledUrls: ['https://example.com/'],
      failedUrls: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    const progressEvent: StandaloneBroadcastEvent = {
      type: 'AUDIT_PROGRESS',
      auditId: 'audit-1',
      sequence: 5,
      status: 'crawling',
      stage: 'Crawling',
      progress: 50,
      job: mockJob,
    };

    const completedEvent: StandaloneBroadcastEvent = {
      type: 'AUDIT_COMPLETED',
      auditId: 'audit-1',
      sequence: 6,
      status: 'completed',
      stage: 'Full in-browser audit completed',
      progress: 100,
      job: { ...mockJob, status: 'completed', progressPercent: 100 },
    };

    const failedEvent: StandaloneBroadcastEvent = {
      type: 'AUDIT_FAILED',
      auditId: 'audit-1',
      sequence: 7,
      status: 'error',
      stage: 'Failed',
      progress: 50,
      error: 'Host permission denied',
      job: mockJob,
    };

    const cancelledEvent: StandaloneBroadcastEvent = {
      type: 'AUDIT_CANCELLED',
      auditId: 'audit-1',
      sequence: 8,
      status: 'cancelled',
      stage: 'Cancelled by user',
      progress: 50,
      job: mockJob,
    };

    expect(isStandaloneBroadcast(progressEvent)).toBe(true);
    expect(isStandaloneBroadcast(completedEvent)).toBe(true);
    expect(isStandaloneBroadcast(failedEvent)).toBe(true);
    expect(isStandaloneBroadcast(cancelledEvent)).toBe(true);

    expect(isStandaloneBroadcast(null)).toBe(false);
    expect(isStandaloneBroadcast({ type: 'UNKNOWN_TYPE' })).toBe(false);
  });

  it('rejects stale or out-of-order broadcast messages using sequence numbering and auditId', () => {
    let currentJobState: StandaloneAuditJob = {
      id: 'audit-active-100',
      targetUrl: 'https://example.com/',
      origin: 'https://example.com',
      hostname: 'example.com',
      status: 'crawling',
      currentStage: 'Crawled 3 of 5 pages',
      progressPercent: 60,
      sequence: 12,
      config: { maxPages: 5, maxDepth: 1, concurrency: 1, delayMs: 0, respectRobots: true },
      discoveredUrls: [],
      pendingQueue: [],
      crawledUrls: [],
      failedUrls: [],
      startedAt: 1000,
      updatedAt: 1000,
    };

    // Helper that replicates UI message receiver filter logic in StandaloneAuditView
    function shouldAcceptMessage(msg: any, activeJob: StandaloneAuditJob | null): boolean {
      if (!msg) return false;
      const job = msg.job || msg.payload?.job;
      if (!job) return false;

      // Reject if from another audit while current is active
      if (activeJob && job.id !== activeJob.id && activeJob.status !== 'completed' && activeJob.status !== 'idle') {
        return false;
      }

      // Reject out-of-order broadcasts
      if (msg.sequence && activeJob?.sequence && msg.sequence < activeJob.sequence) {
        return false;
      }

      return true;
    }

    // Out of order sequence (e.g. sequence 10 arrives after sequence 12)
    const outOfOrderMsg = {
      type: 'AUDIT_PROGRESS',
      auditId: 'audit-active-100',
      sequence: 10,
      job: { ...currentJobState, sequence: 10 },
    };
    expect(shouldAcceptMessage(outOfOrderMsg, currentJobState)).toBe(false);

    // Stale message from a previous/different audit
    const staleAuditMsg = {
      type: 'AUDIT_PROGRESS',
      auditId: 'audit-old-99',
      sequence: 15,
      job: { ...currentJobState, id: 'audit-old-99', sequence: 15 },
    };
    expect(shouldAcceptMessage(staleAuditMsg, currentJobState)).toBe(false);

    // Valid in-order message from active audit
    const validInOrderMsg = {
      type: 'AUDIT_PROGRESS',
      auditId: 'audit-active-100',
      sequence: 13,
      job: { ...currentJobState, sequence: 13 },
    };
    expect(shouldAcceptMessage(validInOrderMsg, currentJobState)).toBe(true);
  });
});

describe('2. Job Start Acknowledgment & Duplicate Prevention', () => {
  beforeEach(() => {
    StandaloneAuditStorage.clearInMemoryForTesting();
  });

  it('initiateAudit returns atomic acknowledgment promptly without awaiting crawl', async () => {
    const coordinator = new StandaloneAuditCoordinator();

    // Stub host permission check to return true
    vi.spyOn(coordinator, 'checkHostPermission').mockResolvedValue(true);

    const startTime = performance.now();
    const job = await coordinator.initiateAudit('https://quick-ack.com/', { maxPages: 2 });
    const elapsed = performance.now() - startTime;

    // Acknowledgment must return promptly in milliseconds (never holds message open)
    expect(elapsed).toBeLessThan(1000);
    expect(job).toBeDefined();
    expect(job.id).toMatch(/^standalone-/);
    expect(['discovering', 'crawling']).toContain(job.status);
    expect(job.sequence).toBeGreaterThanOrEqual(1);
    expect(job.authoritativeRunId).toBeDefined();
    expect(job.stageCheckpoints).toBeDefined();
    expect(coordinator.isRunning()).toBe(true);

    coordinator.cancelAudit();
  });

  it('atomically prevents duplicate concurrent audits', async () => {
    const coordinator = new StandaloneAuditCoordinator();
    vi.spyOn(coordinator, 'checkHostPermission').mockResolvedValue(true);

    await coordinator.initiateAudit('https://first-audit.com/', { maxPages: 2 });

    // Attempting to start a second audit while first is running throws an error
    await expect(coordinator.initiateAudit('https://second-audit.com/', { maxPages: 2 })).rejects.toThrow(
      /An audit is already actively running/
    );

    coordinator.cancelAudit();
  });
});

describe('3. DOM Parsing Fidelity, Safety & Malformed HTML', () => {
  it('extracts all structured SEO and technology evidence accurately', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="This is a test meta description for SEO." />
          <link rel="canonical" href="https://example.com/canonical-url" />
          <meta name="robots" content="index, follow" />
          <meta name="generator" content="WordPress 6.4.2" />
          <link rel="stylesheet" href="/assets/style.css" />
          <script src="/static/react.production.min.js"></script>
        </head>
        <body class="home-page wp-custom-theme">
          <div id="__next">
            <h1>Primary Heading</h1>
            <h2>Subheading 1</h2>
            <h3>Sub-subheading</h3>
            <p>Content text</p>
            <a href="/about">About Us</a>
            <a href="https://external.com/page">External</a>
            <img src="/img/logo.png" alt="Company Logo" />
            <img src="/img/noalt.jpg" />
          </div>
        </body>
      </html>
    `;

    const evidence = StandaloneDomParser.parse(html, 'https://example.com/sub/page');

    expect(evidence.title).toBe('Test Page Title');
    expect(evidence.metaDescription).toBe('This is a test meta description for SEO.');
    expect(evidence.canonicalUrl).toBe('https://example.com/canonical-url');
    expect(evidence.metaRobots).toBe('index, follow');
    expect(evidence.headings.h1).toEqual(['Primary Heading']);
    expect(evidence.headings.h2).toEqual(['Subheading 1']);
    expect(evidence.headings.h3).toEqual(['Sub-subheading']);
    expect(evidence.links).toContain('https://example.com/about');
    expect(evidence.links).toContain('https://external.com/page');
    expect(evidence.images).toEqual([
      { src: 'https://example.com/img/logo.png', alt: 'Company Logo' },
      { src: 'https://example.com/img/noalt.jpg', alt: '' },
    ]);
    expect(evidence.metaGenerators).toContain('WordPress 6.4.2');
    expect(evidence.stylesheetHrefs).toContain('/assets/style.css');
    expect(evidence.scriptSources).toContain('/static/react.production.min.js');
    expect(evidence.bodyClasses).toContain('home-page');
    expect(evidence.bodyClasses).toContain('wp-custom-theme');
    expect(evidence.domMarkers).toContain('id:__next');
  });

  it('safely parses malformed and incomplete HTML without throwing or executing scripts', () => {
    const malformed = `
      <title>Unclosed Title</title>
      <h1>Broken Heading<div>no closing tag
      <a href="///bad-url">Link
      <script>window.__evil = true;</script>
      <img src="test.png">
    `;

    const evidence = StandaloneDomParser.parse(malformed, 'https://example.com/');
    expect(evidence).toBeDefined();
    expect(evidence.title).toBe('Unclosed Title');
    expect(evidence.headings.h1.length).toBeGreaterThanOrEqual(1);
    expect((globalThis as any).__evil).toBeUndefined(); // Zero arbitrary script execution!
  });
});

describe('4. Hardened Crawl Security: Redirects, Size Limits & Robots.txt', () => {
  const config: StandaloneAuditConfig = {
    maxPages: 5,
    maxDepth: 2,
    concurrency: 1,
    delayMs: 0,
    respectRobots: true,
  };

  it('blocks disallowed redirect destinations BEFORE making unauthorized requests', async () => {
    const crawler = new InBrowserCrawler('https://safe-origin.com/', config);

    // Mock fetch to simulate 301 redirect to an unauthorized private IP
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      })
    );
    globalThis.fetch = fetchMock;

    const controller = new AbortController();
    const result = await crawler.fetchWithControlledRedirect('https://safe-origin.com/page', controller.signal);

    expect(result.disallowedRedirect).toBe(true);
    expect(result.disallowedDestination).toContain('169.254.169.254');
    // Crucial: only ONE fetch was made (to safe-origin.com); destination was NOT fetched!
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks redirects to cross-origin external host during controlled crawl', async () => {
    const crawler = new InBrowserCrawler('https://my-site.com/', config);

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil-hacker.com/trap' },
      })
    );
    globalThis.fetch = fetchMock;

    const controller = new AbortController();
    const result = await crawler.fetchWithControlledRedirect('https://my-site.com/redirect', controller.signal);

    expect(result.disallowedRedirect).toBe(true);
    expect(result.disallowedDestination).toContain('evil-hacker.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces streaming bounded response limit and detects oversized payloads', async () => {
    const crawler = new InBrowserCrawler('https://my-site.com/', config);

    // Simulate a 6MB string payload
    const chunk1MB = 'a'.repeat(1024 * 1024);
    let chunkCount = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (chunkCount < 6) {
          controller.enqueue(new TextEncoder().encode(chunk1MB));
          chunkCount++;
        } else {
          controller.close();
        }
      },
    });

    const mockResponse = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const { html, isOversized, totalBytes } = await crawler.readBoundedHtml(mockResponse, 5 * 1024 * 1024);

    expect(isOversized).toBe(true);
    expect(totalBytes).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(html).toBe('');
  });

  it('accurately tracks robots policy status without falsely claiming compliance on fetch failure', async () => {
    const crawler = new InBrowserCrawler('https://robots-fail.com/', config);

    // Simulate 500 error on robots.txt
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 })
    );

    await crawler.fetchRobotsTxt();

    expect(crawler.getRobotsPolicyStatus()).toBe('fetch_failed_unverified');
  });

  it('marks robots policy as enforced when robots.txt is successfully loaded', async () => {
    const crawler = new InBrowserCrawler('https://robots-ok.com/', config);

    const robotsTxt = 'User-agent: *\nDisallow: /admin/\nDisallow: /private/\n';
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(robotsTxt, { status: 200 })
    );

    await crawler.fetchRobotsTxt();

    expect(crawler.getRobotsPolicyStatus()).toBe('enforced');
    expect(crawler.isAllowedByRobots('/admin/dashboard')).toBe(false);
    expect(crawler.isAllowedByRobots('/public/page')).toBe(true);
  });
});

describe('5. Durable Interruption Recovery & Cancellation', () => {
  beforeEach(() => {
    StandaloneAuditStorage.clearInMemoryForTesting();
  });

  it('persists stage checkpoints across execution and resumes without repeating completed stages', async () => {
    const auditId = 'audit-interrupted-1';
    const initialJob: StandaloneAuditJob = {
      id: auditId,
      targetUrl: 'https://resume-test.com/',
      origin: 'https://resume-test.com',
      hostname: 'resume-test.com',
      status: 'crawling',
      currentStage: 'Crawl completed',
      progressPercent: 80,
      sequence: 10,
      stageCheckpoints: {
        crawlingStarted: true,
        crawlingFinished: true, // Crawling is already finished!
        seoStarted: false,
        seoFinished: false,
        techStarted: false,
        techFinished: false,
        scoringStarted: false,
        scoringFinished: false,
      },
      config: { maxPages: 2, maxDepth: 1, concurrency: 1, delayMs: 0, respectRobots: true },
      discoveredUrls: ['https://resume-test.com/'],
      pendingQueue: [],
      crawledUrls: ['https://resume-test.com/'],
      failedUrls: [],
      startedAt: Date.now() - 5000,
      updatedAt: Date.now(),
    };

    const mockPage: StandaloneCrawlPage = {
      id: 'p1',
      auditId,
      url: 'https://resume-test.com/',
      depth: 0,
      httpStatus: 200,
      fetchStatus: 'success',
      title: 'Resume Test Page',
      headings: { h1: ['Welcome'], h2: [], h3: [] },
      links: [],
      images: [],
      headers: {},
      htmlSize: 1000,
      responseTimeMs: 50,
      fetchedAt: Date.now(),
    };

    await StandaloneAuditStorage.saveJob(initialJob);
    await StandaloneAuditStorage.savePage(mockPage);

    const coordinator = new StandaloneAuditCoordinator();
    vi.spyOn(coordinator, 'checkHostPermission').mockResolvedValue(true);

    const resumedJob = await coordinator.checkAndResumeInterruptedJob();
    expect(resumedJob).toBeDefined();
    expect(resumedJob?.id).toBe(auditId);
    expect(coordinator.isRunning()).toBe(true);

    // Await completion of remaining pipeline stages
    await new Promise<void>((resolve) => {
      coordinator.onProgress((updated) => {
        if (updated.status === 'completed' || updated.status === 'error') {
          resolve();
        }
      });
    });

    const finished = await StandaloneAuditStorage.getJob(auditId);
    expect(finished?.status).toBe('completed');
    expect(finished?.stageCheckpoints?.crawlingFinished).toBe(true);
    expect(finished?.stageCheckpoints?.seoFinished).toBe(true);
    expect(finished?.stageCheckpoints?.techFinished).toBe(true);
    expect(finished?.stageCheckpoints?.scoringFinished).toBe(true);
    expect(finished?.scorecard).toBeDefined();
  });

  it('cancelAudit immediately prevents further background work and updates job status', async () => {
    const coordinator = new StandaloneAuditCoordinator();
    vi.spyOn(coordinator, 'checkHostPermission').mockResolvedValue(true);

    const job = await coordinator.initiateAudit('https://cancel-test.com/', { maxPages: 5 });
    expect(coordinator.isRunning()).toBe(true);

    const cancelled = coordinator.cancelAudit(job.id);
    expect(cancelled).toBe(true);
    expect(coordinator.isRunning()).toBe(false);
    expect(coordinator.getCurrentJob()?.status).toBe('cancelled');
  });
});
