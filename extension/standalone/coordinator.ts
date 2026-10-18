/**
 * Standalone Audit Coordinator.
 * Orchestrates the full in-browser audit pipeline without any backend server.
 * Supports durable checkpoints, service worker lifecycle resumption, and real evidence retention.
 */

import type {
  StandaloneAuditConfig,
  StandaloneAuditJob,
  StandaloneCrawlPage,
  StandaloneSeoFinding,
  StandaloneTechFinding,
} from './types';
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

  private notify(job: StandaloneAuditJob): void {
    this.currentJob = job;

    // Broadcast progress over chrome.runtime if available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'STANDALONE_AUDIT_PROGRESS',
        payload: { job },
      }).catch(() => {
        // Expected when no extension views or listeners are actively open
      });
    }

    for (const listener of this.progressListeners) {
      try {
        listener(job);
      } catch (e) {
        console.error('Error in progress listener:', e);
      }
    }
  }

  public cancelAudit(): void {
    this.isCancelledFlag = true;
    if (this.currentJob) {
      this.currentJob.status = 'cancelled';
      this.currentJob.currentStage = 'Audit cancelled by user';
      this.currentJob.updatedAt = Date.now();
      this.notify(this.currentJob);
      StandaloneAuditStorage.saveJob(this.currentJob).catch(() => {});
    }
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

      // If chrome.permissions API is available (MV3 extension context)
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

      // Fallback for non-extension or dev test runner
      return true;
    } catch {
      return false;
    }
  }

  public async startAudit(targetUrl: string, userConfig?: Partial<StandaloneAuditConfig>): Promise<StandaloneAuditJob> {
    this.isCancelledFlag = false;
    this.isRunningFlag = true;

    const parsed = new URL(targetUrl);
    const config: StandaloneAuditConfig = {
      maxPages: userConfig?.maxPages || 10,
      maxDepth: userConfig?.maxDepth || 2,
      concurrency: userConfig?.concurrency || 2,
      delayMs: userConfig?.delayMs ?? 100,
      respectRobots: userConfig?.respectRobots ?? true,
    };

    const auditId = `standalone-${Date.now()}`;
    const job: StandaloneAuditJob = {
      id: auditId,
      targetUrl,
      origin: parsed.origin,
      hostname: parsed.hostname,
      status: 'discovering',
      progressPercent: 5,
      currentStage: 'Discovering in-scope seed URL',
      config,
      discoveredUrls: [targetUrl],
      pendingQueue: [{ url: targetUrl, depth: 0 }],
      crawledUrls: [],
      failedUrls: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.notify(job);
    await StandaloneAuditStorage.saveJob(job);

    return this.executePipeline(job, []);
  }

  public async checkAndResumeInterruptedJob(): Promise<StandaloneAuditJob | null> {
    if (this.isRunningFlag && this.currentJob) {
      return this.currentJob;
    }

    const latest = await StandaloneAuditStorage.getLatestJob();
    if (!latest) return null;

    if (latest.status === 'crawling' && latest.pendingQueue && latest.pendingQueue.length > 0) {
      console.log(`[StandaloneCoordinator] Resuming interrupted audit ${latest.id} with ${latest.pendingQueue.length} pending URLs.`);
      const crawledPages = await StandaloneAuditStorage.getPagesForAudit(latest.id);
      this.isCancelledFlag = false;
      this.isRunningFlag = true;
      return this.executePipeline(latest, crawledPages);
    }

    return latest;
  }

  private async executePipeline(job: StandaloneAuditJob, existingPages: StandaloneCrawlPage[]): Promise<StandaloneAuditJob> {
    const auditId = job.id;
    const config = job.config;

    try {
      // Stage 1: In-Browser Crawl
      job.status = 'crawling';
      job.currentStage = 'Fetching and parsing in-scope pages';
      this.notify(job);

      const crawler = new InBrowserCrawler(
        job.targetUrl,
        config,
        job.pendingQueue.length > 0 ? job.pendingQueue : undefined,
        job.discoveredUrls
      );
      const crawledPages: StandaloneCrawlPage[] = [...existingPages];

      await crawler.run({
        onPageCrawled: async (page) => {
          page.auditId = auditId;
          crawledPages.push(page);
          job.crawledUrls.push(page.url);
          job.pendingQueue = crawler.getPendingQueue();
          job.discoveredUrls = crawler.getDiscoveredUrls();
          job.progressPercent = Math.min(80, Math.round((crawledPages.length / config.maxPages) * 75) + 5);
          job.currentStage = `Crawled ${crawledPages.length} of ${config.maxPages} pages`;
          job.updatedAt = Date.now();
          this.notify(job);

          await StandaloneAuditStorage.savePage(page);
          await StandaloneAuditStorage.saveJob(job);
        },
        onProgress: (crawled, total, currentUrl) => {
          job.currentStage = `Fetching: ${currentUrl.slice(0, 50)}...`;
          this.notify(job);
        },
        isCancelled: () => this.isCancelledFlag,
      });

      if (this.isCancelledFlag) {
        job.status = 'cancelled';
        job.currentStage = 'Audit cancelled by user';
        job.updatedAt = Date.now();
        this.notify(job);
        await StandaloneAuditStorage.saveJob(job);
        this.isRunningFlag = false;
        return job;
      }

      // Stage 2: SEO Rule Evaluations
      job.status = 'analyzing';
      job.currentStage = 'Evaluating Core SEO Rules & Site Graph';
      job.progressPercent = 85;
      job.updatedAt = Date.now();
      this.notify(job);

      const allFindings: StandaloneSeoFinding[] = [];
      for (const p of crawledPages) {
        const pageFindings = StandaloneRulesEngine.evaluatePage(p, auditId);
        allFindings.push(...pageFindings);
      }
      const sitewideFindings = StandaloneRulesEngine.evaluateSitewide(crawledPages, auditId);
      allFindings.push(...sitewideFindings);

      await StandaloneAuditStorage.saveFindings(allFindings);

      // Stage 3: Technology Stack Detection
      job.currentStage = 'Fingerprinting website technology stack from persisted evidence';
      job.progressPercent = 90;
      job.updatedAt = Date.now();
      this.notify(job);

      const allTechsMap = new Map<string, StandaloneTechFinding>();
      for (const p of crawledPages) {
        // Consume original persisted evidence directly (zero dummy HTML reconstruction)
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

      // Stage 4: Scoring
      job.status = 'scoring';
      job.currentStage = 'Calculating SEO Health Scorecard';
      job.progressPercent = 95;
      job.updatedAt = Date.now();
      this.notify(job);

      const scorecard = StandaloneScoringCalculator.calculate(allFindings, crawledPages.length);
      job.scorecard = scorecard;

      // Stage 5: Completion
      job.status = 'completed';
      job.currentStage = 'Full in-browser audit completed';
      job.progressPercent = 100;
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
      job.pendingQueue = [];

      this.notify(job);
      await StandaloneAuditStorage.saveJob(job);
      this.isRunningFlag = false;
      return job;
    } catch (err: any) {
      job.status = 'error';
      job.errorMessage = err.message || 'Unknown error occurred during standalone audit.';
      job.currentStage = 'Audit encountered an error';
      job.updatedAt = Date.now();
      this.notify(job);
      await StandaloneAuditStorage.saveJob(job);
      this.isRunningFlag = false;
      return job;
    }
  }
}

export const standaloneCoordinator = new StandaloneAuditCoordinator();
