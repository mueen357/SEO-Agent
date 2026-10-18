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
  | 'completed_with_limitations'
  | 'partial'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'error';

export type StandaloneFetchErrorCode =
  | 'FETCH_NETWORK_ERROR'
  | 'FETCH_TIMEOUT'
  | 'FETCH_PERMISSION_DENIED'
  | 'FETCH_REDIRECT_BLOCKED'
  | 'FETCH_BODY_TOO_LARGE'
  | 'FETCH_PARSE_FAILED';

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
  errorCode?: StandaloneFetchErrorCode;
  errorMessage?: string;
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

export type StandaloneFindingStatus =
  | 'pass'
  | 'warning'
  | 'fail'
  | 'not_applicable'
  | 'unknown'
  | 'not_evaluated';

export type StandaloneFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface StandaloneSeoFinding {
  id: string;
  auditId: string;
  ruleId: string;
  category: 'on_page' | 'technical' | 'sitewide';
  severity: StandaloneFindingSeverity;
  status: StandaloneFindingStatus;
  title: string;
  description: string;
  recommendation: string;
  pageUrl: string;
  evidence: Record<string, any>;
}

export interface StandaloneFindingsSummary {
  totalRecords: number;          // Total raw finding records stored
  distinctRulesEvaluated: number;// Unique ruleIds evaluated
  pagesEvaluated: number;        // Unique page URLs with findings
  issueCount: number;            // Only failed + warning findings (actual issues!)
  failedCount: number;           // Actual failures ('fail')
  warningCount: number;          // Actual warnings ('warning')
  passedCount: number;           // Checks passed ('pass')
  notApplicableCount: number;    // Checks marked N/A ('not_applicable')
  unknownCount: number;          // Checks with uncertain/unknown evidence ('unknown')
  notEvaluatedCount: number;     // Checks not evaluated ('not_evaluated')
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export type StandaloneRuleExecutionStatus =
  | 'executed_pass'
  | 'executed_fail'
  | 'executed_warning'
  | 'not_applicable'
  | 'not_evaluated'
  | 'unknown'
  | 'error';

export interface StandaloneRuleExecutionRecord {
  id: string;
  auditId: string;
  canonicalRuleId: string;
  ruleVersion: string;
  scope: 'page' | 'site';
  targetUrl: string;
  executionStatus: StandaloneRuleExecutionStatus;
  result: 'pass' | 'fail' | 'warning' | 'na' | 'unknown' | 'error';
  evidenceAvailable: boolean;
  reason?: string;
  executedAt: number;
  engineVersion: string;
}

export interface StandaloneExecutionLedger {
  auditId: string;
  records: StandaloneRuleExecutionRecord[];
  summary: {
    totalEvaluations: number;
    distinctCanonicalRulesExecuted: number;
    executedPassCount: number;
    executedFailCount: number;
    executedWarningCount: number;
    notApplicableCount: number;
    notEvaluatedCount: number;
    unknownCount: number;
    errorCount: number;
  };
}

export type StandaloneScoreState = 'fully_evaluated' | 'substantial_coverage' | 'provisional' | 'unavailable';

export interface StandaloneScoreCoverage {
  scoreState: StandaloneScoreState;
  scoreStateLabel: string;
  coverageRatio: number;          // e.g. 14/51 = 0.275
  expectedRulesTotal: number;     // Canonical 51
  implementedRulesCount: number;  // Number of standalone-implemented canonical rules
  executedRulesTotal: number;     // Distinct canonical rules actually evaluated in audit
  distinctExecutedCanonicalRules?: string[];
  applicableRulesCount: number;   // Rules applicable to this audit target
  missingRulesTotal: number;      // 51 - executedRulesTotal
  passedRulesCount: number;
  failedRulesCount: number;
  warningRulesCount: number;
  notApplicableRulesCount: number;
  notEvaluatedRulesCount: number;
  unavailableEvidenceCount: number;
  passedChecksCount: number;      // Total check evaluations that passed
  failedChecksCount: number;      // Total check evaluations that failed
  warningChecksCount: number;     // Total check evaluations with warnings
  unknownCount: number;
  familyCoverage: {
    on_page: { executed: number; total: number; ratio: number };
    technical: { executed: number; total: number; ratio: number };
    sitewide: { executed: number; total: number; ratio: number };
  };
  executionLedgerSummary?: StandaloneExecutionLedger['summary'];
  policyVersion: string;
}

export interface StandaloneTechFinding {
  id: string;
  auditId: string;
  technologyId: string;
  name: string;
  category: string;
  confidence: number;
  status: 'confirmed' | 'detected' | 'possible' | 'inferred';
  provenance: 'first_party' | 'third_party_embed' | 'asset_host' | 'inferred_dependency';
  evidenceSummary: string;
  version?: string;
  versionOrNull?: string | null;
}

export interface StandaloneAuditScorecard {
  overallScore: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';
  available: boolean;
  reason?: string;
  onPageScore: number | null;
  technicalScore: number | null;
  sitewideScore: number | null;
  pagesCrawled: number;
  usablePagesCount: number;
  attemptedPagesCount: number;
  failedPagesCount: number;
  totalIssuesCount: number;
  criticalIssuesCount: number;
  highIssuesCount: number;
  mediumIssuesCount: number;
  lowIssuesCount: number;
  coverage: StandaloneScoreCoverage;
  scoringVersion?: string;
  calculatedAt: number;
}

export interface StandaloneStageCheckpoints {
  crawlingStarted: boolean;
  crawlingFinished: boolean;
  seoStarted: boolean;
  seoFinished: boolean;
  techStarted: boolean;
  techFinished: boolean;
  scoringStarted: boolean;
  scoringFinished: boolean;
}

export interface StandaloneAuditJob {
  id: string;
  targetUrl: string;
  origin: string;
  hostname: string;
  status: StandaloneAuditStatus;
  progressPercent: number;
  currentStage: string;
  sequence?: number;
  stageCheckpoints?: StandaloneStageCheckpoints;
  authoritativeRunId?: string;
  robotsPolicyStatus?: 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified';
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

