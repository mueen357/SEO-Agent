/**
 * Website Audit Agent - Audit Data Models & Types
 */

export interface ActiveTabInfo {
  id?: number;
  url?: string;
  origin?: string;
  hostname?: string;
  title?: string;
  favIconUrl?: string;
  isAuditable: boolean;
  unsupportedReason?: string;
}

export interface HeadingItem {
  level: number; // 1 to 6
  text: string;
  index: number; // Sequential DOM order index
}

export interface HeadingsAnalysis {
  items: HeadingItem[];
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
  totalCount: number;
}

export interface ImageIssueItem {
  src: string;
  hasAlt: boolean;
  altText: string | null;
  issueType: 'missing_alt' | 'empty_alt';
}

export interface ImagesAnalysis {
  totalCount: number;
  missingAltCount: number; // Completely missing alt attribute
  emptyAltCount: number;   // Has alt="" attribute (decorative or empty)
  withAltCount: number;    // Has non-empty alt text
  issues: ImageIssueItem[];
}

export interface LinkItem {
  href: string;
  text: string;
  isInternal: boolean;
  protocol: string;
  isHttp: boolean;
}

export interface LinksAnalysis {
  totalCount: number;
  internalCount: number;
  externalCount: number;
  otherProtocolsCount: number; // mailto, tel, javascript, etc.
  samples: LinkItem[];
}

export type FindingSeverity = 'critical' | 'warning' | 'info' | 'good';

export interface AuditFinding {
  id: string;
  severity: FindingSeverity;
  category: 'metadata' | 'headings' | 'images' | 'links' | 'general';
  title: string;
  description: string;
  recommendation?: string;
}

export interface QuickAuditResult {
  url: string;
  origin: string;
  hostname: string;
  timestamp: number;
  documentTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  metaRobots: string | null;
  htmlLang: string | null;
  headings: HeadingsAnalysis;
  images: ImagesAnalysis;
  links: LinksAnalysis;
  findings: AuditFinding[];
}

export interface BackendHealthResponse {
  status: 'ok' | 'degraded' | 'offline';
  service: string;
  checkedAt: number;
  latencyMs?: number;
}


// ==========================================
// Phase 1.3 Persistent Audit Models & Types
// ==========================================

export type AuditMode = 'quick' | 'full' | 'verified_owner';

export type AuditStatus =
  | 'created'
  | 'queued'
  | 'crawling'
  | 'analyzing'
  | 'enriching'
  | 'generating_recommendations'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';

