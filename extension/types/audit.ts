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