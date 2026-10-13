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
