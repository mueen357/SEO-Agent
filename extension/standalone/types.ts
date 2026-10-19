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

export interface RedirectHop {
  url?: string;
  status?: number;
  location?: string;
  fromUrl?: string;
  toUrl?: string;
  httpStatus?: number;
  locationHeader?: string;
  isBlocked?: boolean;
  safetyBlocked?: boolean;
  blockReason?: string;
}

export interface ObservedUrlStatus {
  url: string;
  normalizedUrl: string;
  isObserved: boolean;
  isRedirect: boolean;
  redirectStatus?: number;
  finalDestinationUrl?: string;
  finalHttpStatus?: number;
  httpStatus?: number;
  isBlocked?: boolean;
  safetyBlocked?: boolean;
  blockReason?: string;
  fetchStatus?: StandaloneCrawlPage['fetchStatus'];
  page?: StandaloneCrawlPage;
  evidenceSource: 'requested_url_redirect' | 'intermediate_hop' | 'final_destination' | 'direct_page' | 'direct_redirect' | 'uncrawled';
}

export interface StandaloneLinkEdge {
  sourceUrl: string;
  destinationUrl: string;
  targetUrl?: string;
  linkText?: string;
  sourcePageId?: string;
}

export interface StandalonePageNodeMetrics {
  url: string;
  pageId: string;
  depth: number;
  httpStatus?: number;
  inboundUniquePages: number;
  outboundUniquePages: number;
  totalInboundLinks: number;
  isSitemapOnly: boolean;
  isSeed: boolean;
  brokenOutlinksCount: number;
  redirectOutlinksCount: number;
}

export interface StandaloneLinkGraphSummary {
  auditId: string;
  totalNodes: number;
  totalInternalEdges: number;
  uniqueDestinations: number;
  orphanCount: number;
  lowInlinkCount: number;
  brokenLinkDestinations: number;
  redirectDestinations: number;
  maxCrawlDepth: number;
  sitemapOnlyCount: number;
  crawlCompletenessCaveat: string;
  nodes: StandalonePageNodeMetrics[];
  totalInternalPages?: number;
  totalInternalLinks?: number;
  orphanPages?: string[];
  lowInlinkPages?: string[];
  deepCrawlPages?: string[];
  redirectLinks?: StandaloneLinkEdge[];
}

export type StandaloneFetchErrorCode =
  | 'FETCH_NETWORK_ERROR'
  | 'FETCH_TIMEOUT'
  | 'FETCH_PERMISSION_DENIED'
  | 'FETCH_REDIRECT_BLOCKED'
  | 'FETCH_REDIRECT_LOOP'
  | 'FETCH_BODY_TOO_LARGE'
  | 'FETCH_PARSE_FAILED'
  | 'FETCH_ROBOTS_BLOCKED';

export interface StandaloneAuditConfig {
  maxPages: number;
  maxDepth?: number;
  concurrency?: number;
  delayMs?: number;
  crawlDelayMs?: number;
  respectRobots?: boolean;
  respectRobotsTxt?: boolean;
  discoverSitemaps?: boolean;
  userAgent?: string;
}

export type StandaloneContentCategory =
  | 'HTML_DOCUMENT'
  | 'NON_HTML_RESOURCE'
  | 'HTTP_ERROR'
  | 'NETWORK_FAILURE'
  | 'PARSE_FAILURE'
  | 'UNKNOWN_CONTENT_TYPE';

export interface StandaloneCrawlPage {
  id: string;
  auditId: string;
  url: string;
  requestedUrl?: string;
  finalUrl?: string;
  redirectChain?: RedirectHop[];
  redirectCount?: number;
  redirectLoopDetected?: boolean;
  depth: number;
  httpStatus: number;
  fetchStatus:
    | 'success'
    | 'failed'
    | 'skipped'
    | 'timeout'
    | 'robots_blocked'
    | 'redirect_loop'
    | 'policy_blocked'
    | 'http_error';
  errorCode?: StandaloneFetchErrorCode;
  errorMessage?: string;
  contentTypeCategory?: StandaloneContentCategory;
  isInSitemap?: boolean;
  title?: string;
  metaDescription?: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
    h4?: string[];
    h5?: string[];
    h6?: string[];
  };
  headingCounts?: Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', number>;
  h1RawCount?: number;
  h1HasContent?: boolean;
  canonicalUrl?: string;
  canonicalHrefs?: string[];
  canonicalCount?: number;
  metaRobots?: string;
  htmlLang?: string | null;
  links: string[];
  internalOutlinksCount?: number;
  externalOutlinksCount?: number;
  emptyAnchorCount?: number;
  images: Array<{ src: string; alt: string; hasAlt?: boolean }>;
  imageCount?: number;
  missingAltCount?: number;
  emptyAltCount?: number;
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
  evidence?: Record<string, any>;
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