export interface AuditRecord {
  id: string;
  target_url: string;
  normalized_url: string;
  hostname: string;
  mode: AuditMode;
  status: AuditStatus;
  max_pages: number;
  pages_discovered: number;
  pages_crawled: number;
  configuration_json: Record<string, unknown>;
  progress_json?: Record<string, any> | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface CreateAuditRequest {
  target_url: string;
  mode?: AuditMode;
  max_pages?: number;
  configuration?: Record<string, unknown>;
}

export interface AuditListResponse {
  audits: AuditRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AuditCancelResponse {
  message: string;
  audit: AuditRecord;
}

export interface AuditPagesResponse {
  audit_id: string;
  total: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
  pages: CrawlPageItem[];
  message?: string | null;
}

export interface AuditIssuesResponse {
  audit_id: string;
  total: number;
  issues: unknown[];
  message: string;
}

export interface ListAuditsParams {
  page?: number;
  page_size?: number;
  status?: AuditStatus | string;
  hostname?: string;
}


// --- Phase 1.4A Crawler Types ---

export interface CrawlPageItem {
  id: string;
  audit_id: string;
  requested_url: string;
  final_url: string;
  depth: number;
  fetch_status: string;
  http_status: number | null;
  content_type: string | null;
  response_time_ms: number;
  title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  meta_robots: string | null;
  html_lang: string | null;
  headings_json?: Record<string, any>;
  image_count: number;
  missing_alt_count: number;
  empty_alt_count: number;
  internal_link_count: number;
  external_link_count: number;
  content_hash: string | null;
  error_message: string | null;
  fetched_at: string;
  render?: CrawlPageRenderItem | null;
}

export interface CrawlPagesListResponse {
  audit_id: string;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  pages: CrawlPageItem[];
  message?: string | null;
}

export interface CrawlSitemapItem {
  id: string;
  audit_id: string;
  sitemap_url: string;
  status: string;
  url_count: number;
  error_message: string | null;
  discovered_at: string;
}

export interface CrawlSitemapsListResponse {
  audit_id: string;
  total: number;
  sitemaps: CrawlSitemapItem[];
}

export interface AuditStartResponse {
  message: string;
  audit_id: string;
  status: string;
}

export interface CrawlPageRenderItem {
  id: string;
  crawl_page_id: string;
  audit_id: string;
  render_status: 'success' | 'failed' | 'skipped' | 'unavailable';
  render_strategy: 'HTTP_ONLY' | 'RENDER_RECOMMENDED' | 'RENDER_REQUIRED' | 'RENDER_UNAVAILABLE';
  render_reason?: string | null;
  evidence_json?: Record<string, any>;
  rendered_title?: string | null;
  rendered_meta_description?: string | null;
  rendered_canonical_url?: string | null;
  rendered_meta_robots?: string | null;
  rendered_headings_json?: Record<string, any>;
  rendered_image_count: number;
  rendered_link_count: number;
  comparison_json?: {
    title_changed?: boolean;
    raw_title?: string;
    rendered_title?: string;
    meta_description_changed?: boolean;
    canonical_changed?: boolean;
    h1_changed?: boolean;
    headings_added_count?: number;
    images_added_count?: number;
    links_added_count?: number;
    rendered_reveals_more_content?: boolean;
    summary?: string;
  };
  performance_metrics_json?: {
    is_lab_measurement?: boolean;
    navigation_duration_ms?: number | null;
    dom_content_loaded_ms?: number | null;
    load_event_ms?: number | null;
    dom_interactive_ms?: number | null;
    response_time_ms?: number | null;
    resource_count?: number;
    transfer_size_bytes?: number;
  };
  screenshot_desktop_path?: string | null;
  screenshot_mobile_path?: string | null;
  error_message?: string | null;
  rendered_at: string;
}


// ==========================================
// Phase 2.1 - SEO Issues & Analysis Types
// ==========================================

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueStatus = 'pass' | 'warning' | 'fail' | 'unknown' | 'not_applicable';
export type IssueCategory = 'on_page' | 'images' | 'links' | 'technical' | 'content' | 'structured_data' | 'local_seo' | 'technology' | 'ai_search';

export interface SeoIssueItem {
  id: string;
  audit_id: string;
  crawl_page_id?: string | null;
  page_url?: string | null;
  rule_id: string;
  category: string;
  subcategory: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  evidence_json: Record<string, any>;
  recommendation: string;
  source_type: 'raw_http' | 'rendered_browser' | 'derived_from_crawl' | 'unknown';
  confidence: number;
  documentation_url?: string | null;
  rule_version: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
}

export interface IssueSummaryData {
  audit_id?: string;
  total_issues: number;
  total_assessments?: number;
  actionable_findings?: number;
  pass_count?: number;
  warning_count?: number;
  fail_count?: number;
  unknown_count?: number;
  not_applicable_count?: number;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  rules_executed_count: number;
}

export interface PaginatedIssuesResponse {
  audit_id: string;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  issues: SeoIssueItem[];
  summary?: IssueSummaryData | null;
  message?: string | null;
}

export interface AnalyzeAuditResponse {
  audit_id: string;
  status: string;
  message?: string;
  pages_analyzed: number;
  issues_found: number;
  total_issues?: number;
  engine_version?: string;
  summary: IssueSummaryData;
}


// ==========================================
// Phase 2.3 - Site-Wide Intelligence Types
// ==========================================

export interface SiteFindingGroupItem {
  id: string;
  audit_id: string;
  rule_id: string;
  rule_version: string;
  group_fingerprint: string;
  group_type: string;
  affected_page_ids: string[];
  affected_urls: string[];
  evidence: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PaginatedFindingGroupsResponse {
  audit_id: string;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: SiteFindingGroupItem[];
}

export interface LinkGraphNodeItem {
  url: string;
  crawl_page_id?: string | null;
  http_status?: number | null;
  inbound_internal_count: number;
  outbound_internal_count: number;
  crawl_depth: number;
  is_sitemap_only: boolean;
  is_seed: boolean;
}

export interface LinkGraphSummaryResponse {
  audit_id: string;
  total_nodes: number;
  total_internal_edges: number;
  unique_destinations: number;
  orphan_count: number;
  low_inlink_count: number;
  broken_link_destinations: number;
  redirect_destinations: number;
  max_crawl_depth: number;
  sitemap_only_count: number;
  crawl_completeness_caveat: string;
  nodes: LinkGraphNodeItem[];
}

export interface SiteWideSummaryResponse {
  audit_id: string;
  total_assessments: number;
  actionable_findings: number;
  pass_count: number;
  warning_count: number;
  fail_count: number;
  unknown_count: number;
  exact_duplicate_groups_count: number;
  near_duplicate_groups_count: number;
  duplicate_metadata_groups_count: number;
  canonical_conflict_groups_count: number;
  pages_analyzed: number;
  pages_excluded: number;
  evidence_coverage: string;
  rules_executed_count: number;
}


export type ScoreState = 'available' | 'provisional' | 'insufficient_evidence' | 'not_analyzed' | 'stale' | 'error';
export type PriorityTier = 'P0' | 'P1' | 'P2' | 'P3';

export interface AuditScorecardData {
  id: string;
  audit_id: string;
  policy_version: string;
  overall_score: number | null;
  score_label: string;
  overall_state: ScoreState;
  on_page_score: number | null;
  technical_score: number | null;
  sitewide_score: number | null;
  pages_evaluated: number;
  rules_evaluated: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  pass_count: number;
  category_scores: Record<string, any>;
  coverage: Record<string, any>;
  explanation: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PriorityActionItem {
  id: string;
  audit_id: string;
  scorecard_id?: string | null;
  priority_tier: PriorityTier;
  priority_rank: number;
  group_fingerprint: string;
  rule_id: string;
  category: string;
  title: string;
  description: string;
  recommendation: string;
  affected_page_count: number;
  affected_urls: string[];
  score_impact: number;
  created_at: string;
}

export interface PrioritiesResponse {
  items: PriorityActionItem[];
  total: number;
  limit: number;
  offset: number;
  tier_counts: Record<string, number>;
}

export interface ScoreBreakdownData {
  audit_id: string;
  overall_score: number | null;
  overall_state: ScoreState;
  score_label: string;
  category_scores: Record<string, any>;
  top_deductions: Array<{
    category: string;
    rule_id: string;
    points_lost: number;
    raw_deduction: number;
    fail_count: number;
    warn_count: number;
  }>;
  formula: string;
  disclaimer: string;
}

export interface ScoreCoverageData {
  audit_id: string;
  score_state: ScoreState;
  coverage_ratio: number;
  coverage_label: string;
  total_pages_crawled: number;
  pages_evaluated: number;
  pages_failed: number;
  rule_evaluations_total: number;
  rule_family_completion: Record<string, number>;
  has_rendering_evidence: boolean;
  crawl_limit_hit: boolean;
  details: Record<string, any>;
}

export interface TechnologyFindingItem {
  id: string;
  audit_id: string;
  technology_id: string;
  technology_name: string;
  technology_category:
    | 'cms'
    | 'frontend'
    | 'backend'
    | 'language'
    | 'ecommerce'
    | 'hosting'
    | 'database'
    | 'analytics'
    | 'advertising'
    | 'ux'
    | 'payments'
    | 'security'
    | 'search'
    | 'marketing'
    | 'fonts'
    | 'other'
    | string;
  subcategory?: string | null;
  status: 'detected' | 'possible' | 'inferred' | 'unknown' | 'not_observed' | string;
  confidence: number;
  confidence_level: 'high' | 'medium' | 'low';
  version_or_null: string | null;
  version_type?: 'explicit_version' | 'asset_hint_unverified' | 'inferred_version' | 'unknown' | string;
  provenance?: 'first_party' | 'third_party_embed' | 'asset_host' | 'inferred_dependency' | string;
  evidence_type: string;
  evidence_source: string;
  evidence_summary: string;
  observed_page_or_url: string;
  detection_method: string;
  page_count: number;
  affected_urls: string[];
  evidence_items: Array<{
    evidence_type: string;
    evidence_source: string;
    evidence_summary: string;
    observed_page_or_url: string;
    detection_method: string;
    raw_signal?: string | null;
    weight: number;
    provenance?: string;
    version_type?: string | null;
  }>;
  catalog_version?: string;
  engine_version?: string;
  limitations?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WordPressThemeItem {
  slug: string;
  name: string | null;
  version: string | null;
  status: 'active' | 'referenced' | 'unknown';
  evidence_source: string;
  confidence: number;
  confidence_level: string;
}

export interface WordPressPluginItem {
  slug: string;
  name: string | null;
  version: string | null;
  evidence_source: string;
  confidence: number;
  confidence_level: string;
}

export interface TechnologyListResponse {
  items: TechnologyFindingItem[];
  total: number;
  limit: number;
  offset: number;
  wordpress_themes: WordPressThemeItem[];
  wordpress_plugins: WordPressPluginItem[];
}

export interface TechnologySummaryResponse {
  audit_id: string;
  primary_cms: string | null;
  frontend_frameworks: string[];
  backend_runtimes: string[];
  total_detected: number;
  detected_technologies_count: number;
  possible_technologies_count: number;
  inferred_technologies_count?: number;
  confidence_distribution: Record<string, number>;
  wordpress_themes: WordPressThemeItem[];
  wordpress_plugins: WordPressPluginItem[];
  catalog_version?: string;
  engine_version?: string;
  evidence_coverage?: {
    catalog_version: string;
    engine_version: string;
    coverage_status: string;
    limitations?: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface AnalyzeTechnologiesResponse {
  message: string;
  audit_id: string;
  technologies_detected: number;
  primary_cms: string | null;
  technologies: TechnologyFindingItem[];
  wordpress_themes: WordPressThemeItem[];
  wordpress_plugins: WordPressPluginItem[];
  catalog_version?: string;
  engine_version?: string;
  evidence_coverage?: {
    catalog_version: string;
    engine_version: string;
    coverage_status: string;
    limitations?: string | null;
  };
}


