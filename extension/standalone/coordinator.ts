/**
 * Standalone Audit Coordinator.
 * Orchestrates the full in-browser audit pipeline without any backend server.
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
import { StandaloneDomParser } from './audit/domParserEngine';
import { StandaloneScoringCalculator } from './audit/scoring';

export type ProgressListener = (job: StandaloneAuditJob) => void;

export class StandaloneAuditCoordinator {
  private currentJob: StandaloneAuditJob | null = null;
  private isCancelledFlag = false;
  private progressListeners: ProgressListener[] = [];

  public onProgress(listener: ProgressListener): () => void {
    this.progressListeners.push(listener);
    return () => {
      this.progressListeners = this.progressListeners.filter((l) => l !== listener);
    };
  }

  private notify(job: StandaloneAuditJob) {
    this.currentJob = job;
    for (const listener of this.progressListeners) {
      try {
        listener(job);
      } catch (e) {
        console.error('Error in progress listener:', e);
      }
    }
  }

  public cancelAudit() {
    this.isCancelledFlag = true;
    if (this.currentJob) {
      this.currentJob.status = 'cancelled';
      this.currentJob.currentStage = 'Audit cancelled by user';
      this.notify(this.currentJob);
      StandaloneAuditStorage.saveJob(this.currentJob).catch(() => {});
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

    const parsed = new URL(targetUrl);
    const config: StandaloneAuditConfig = {
      maxPages: userConfig?.maxPages || 10,
      maxDepth: userConfig?.maxDepth || 2,
      concurrency: userConfig?.concurrency || 2,
      delayMs: userConfig?.delayMs || 100,
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

    try {
      // Stage 1: In-Browser Crawl
      job.status = 'crawling';
      job.currentStage = 'Fetching and parsing in-scope pages';
      this.notify(job);

      const crawler = new InBrowserCrawler(targetUrl, config);
      const crawledPages: StandaloneCrawlPage[] = [];

      await crawler.run({
        onPageCrawled: async (page) => {
          page.auditId = auditId;
          crawledPages.push(page);
          job.crawledUrls.push(page.url);
          job.progressPercent = Math.min(80, Math.round((crawledPages.length / config.maxPages) * 75) + 5);
          job.currentStage = `Crawled ${crawledPages.length} of ${config.maxPages} pages`;
          this.notify(job);
          await StandaloneAuditStorage.savePage(page);
        },
        onProgress: (crawled, total, currentUrl) => {
          job.currentStage = `Fetching: ${currentUrl.slice(0, 50)}...`;
          this.notify(job);
        },
        isCancelled: () => this.isCancelledFlag,
      });

      if (this.isCancelledFlag) {
        job.status = 'cancelled';
        job.currentStage = 'Audit cancelled';
        this.notify(job);
        await StandaloneAuditStorage.saveJob(job);
        return job;
      }

      // Stage 2: SEO Rule Evaluations
      job.status = 'analyzing';
      job.currentStage = 'Evaluating Core SEO Rules & Site Graph';
      job.progressPercent = 85;
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
      job.currentStage = 'Fingerprinting website technology stack';
      job.progressPercent = 90;
      this.notify(job);

      const allTechsMap = new Map<string, StandaloneTechFinding>();
      for (const p of crawledPages) {
        // Re-parse HTML vectors from page headers & markers
        const evidence = StandaloneDomParser.parse(
          `<html><head><title>${p.title || ''}</title></head><body></body></html>`,
          p.url
        );
        // Supplement with recorded page evidence
        const detected = StandaloneTechDetector.detect(evidence, p.headers, auditId);
        for (const t of detected) {
          if (!allTechsMap.has(t.technologyId)) {
            allTechsMap.set(t.technologyId, t);
          }
        }
      }

      const allTechs = Array.from(allTechsMap.values());
      await StandaloneAuditStorage.saveTechnologies(allTechs);

      // Stage 4: Scoring
      job.status = 'scoring';
      job.currentStage = 'Calculating SEO Health Scorecard';
      job.progressPercent = 95;
      this.notify(job);

      const scorecard = StandaloneScoringCalculator.calculate(allFindings, crawledPages.length);
      job.scorecard = scorecard;

      // Stage 5: Completion
      job.status = 'completed';
      job.currentStage = 'Full in-browser audit completed';
      job.progressPercent = 100;
      job.completedAt = Date.now();
      job.updatedAt = Date.now();

      this.notify(job);
      await StandaloneAuditStorage.saveJob(job);
      return job;
    } catch (err: any) {
      job.status = 'error';
      job.errorMessage = err.message || 'Unknown error occurred during standalone audit.';
      job.currentStage = 'Audit encountered an error';
      this.notify(job);
      await StandaloneAuditStorage.saveJob(job);
      return job;
    }
  }
}

export const standaloneCoordinator = new StandaloneAuditCoordinator();
