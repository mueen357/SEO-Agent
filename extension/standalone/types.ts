/**
 * Types for the Standalone In-Browser Audit Engine.
 * 100% Client-Side Manifest V3 Architecture (No Backend Server).
 */

export type StandaloneAuditStatus =
  | 'idle'
  | 'requesting_permission'
  | 'discovering'
  | 'crawling'
  | 'analyzing'
  | 'scoring'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'error';

export interface StandaloneAuditConfig {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  delayMs: number;
  respectRobots: boolean;
}

export interface StandaloneCrawlPage {
  id: string;
  auditId: string;
  url: string;
  depth: number;
  httpStatus: number;
  fetchStatus: 'success' | 'failed' | 'skipped' | 'timeout';
  title?: string;
  metaDescription?: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  canonicalUrl?: string;
  metaRobots?: string;
  links: string[];
  images: Array<{ src: string; alt: string }>;
  headers: Record<string, string>;
  htmlSize: number;
  responseTimeMs: number;
  fetchedAt: number;
  evidence?: import('./audit/domParserEngine').ParsedHtmlEvidence;
}

export interface StandaloneSeoFinding {
  id: string;
  auditId: string;
  ruleId: string;
  category: 'on_page' | 'technical' | 'sitewide';
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'pass' | 'warning' | 'fail';
  title: string;
  description: string;
  recommendation: string;
  pageUrl: string;
  evidence: Record<string, any>;
}

export interface StandaloneTechFinding {
  id: string;
  auditId: string;
  technologyId: string;
  name: string;
  category: string;
  confidence: number;
  status: 'detected' | 'possible' | 'inferred';
  provenance: 'first_party' | 'third_party_embed' | 'asset_host' | 'inferred_dependency';
  evidenceSummary: string;
  versionOrNull?: string | null;
}

export interface StandaloneAuditScorecard {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  available: boolean;
  onPageScore: number;
  technicalScore: number;
  sitewideScore: number;
  pagesCrawled: number;
  totalIssuesCount: number;
  criticalIssuesCount: number;
  highIssuesCount: number;
  mediumIssuesCount: number;
  lowIssuesCount: number;
  calculatedAt: number;
}

export interface StandaloneAuditJob {
  id: string;
  targetUrl: string;
  origin: string;
  hostname: string;
  status: StandaloneAuditStatus;
  progressPercent: number;
  currentStage: string;
  config: StandaloneAuditConfig;
  discoveredUrls: string[];
  pendingQueue: Array<{ url: string; depth: number }>;
  crawledUrls: string[];
  failedUrls: string[];
  scorecard?: StandaloneAuditScorecard;
  errorMessage?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}
