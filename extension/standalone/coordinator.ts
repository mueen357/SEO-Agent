/**
 * Standalone Audit Coordinator.
 * Orchestrates the full in-browser audit pipeline without any backend server.
 * Supports durable stage checkpoints, service worker lifecycle resumption,
 * authoritative execution ownership, fast start acknowledgment, and real evidence retention.
 */

import type {
  StandaloneAuditConfig,
  StandaloneAuditJob,
  StandaloneCrawlPage,
  StandaloneSeoFinding,
  StandaloneTechFinding,
  StandaloneStageCheckpoints,
} from './types';
import { normalizeRobotsEvidence, normalizeSitemapEvidence } from './types';
import { StandaloneAuditStorage } from './persistence/indexedDb';
import { InBrowserCrawler } from './crawler/inBrowserCrawler';
import { StandaloneRulesEngine } from './audit/clientRules';
import { StandaloneTechDetector } from './audit/clientTechDetector';
import { StandaloneScoringCalculator } from './audit/scoring';

export type ProgressListener = (job: StandaloneAuditJob) => void;

export class StandaloneAuditCoordinator {
  private currentJob: StandaloneAuditJob | null = null;
  private isCancelledFlag = false;
  private isRunningFlag = false;
  private currentRunId: string | null = null;
  private progressListeners: ProgressListener[] = [];

  public onProgress(listener: ProgressListener): () => void {
    this.progressListeners.push(listener);
    return () => {
      this.progressListeners = this.progressListeners.filter((l) => l !== listener);
    };
  }

  public getCurrentJob(): StandaloneAuditJob | null {
    return this.currentJob;
  }

  public isRunning(): boolean {
    return this.isRunningFlag;
  }