export interface StandaloneCanonicalRobotsEvidence {
  robotsUrl: string;
  url: string;
  httpStatus: number;
  fetchStatus: 'found' | 'not_found' | 'forbidden' | 'error' | 'not_evaluated' | string;
  status: 'found' | 'not_found' | 'forbidden' | 'error' | 'not_evaluated' | string;
  parserStatus?: 'valid' | 'empty' | 'not_present' | string;
  rawContent?: string;
  selectedUserAgent: string;
  selectedUserAgentGroup?: string;
  allowDirectives: string[];
  disallowDirectives: string[];
  sitemapDeclarations: string[];
  sitemapsDeclared: string[];
  hasDirectives: boolean;
  policyOutcome: 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified' | 'forbidden' | string;
}

export type StandaloneRobotsEvidence = Partial<StandaloneCanonicalRobotsEvidence>;

export function normalizeRobotsEvidence(
  raw?: StandaloneRobotsEvidence | Record<string, any>
): StandaloneCanonicalRobotsEvidence | undefined {
  if (!raw) return undefined;
  const robotsUrl = raw.robotsUrl || raw.url || '';
  const fetchStatus = raw.fetchStatus || raw.status || 'not_evaluated';
  const sitemapDeclarations = Array.isArray(raw.sitemapDeclarations)
    ? [...raw.sitemapDeclarations]
    : Array.isArray(raw.sitemapsDeclared)
    ? [...raw.sitemapsDeclared]
    : [];

  return {
    robotsUrl,
    url: robotsUrl,
    httpStatus: typeof raw.httpStatus === 'number' ? raw.httpStatus : 0,
    fetchStatus,
    status: fetchStatus,
    parserStatus: raw.parserStatus || (raw.rawContent ? 'valid' : 'not_present'),
    rawContent: raw.rawContent,
    selectedUserAgent: raw.selectedUserAgent || '*',
    selectedUserAgentGroup: raw.selectedUserAgentGroup,
    allowDirectives: Array.isArray(raw.allowDirectives) ? [...raw.allowDirectives] : [],
    disallowDirectives: Array.isArray(raw.disallowDirectives) ? [...raw.disallowDirectives] : [],
    sitemapDeclarations,
    sitemapsDeclared: sitemapDeclarations,
    hasDirectives: typeof raw.hasDirectives === 'boolean'
      ? raw.hasDirectives
      : Boolean((raw.allowDirectives?.length || 0) + (raw.disallowDirectives?.length || 0) > 0),
    policyOutcome:
      raw.policyOutcome ||
      (fetchStatus === 'found'
        ? 'enforced'
        : fetchStatus === 'not_found'
        ? 'not_present_permissive'
        : 'fetch_failed_unverified'),
  };
}

export interface StandaloneCanonicalSitemapEntry {
  sitemapUrl: string;
  url: string;
  status: 'valid' | 'fetch_error' | 'parse_error' | 'unauthorized' | 'out_of_scope' | string;
  fetchStatus: 'fetched' | 'fetch_error' | 'not_fetched' | 'out_of_scope' | string;
  parseStatus: 'parsed' | 'parse_error' | 'not_parsed' | string;
  httpStatus?: number;
  errorMessage?: string;
  error?: string;
  urlsCount: number;
  urlCount: number;
  urls: string[];
  isIndex: boolean;
  childSitemaps: string[];
  lastModified?: string;
  isDeclared?: boolean;
}

export type StandaloneSitemapEntry = Partial<StandaloneCanonicalSitemapEntry>;

