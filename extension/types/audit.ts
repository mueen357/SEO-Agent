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
  pages: unknown[];
  message: string;
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
