import { describe, it, expect, beforeEach } from 'vitest';
import { StandaloneAuditStorage, normalizeOrigin } from '../standalone/persistence/indexedDb';
import { InBrowserCrawler } from '../standalone/crawler/inBrowserCrawler';
import type { StandaloneAuditJob, StandaloneAuditScorecard } from '../standalone/types';

describe('Phase 4E Release Hardening & User Acceptance Tests', () => {
  beforeEach(() => {
    StandaloneAuditStorage.clearInMemoryForTesting();
  });

  // =========================================================================
  // 1. AUDIT CONTEXT ISOLATION & ORIGIN NORMALIZATION
  // =========================================================================
  describe('Origin Normalization & Context Isolation', () => {
    it('normalizes various URLs and origins correctly', () => {
      expect(normalizeOrigin('https://Example.COM/path/to/page?q=1#hash')).toBe('https://example.com');
      expect(normalizeOrigin('http://127.0.0.1:4321/nested/')).toBe('http://127.0.0.1:4321');
      expect(normalizeOrigin('http://127.0.0.1:8000/')).toBe('http://127.0.0.1:8000');
      expect(normalizeOrigin('https://sub.domain.org:8443/')).toBe('https://sub.domain.org:8443');
      expect(normalizeOrigin('')).toBe('');
    });

    it('retrieves only the audit belonging to the requested target site', async () => {
      const jobA: StandaloneAuditJob = {
        id: 'job-site-a',
        targetUrl: 'https://site-a.com/landing',
        origin: 'https://site-a.com',
        hostname: 'site-a.com',
        status: 'completed',
        progressPercent: 100,
        currentStage: 'Completed',
        config: { maxPages: 10 },
        discoveredUrls: ['https://site-a.com/landing'],
        pendingQueue: [],
        crawledUrls: ['https://site-a.com/landing'],
        failedUrls: [],
        startedAt: 1000,
        updatedAt: 2000,
        scorecard: {
          overallScore: 92,
          grade: 'A',
          available: true,
          onPageScore: 90,
          technicalScore: 95,
          sitewideScore: 91,
          pagesCrawled: 1,
          usablePagesCount: 1,
          attemptedPagesCount: 1,
          failedPagesCount: 0,
          totalIssuesCount: 2,
          criticalIssuesCount: 0,
          highIssuesCount: 1,
          mediumIssuesCount: 1,
          lowIssuesCount: 0,
          coverage: {
            policyVersion: '1.0',
            scoreState: 'fully_evaluated',
            scoreStateLabel: 'Fully Evaluated',
            coverageRatio: 1.0,
            expectedRulesTotal: 51,
            implementedRulesCount: 51,
            executedRulesTotal: 51,
            applicableRulesCount: 51,
            missingRulesTotal: 0,
            passedRulesCount: 45,
            failedRulesCount: 2,
            warningRulesCount: 4,
            notApplicableRulesCount: 0,
            notEvaluatedRulesCount: 0,
            unavailableEvidenceCount: 0,
            passedChecksCount: 45,
            failedChecksCount: 2,
            warningChecksCount: 4,
            unknownCount: 0,
            familyCoverage: {
              on_page: { executed: 17, total: 17, ratio: 1.0 },
              technical: { executed: 24, total: 24, ratio: 1.0 },
              sitewide: { executed: 10, total: 10, ratio: 1.0 },
            },
          },
          calculatedAt: 2000,
        },
      };

      const jobB: StandaloneAuditJob = {
        id: 'job-site-b',
        targetUrl: 'http://127.0.0.1:4321/index.html',
        origin: 'http://127.0.0.1:4321',
        hostname: '127.0.0.1',
        status: 'completed',
        progressPercent: 100,
        currentStage: 'Completed',
        config: { maxPages: 5 },
        discoveredUrls: ['http://127.0.0.1:4321/index.html'],
        pendingQueue: [],
        crawledUrls: ['http://127.0.0.1:4321/index.html'],
        failedUrls: [],
        startedAt: 3000,
        updatedAt: 4000,
        scorecard: {
          overallScore: 84,
          grade: 'B',
          available: true,
          onPageScore: 80,
          technicalScore: 85,
          sitewideScore: 87,
          pagesCrawled: 5,
          usablePagesCount: 5,
          attemptedPagesCount: 5,
          failedPagesCount: 0,
          totalIssuesCount: 4,
          criticalIssuesCount: 0,
          highIssuesCount: 2,
          mediumIssuesCount: 2,
          lowIssuesCount: 0,
          coverage: {
            policyVersion: '1.0',
            scoreState: 'fully_evaluated',
            scoreStateLabel: 'Fully Evaluated',
            coverageRatio: 1.0,
            expectedRulesTotal: 51,
            implementedRulesCount: 51,
            executedRulesTotal: 51,
            applicableRulesCount: 51,
            missingRulesTotal: 0,
            passedRulesCount: 40,
            failedRulesCount: 4,
            warningRulesCount: 7,
            notApplicableRulesCount: 0,
            notEvaluatedRulesCount: 0,
            unavailableEvidenceCount: 0,
            passedChecksCount: 40,
            failedChecksCount: 4,
            warningChecksCount: 7,
            unknownCount: 0,
            familyCoverage: {
              on_page: { executed: 17, total: 17, ratio: 1.0 },
              technical: { executed: 24, total: 24, ratio: 1.0 },
              sitewide: { executed: 10, total: 10, ratio: 1.0 },
            },
          },
          calculatedAt: 4000,
        },
      };

      await StandaloneAuditStorage.saveJob(jobA);
      await StandaloneAuditStorage.saveJob(jobB);

      // Querying for site A must return job A, never job B
      const resolvedA = await StandaloneAuditStorage.getLatestJobForTarget('https://site-a.com/some/other/path');
      expect(resolvedA).toBeDefined();
      expect(resolvedA?.id).toBe('job-site-a');
      expect(resolvedA?.scorecard?.overallScore).toBe(92);

      // Querying for site B must return job B
      const resolvedB = await StandaloneAuditStorage.getLatestJobForTarget('http://127.0.0.1:4321/products');
      expect(resolvedB).toBeDefined();
      expect(resolvedB?.id).toBe('job-site-b');
      expect(resolvedB?.scorecard?.overallScore).toBe(84);

      // Querying for un-audited site C must return undefined (Context Isolation!)
      const resolvedC = await StandaloneAuditStorage.getLatestJobForTarget('https://site-c.org/');
      expect(resolvedC).toBeUndefined();

      // Querying with different port on same host must return undefined (Port Isolation!)
      const resolvedPort8000 = await StandaloneAuditStorage.getLatestJobForTarget('http://127.0.0.1:8000/');
      expect(resolvedPort8000).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. FALSE PERFECT SCORE PREVENTION
  // =========================================================================
  describe('False Perfect Score Prevention', () => {
    function computeDisplayScore(job: StandaloneAuditJob | null): {
      hasScore: boolean;
      scoreText: string;
      statusText: string;
      isProvisional: boolean;
      isEmptyState: boolean;
    } {
      if (!job) {
        return {
          hasScore: false,
          scoreText: '',
          statusText: 'No audit performed for this website yet.',
          isProvisional: false,
          isEmptyState: true,
        };
      }

      if (job.status === 'failed' || job.status === 'error') {
        return {
          hasScore: false,
          scoreText: 'Score Unavailable',
          statusText: 'Audit Failed',
          isProvisional: false,
          isEmptyState: false,
        };
      }

      if (job.status === 'cancelled') {
        return {
          hasScore: false,
          scoreText: 'Score Unavailable',
          statusText: 'Audit Cancelled',
          isProvisional: false,
          isEmptyState: false,
        };
      }

      const hasScore = typeof job.scorecard?.overallScore === 'number';
      const isProvisional = Boolean(
        job.scorecard?.coverage?.scoreState === 'provisional' ||
        job.status === 'completed_with_limitations' ||
        job.status === 'partial'
      );

      if (hasScore) {
        const score = job.scorecard!.overallScore;
        const grade = job.scorecard?.grade || 'Provisional';
        const suffix = isProvisional ? ' • Provisional / Limited' : '';
        return {
          hasScore: true,
          scoreText: `Score: ${score}/100 (${grade})${suffix}`,
          statusText: isProvisional ? 'Limited' : 'Pass',
          isProvisional,
          isEmptyState: false,
        };
      }

      return {
        hasScore: false,
        scoreText: isProvisional ? 'Score Unavailable (Provisional / Limited)' : 'Score Unavailable',
        statusText: isProvisional ? 'Limited' : 'Incomplete',
        isProvisional,
        isEmptyState: false,
      };
    }

    it('renders clean empty state when no audit exists for target', () => {
      const res = computeDisplayScore(null);
      expect(res.isEmptyState).toBe(true);
      expect(res.hasScore).toBe(false);
      expect(res.statusText).toContain('No audit performed for this website yet');
    });

    it('renders "Score Unavailable" and "Audit Failed" on failed audit', () => {
      const failedJob: StandaloneAuditJob = {
        id: 'failed-job',
        targetUrl: 'https://example.com',
        origin: 'https://example.com',
        hostname: 'example.com',
        status: 'failed',
        progressPercent: 10,
        currentStage: 'Failed',
        config: { maxPages: 10 },
        discoveredUrls: [],
        pendingQueue: [],
        crawledUrls: [],
        failedUrls: ['https://example.com'],
        startedAt: 100,
        updatedAt: 200,
        errorMessage: 'Connection refused',
      };
      const res = computeDisplayScore(failedJob);
      expect(res.scoreText).toBe('Score Unavailable');
      expect(res.statusText).toBe('Audit Failed');
      expect(res.hasScore).toBe(false);
    });

    it('renders "Score Unavailable" and "Audit Cancelled" on user-cancelled audit', () => {
      const cancelledJob: StandaloneAuditJob = {
        id: 'cancelled-job',
        targetUrl: 'https://example.com',
        origin: 'https://example.com',
        hostname: 'example.com',
        status: 'cancelled',
        progressPercent: 40,
        currentStage: 'Cancelled',
        config: { maxPages: 10 },
        discoveredUrls: [],
        pendingQueue: [],
        crawledUrls: [],
        failedUrls: [],
        startedAt: 100,
        updatedAt: 200,
      };
      const res = computeDisplayScore(cancelledJob);
      expect(res.scoreText).toBe('Score Unavailable');
      expect(res.statusText).toBe('Audit Cancelled');
      expect(res.hasScore).toBe(false);
    });

    it('renders "Score Unavailable" when completed audit has missing scorecard', () => {
      const corruptJob: StandaloneAuditJob = {
        id: 'corrupt-job',
        targetUrl: 'https://example.com',
        origin: 'https://example.com',
        hostname: 'example.com',
        status: 'completed',
        progressPercent: 100,
        currentStage: 'Completed',
        config: { maxPages: 10 },
        discoveredUrls: ['https://example.com'],
        pendingQueue: [],
        crawledUrls: ['https://example.com'],
        failedUrls: [],
        startedAt: 100,
        updatedAt: 200,
        scorecard: undefined, // Missing scorecard!
      };
      const res = computeDisplayScore(corruptJob);
      expect(res.hasScore).toBe(false);
      expect(res.scoreText).toBe('Score Unavailable');
      // Crucial: Must NEVER show 100/100 (A)!
      expect(res.scoreText).not.toContain('100/100');
    });

    it('renders "Provisional / Limited" when completed with limitations', () => {
      const limitedJob: StandaloneAuditJob = {
        id: 'limited-job',
        targetUrl: 'https://example.com',
        origin: 'https://example.com',
        hostname: 'example.com',
        status: 'completed_with_limitations',
        progressPercent: 100,
        currentStage: 'Completed with limitations',
        config: { maxPages: 10 },
        discoveredUrls: ['https://example.com', 'https://example.com/page2'],
        pendingQueue: [],
        crawledUrls: ['https://example.com'],
        failedUrls: ['https://example.com/page2'],
        startedAt: 100,
        updatedAt: 200,
        scorecard: {
          overallScore: 78,
          grade: 'C',
          available: true,
          onPageScore: 80,
          technicalScore: 75,
          sitewideScore: 79,
          pagesCrawled: 1,
          usablePagesCount: 1,
          attemptedPagesCount: 2,
          failedPagesCount: 1,
          totalIssuesCount: 3,
          criticalIssuesCount: 0,
          highIssuesCount: 1,
          mediumIssuesCount: 1,
          lowIssuesCount: 1,
          coverage: {
            policyVersion: '1.0',
            scoreState: 'provisional',
            scoreStateLabel: 'Provisional',
            coverageRatio: 0.6,
            expectedRulesTotal: 51,
            implementedRulesCount: 51,
            executedRulesTotal: 30,
            applicableRulesCount: 30,
            missingRulesTotal: 21,
            passedRulesCount: 25,
            failedRulesCount: 3,
            warningRulesCount: 2,
            notApplicableRulesCount: 0,
            notEvaluatedRulesCount: 21,
            unavailableEvidenceCount: 1,
            passedChecksCount: 25,
            failedChecksCount: 3,
            warningChecksCount: 2,
            unknownCount: 0,
            familyCoverage: {
              on_page: { executed: 15, total: 17, ratio: 0.88 },
              technical: { executed: 12, total: 24, ratio: 0.5 },
              sitewide: { executed: 3, total: 10, ratio: 0.3 },
            },
          },
          calculatedAt: 200,
        },
      };
      const res = computeDisplayScore(limitedJob);
      expect(res.hasScore).toBe(true);
      expect(res.isProvisional).toBe(true);
      expect(res.scoreText).toBe('Score: 78/100 (C) • Provisional / Limited');
      expect(res.statusText).toBe('Limited');
    });

    it('renders 100/100 Grade A ONLY when backed by a verified complete scorecard', () => {
      const perfectJob: StandaloneAuditJob = {
        id: 'perfect-job',
        targetUrl: 'https://example.com',
        origin: 'https://example.com',
        hostname: 'example.com',
        status: 'completed',
        progressPercent: 100,
        currentStage: 'Completed',
        config: { maxPages: 10 },
        discoveredUrls: ['https://example.com'],
        pendingQueue: [],
        crawledUrls: ['https://example.com'],
        failedUrls: [],
        startedAt: 100,
        updatedAt: 200,
        scorecard: {
          overallScore: 100,
          grade: 'A',
          available: true,
          onPageScore: 100,
          technicalScore: 100,
          sitewideScore: 100,
          pagesCrawled: 1,
          usablePagesCount: 1,
          attemptedPagesCount: 1,
          failedPagesCount: 0,
          totalIssuesCount: 0,
          criticalIssuesCount: 0,
          highIssuesCount: 0,
          mediumIssuesCount: 0,
          lowIssuesCount: 0,
          coverage: {
            policyVersion: '1.0',
            scoreState: 'fully_evaluated',
            scoreStateLabel: 'Fully Evaluated',
            coverageRatio: 1.0,
            expectedRulesTotal: 51,
            implementedRulesCount: 51,
            executedRulesTotal: 51,
            applicableRulesCount: 51,
            missingRulesTotal: 0,
            passedRulesCount: 51,
            failedRulesCount: 0,
            warningRulesCount: 0,
            notApplicableRulesCount: 0,
            notEvaluatedRulesCount: 0,
            unavailableEvidenceCount: 0,
            passedChecksCount: 51,
            failedChecksCount: 0,
            warningChecksCount: 0,
            unknownCount: 0,
            familyCoverage: {
              on_page: { executed: 17, total: 17, ratio: 1.0 },
              technical: { executed: 24, total: 24, ratio: 1.0 },
              sitewide: { executed: 10, total: 10, ratio: 1.0 },
            },
          },
          calculatedAt: 200,
        },
      };
      const res = computeDisplayScore(perfectJob);
      expect(res.hasScore).toBe(true);
      expect(res.scoreText).toBe('Score: 100/100 (A)');
      expect(res.statusText).toBe('Pass');
      expect(res.isProvisional).toBe(false);
    });
  });

  // =========================================================================
  // 3. HOST PERMISSION & MATCH PATTERN HARDENING
  // =========================================================================
  describe('Host Permissions & Crawler SSRF Protection', () => {
    it('creates standard Chrome MV3 match patterns without port numbers', () => {
      function toChromeMatchPattern(url: string): string {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.hostname}/*`;
      }

      expect(toChromeMatchPattern('http://127.0.0.1:4321/')).toBe('http://127.0.0.1/*');
      expect(toChromeMatchPattern('http://127.0.0.1:8000/api')).toBe('http://127.0.0.1/*');
      expect(toChromeMatchPattern('https://example.com:8443/test')).toBe('https://example.com/*');
      expect(toChromeMatchPattern('https://sub.my-site.org/')).toBe('https://sub.my-site.org/*');
    });

    it('enforces exact port in crawler application layer to prevent SSRF', () => {
      const crawler = new InBrowserCrawler('http://127.0.0.1:4321/', { maxPages: 5 });
      // Fixture port 4321 is in scope
      expect(crawler.isInScope('http://127.0.0.1:4321/')).toBe(true);
      expect(crawler.isInScope('http://127.0.0.1:4321/about')).toBe(true);

      // Other ports on 127.0.0.1 (e.g. backend port 8000, SSH port 22) MUST be blocked
      expect(crawler.isInScope('http://127.0.0.1:8000/')).toBe(false);
      expect(crawler.isInScope('http://127.0.0.1:22/')).toBe(false);
      expect(crawler.isInScope('http://127.0.0.1:8080/')).toBe(false);

      // Other local hostnames/IPs must be blocked
      expect(crawler.isInScope('http://localhost:4321/')).toBe(false);
      expect(crawler.isInScope('http://127.0.0.2:4321/')).toBe(false);
      expect(crawler.isInScope('http://0.0.0.0:4321/')).toBe(false);
    });
  });
});