export function normalizeSitemapEntry(raw: StandaloneSitemapEntry | Record<string, any>): StandaloneCanonicalSitemapEntry {
  const sitemapUrl = raw.sitemapUrl || raw.url || '';
  const errorMessage = raw.errorMessage || raw.error || undefined;
  const urls = Array.isArray(raw.urls) ? [...raw.urls] : [];
  const urlsCount = typeof raw.urlsCount === 'number'
    ? raw.urlsCount
    : typeof raw.urlCount === 'number'
    ? raw.urlCount
    : urls.length;
  const status = raw.status || (errorMessage ? 'fetch_error' : 'valid');
  const fetchStatus = raw.fetchStatus || (status === 'valid' ? 'fetched' : status === 'out_of_scope' ? 'out_of_scope' : 'fetch_error');
  const parseStatus = raw.parseStatus || (status === 'valid' ? 'parsed' : status === 'parse_error' ? 'parse_error' : 'not_parsed');

  return {
    sitemapUrl,
    url: sitemapUrl,
    status,
    fetchStatus,
    parseStatus,
    httpStatus: typeof raw.httpStatus === 'number' ? raw.httpStatus : undefined,
    errorMessage,
    error: errorMessage,
    urlsCount,
    urlCount: urlsCount,
    urls,
    isIndex: Boolean(raw.isIndex),
    childSitemaps: Array.isArray(raw.childSitemaps) ? [...raw.childSitemaps] : [],
    lastModified: raw.lastModified,
    isDeclared: typeof raw.isDeclared === 'boolean' ? raw.isDeclared : undefined,
  };
}

export interface StandaloneCanonicalSitemapEvidence {
  sitemaps: StandaloneCanonicalSitemapEntry[];
  sitemapsDiscovered: StandaloneCanonicalSitemapEntry[];
  urls: string[];
  allSitemapUrls: string[];
  totalDiscoveredUrlsCount: number;
  indexCount: number;
  hasErrors: boolean;
  errors: string[];
}

export interface StandaloneSitemapEvidence {
  sitemaps?: StandaloneSitemapEntry[];
  sitemapsDiscovered?: StandaloneSitemapEntry[];
  urls?: string[];
  allSitemapUrls?: string[];
  totalDiscoveredUrlsCount?: number;
  indexCount?: number;
  hasErrors?: boolean;
  errors?: string[];
}

export function normalizeSitemapEvidence(
  raw?: StandaloneSitemapEvidence | Record<string, any>
): StandaloneCanonicalSitemapEvidence | undefined {
  if (!raw) return undefined;
  const rawList = Array.isArray(raw.sitemaps)
    ? raw.sitemaps
    : Array.isArray(raw.sitemapsDiscovered)
    ? raw.sitemapsDiscovered
    : [];
  const sitemaps = rawList.map(normalizeSitemapEntry);
  const urls = Array.isArray(raw.urls)
    ? [...raw.urls]
    : Array.isArray(raw.allSitemapUrls)
    ? [...raw.allSitemapUrls]
    : [];
  const errors = Array.isArray(raw.errors) ? [...raw.errors] : [];
  const indexCount = typeof raw.indexCount === 'number' ? raw.indexCount : sitemaps.filter((s) => s.isIndex).length;

  return {
    sitemaps,
    sitemapsDiscovered: sitemaps,
    urls,
    allSitemapUrls: urls,
    totalDiscoveredUrlsCount: typeof raw.totalDiscoveredUrlsCount === 'number' ? raw.totalDiscoveredUrlsCount : urls.length,
    indexCount,
    hasErrors: Boolean(raw.hasErrors || errors.length > 0 || sitemaps.some((s) => s.status !== 'valid')),
    errors,
  };
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
  robotsPolicyStatus?: 'enforced' | 'not_present_permissive' | 'fetch_failed_unverified' | 'forbidden' | 'server_error_disallow';
  robotsEvidence?: StandaloneRobotsEvidence;
  sitemapEvidence?: StandaloneSitemapEvidence;
  config: StandaloneAuditConfig;
  discoveredUrls: string[];
  pendingQueue: Array<{ url: string; depth: number }>;
  crawledUrls: string[];
  failedUrls: string[];
  linkGraph?: StandaloneLinkGraphSummary;
  scorecard?: StandaloneAuditScorecard;
  errorMessage?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