  private notify(
    job: StandaloneAuditJob,
    eventType: 'AUDIT_PROGRESS' | 'AUDIT_COMPLETED' | 'AUDIT_FAILED' | 'AUDIT_CANCELLED' = 'AUDIT_PROGRESS'
  ): void {
    this.currentJob = job;
    job.sequence = (job.sequence || 0) + 1;

    // Broadcast typed progress event over chrome.runtime if available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: eventType,
        auditId: job.id,
        sequence: job.sequence,
        status: job.status,
        stage: job.currentStage,
        progress: job.progressPercent,
        job: { ...job },
        // Legacy fallback for backward compatibility
        action: 'STANDALONE_AUDIT_PROGRESS',
        payload: { job: { ...job } },
      }).catch(() => {
        // Expected when no extension views or listeners are actively open
      });
    }

    for (const listener of this.progressListeners) {
      try {
        listener({ ...job });
      } catch (e) {
        console.error('Error in progress listener:', e);
      }
    }
  }

  public cancelAudit(auditId?: string): boolean {
    if (auditId && this.currentJob && this.currentJob.id !== auditId) {
      return false; // Stale cancel request for another audit
    }

    this.isCancelledFlag = true;
    this.currentRunId = null;

    if (this.currentJob) {
      this.currentJob.status = 'cancelled';
      this.currentJob.currentStage = 'Audit cancelled by user';
      this.currentJob.updatedAt = Date.now();
      this.notify(this.currentJob, 'AUDIT_CANCELLED');
      StandaloneAuditStorage.saveJob(this.currentJob).catch(() => {});
    }

    this.isRunningFlag = false;
    return true;
  }

  public async checkHostPermission(targetUrl: string): Promise<boolean> {
    try {
      const parsed = new URL(targetUrl);
      const originPattern = `${parsed.origin}/*`;
      if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.contains) {
        return await new Promise<boolean>((resolve) => {
          chrome.permissions.contains({ origins: [originPattern] }, (has) => resolve(Boolean(has)));
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  public async requestHostPermission(targetUrl: string): Promise<boolean> {
    try {
      const parsed = new URL(targetUrl);
      const originPattern = `${parsed.origin}/*`;

      if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.request) {
        return await new Promise<boolean>((resolve) => {
          chrome.permissions.request(
            {
              origins: [originPattern],
            },
            (granted) => {
              resolve(Boolean(granted));
            }
          );
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Atomically initiates an audit, validates scope and host permission, persists initial job record,
   * spawns background execution, and returns acknowledgment immediately (within milliseconds).
   * Never holds the message channel open for the entire crawl!
   */
  public async initiateAudit(
    targetUrl: string,
    userConfig?: Partial<StandaloneAuditConfig>
  ): Promise<StandaloneAuditJob> {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS URLs are supported.');
      }
    } catch (e: any) {
      throw new Error(`Invalid target URL: ${e.message}`);
    }

    // Atomic duplicate prevention: prevent launching concurrent overlapping crawls
    if (
      this.isRunningFlag &&
      this.currentJob &&
      (this.currentJob.status === 'crawling' ||
        this.currentJob.status === 'analyzing' ||
        this.currentJob.status === 'scoring')
    ) {
      throw new Error(`An audit is already actively running for ${this.currentJob.targetUrl}. Cancel it before starting a new one.`);
    }

    // Host permission verification
    const hasPerm = await this.checkHostPermission(targetUrl);
    if (!hasPerm) {
      throw new Error(`Host permission not granted for ${parsed.origin}. Please grant permission first.`);
    }

    const config: StandaloneAuditConfig = {
      maxPages: userConfig?.maxPages || 10,
      maxDepth: userConfig?.maxDepth || 2,
      concurrency: userConfig?.concurrency || 2,
      delayMs: userConfig?.delayMs ?? 100,
      respectRobots: userConfig?.respectRobots ?? true,
    };

    const auditId = `standalone-${Date.now()}`;
    const initialCheckpoints: StandaloneStageCheckpoints = {
      crawlingStarted: false,
      crawlingFinished: false,
      seoStarted: false,
      seoFinished: false,
      techStarted: false,
      techFinished: false,
      scoringStarted: false,
      scoringFinished: false,
    };

    const normalizedTargetUrl = parsed.href;

    const job: StandaloneAuditJob = {
      id: auditId,
      targetUrl: normalizedTargetUrl,
      origin: parsed.origin,
      hostname: parsed.hostname,
      status: 'discovering',
      progressPercent: 5,
      currentStage: 'Validating host permissions & discovering seed',
      sequence: 1,
      stageCheckpoints: initialCheckpoints,
      config,
      discoveredUrls: [normalizedTargetUrl],
      pendingQueue: [{ url: normalizedTargetUrl, depth: 0 }],
      crawledUrls: [],
      failedUrls: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Durable initial checkpoint write
    await StandaloneAuditStorage.saveJob(job);

    this.currentJob = job;
    this.isCancelledFlag = false;
    this.isRunningFlag = true;
    const runId = Math.random().toString(36).substring(2);
    this.currentRunId = runId;
    job.authoritativeRunId = runId;

    this.notify(job, 'AUDIT_PROGRESS');

    // Launch background pipeline without awaiting completion!
    this.executePipeline(job, [], runId).catch((err) => {
      console.error('[StandaloneCoordinator] Unhandled background pipeline error:', err);
    });

    return job;
  }

  /**
   * Backward-compatible startAudit that initiates and awaits pipeline completion.
   * Used primarily by unit tests and direct callers.
   */
  public async startAudit(
    targetUrl: string,
    userConfig?: Partial<StandaloneAuditConfig>
  ): Promise<StandaloneAuditJob> {
    const job = await this.initiateAudit(targetUrl, userConfig);

    return new Promise<StandaloneAuditJob>((resolve) => {
      const unsubscribe = this.onProgress((updated) => {
        if (
          updated.id === job.id &&
          (updated.status === 'completed' ||
            updated.status === 'completed_with_limitations' ||
            updated.status === 'partial' ||
            updated.status === 'failed' ||
            updated.status === 'cancelled' ||
            updated.status === 'error')
        ) {
          unsubscribe();
          resolve(updated);
        }
      });
    });
  }

  /**
   * Resumes interrupted audits across Service Worker restarts or sidepanel closures.
   * Authoritatively continues from persisted stage checkpoints.
   */
  public async checkAndResumeInterruptedJob(): Promise<StandaloneAuditJob | null> {
    if (this.isRunningFlag && this.currentJob) {
      return this.currentJob;
    }

    const latest = await StandaloneAuditStorage.getLatestJob();
    if (!latest) return null;

    // If audit already reached terminal state, do not re-execute
    if (
      latest.status === 'completed' ||
      latest.status === 'completed_with_limitations' ||
      latest.status === 'partial' ||
      latest.status === 'failed' ||
      latest.status === 'cancelled' ||
      latest.status === 'error'
    ) {
      return latest;
    }

    console.log(`[StandaloneCoordinator] Resuming interrupted audit ${latest.id} from stage: ${latest.status}`);
    const crawledPages = await StandaloneAuditStorage.getPagesForAudit(latest.id);

    this.isCancelledFlag = false;
    this.isRunningFlag = true;
    const runId = Math.random().toString(36).substring(2);
    this.currentRunId = runId;
    latest.authoritativeRunId = runId;

    // Resume execution from last checkpoint
    this.executePipeline(latest, crawledPages, runId).catch((err) => {
      console.error('[StandaloneCoordinator] Resume pipeline error:', err);
    });

    return latest;
  }

  private async executePipeline(
    job: StandaloneAuditJob,
    existingPages: StandaloneCrawlPage[],
    runId: string
  ): Promise<StandaloneAuditJob> {
    const auditId = job.id;
    const config = job.config;

    // Ensure checkpoints object exists
    if (!job.stageCheckpoints) {
      job.stageCheckpoints = {
        crawlingStarted: false,
        crawlingFinished: false,
        seoStarted: false,
        seoFinished: false,
        techStarted: false,
        techFinished: false,
        scoringStarted: false,
        scoringFinished: false,
      };
    }

    try {
      const crawledPages: StandaloneCrawlPage[] = [...existingPages];

      // Stage 1: In-Browser Crawl (if not already finished)
      if (!job.stageCheckpoints.crawlingFinished) {
        job.status = 'crawling';
        job.currentStage = 'Fetching and parsing in-scope pages';
        job.stageCheckpoints.crawlingStarted = true;
        this.notify(job, 'AUDIT_PROGRESS');

        const crawler = new InBrowserCrawler(
          job.targetUrl,
          config,
          job.pendingQueue.length > 0 ? job.pendingQueue : undefined,
          job.discoveredUrls
        );

        await crawler.run({
          onPageCrawled: async (page) => {
            // Guard: Authoritative ownership check
            if (this.currentRunId !== runId || this.isCancelledFlag) return;

            page.auditId = auditId;
            crawledPages.push(page);
            job.crawledUrls.push(page.url);
            job.pendingQueue = crawler.getPendingQueue();
            job.discoveredUrls = crawler.getDiscoveredUrls();
            job.progressPercent = Math.min(80, Math.round((crawledPages.length / config.maxPages) * 75) + 5);
            job.currentStage = `Crawled ${crawledPages.length} of ${config.maxPages} pages`;
            job.updatedAt = Date.now();
            this.notify(job, 'AUDIT_PROGRESS');

            await StandaloneAuditStorage.savePage(page);
            await StandaloneAuditStorage.saveJob(job);
          },
          onProgress: (crawled, total, currentUrl) => {
            if (this.currentRunId !== runId || this.isCancelledFlag) return;
            job.currentStage = `Fetching: ${currentUrl.slice(0, 50)}...`;
            this.notify(job, 'AUDIT_PROGRESS');
          },
          isCancelled: () => this.isCancelledFlag || this.currentRunId !== runId,
        });

        // Check cancellation
        if (this.isCancelledFlag || this.currentRunId !== runId) {
          job.status = 'cancelled';
          job.currentStage = 'Audit cancelled by user';
          job.updatedAt = Date.now();
          this.notify(job, 'AUDIT_CANCELLED');
          await StandaloneAuditStorage.saveJob(job);
          this.isRunningFlag = false;
          return job;
        }

        job.stageCheckpoints.crawlingFinished = true;
        job.robotsPolicyStatus = crawler.getRobotsPolicyStatus();
        job.robotsEvidence = normalizeRobotsEvidence(crawler.getRobotsEvidence());
        job.sitemapEvidence = normalizeSitemapEvidence(crawler.getSitemapEvidence());
        await StandaloneAuditStorage.saveJob(job);
      }

      // Evidence Availability Gate: verify whether usable HTML pages were retrieved
      const usablePages = crawledPages.filter(
        (p) =>
          p.fetchStatus === 'success' &&
          p.httpStatus >= 200 &&
          p.httpStatus < 400 &&
          (p.contentTypeCategory === 'HTML_DOCUMENT' ||
            (!p.contentTypeCategory && (p.headers?.['content-type']?.includes('text/html') ?? true)))
      );
      const failedPages = crawledPages.filter(
        (p) => p.fetchStatus !== 'success' || p.httpStatus === 0 || p.httpStatus >= 400
      );

      // If zero usable HTML pages were retrieved, the audit cannot produce trusted results
      if (usablePages.length === 0) {
        job.status = 'failed';
        job.errorMessage =
          failedPages[0]?.errorMessage ||
          'Crawl failed: Seed URL could not be fetched (insufficient evidence)';
        job.currentStage = `Audit failed: ${job.errorMessage}`;
        job.progressPercent = 100;
        job.completedAt = Date.now();
        job.scorecard = StandaloneScoringCalculator.calculate([], crawledPages);
        this.notify(job, 'AUDIT_FAILED');
        await StandaloneAuditStorage.saveJob(job);
        this.isRunningFlag = false;
        return job;
      }

      // Stage 2: SEO Rule Evaluations (if not already finished)
      if (!job.stageCheckpoints.seoFinished) {
        if (this.currentRunId !== runId || this.isCancelledFlag) return job;

        job.status = 'analyzing';
        job.currentStage = 'Evaluating Core SEO Rules & Site Graph';
        job.progressPercent = 85;
        job.updatedAt = Date.now();
        job.stageCheckpoints.seoStarted = true;
        this.notify(job, 'AUDIT_PROGRESS');

        const { findings: allFindings, ledgerRecords: allLedger, linkGraph: graphSummary } =
          StandaloneRulesEngine.evaluateAudit(crawledPages, auditId, {
            robotsEvidence: normalizeRobotsEvidence(job.robotsEvidence),
            sitemapEvidence: normalizeSitemapEvidence(job.sitemapEvidence),
          });

        if (graphSummary) {
          job.linkGraph = graphSummary;
        }
        job.stageCheckpoints.seoFinished = true;
        await StandaloneAuditStorage.publishSeoStageResults(auditId, allFindings, allLedger, job);
      }

      // Stage 3: Technology Stack Detection (if not already finished)
      if (!job.stageCheckpoints.techFinished) {
        if (this.currentRunId !== runId || this.isCancelledFlag) return job;

        job.currentStage = 'Fingerprinting website technology stack from persisted evidence';
        job.progressPercent = 90;
        job.updatedAt = Date.now();
        job.stageCheckpoints.techStarted = true;
        this.notify(job, 'AUDIT_PROGRESS');

        const allTechsMap = new Map<string, StandaloneTechFinding>();
        for (const p of usablePages) {
          if (p.evidence) {
            const detected = StandaloneTechDetector.detect(p.evidence, p.headers, auditId);
            for (const t of detected) {
              if (!allTechsMap.has(t.technologyId)) {
                allTechsMap.set(t.technologyId, t);
              }
            }
          }
        }

        const allTechs = Array.from(allTechsMap.values());
        await StandaloneAuditStorage.saveTechnologies(allTechs);
        job.stageCheckpoints.techFinished = true;
        await StandaloneAuditStorage.saveJob(job);
      }

      // Stage 4: Scoring (if not already finished)
      if (!job.stageCheckpoints.scoringFinished) {
        if (this.currentRunId !== runId || this.isCancelledFlag) return job;

        job.status = 'scoring';
        job.currentStage = 'Calculating SEO Health Scorecard';
        job.progressPercent = 95;
        job.updatedAt = Date.now();
        job.stageCheckpoints.scoringStarted = true;
        this.notify(job, 'AUDIT_PROGRESS');

        const findings = await StandaloneAuditStorage.getFindingsForAudit(auditId);
        const ledger = await StandaloneAuditStorage.getExecutionLedgerForAudit(auditId);
        const scorecard = StandaloneScoringCalculator.calculate(findings, crawledPages, ledger);
        job.scorecard = scorecard;
        job.stageCheckpoints.scoringFinished = true;
        await StandaloneAuditStorage.saveJob(job);
      }

      // Stage 5: Final Result Publishing & Completion
      if (this.currentRunId !== runId || this.isCancelledFlag) return job;

      if (failedPages.length > 0) {
        job.status = 'completed_with_limitations';
        job.currentStage = `Audit completed with limitations (${usablePages.length} succeeded, ${failedPages.length} failed)`;
      } else {
        job.status = 'completed';
        job.currentStage = `Full in-browser audit completed (${usablePages.length} pages audited)`;
      }

      job.progressPercent = 100;
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
      job.pendingQueue = [];

      this.notify(job, 'AUDIT_COMPLETED');
      await StandaloneAuditStorage.saveJob(job);
      this.isRunningFlag = false;
      return job;
    } catch (err: any) {
      job.status = 'error';
      job.errorMessage = err.message || 'Unknown error occurred during standalone audit.';
      job.currentStage = 'Audit encountered an error';
      job.updatedAt = Date.now();
      this.notify(job, 'AUDIT_FAILED');
      await StandaloneAuditStorage.saveJob(job);
      this.isRunningFlag = false;
      return job;
    }
  }
}

export const standaloneCoordinator = new StandaloneAuditCoordinator();
