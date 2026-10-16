/**
 * Backend API Client & Health Check Service
 */

import type {
  AuditCancelResponse,
  AuditIssuesResponse,
  AuditListResponse,
  AuditPagesResponse,
  PaginatedIssuesResponse,
  IssueSummaryData,
  AnalyzeAuditResponse,
  SiteWideSummaryResponse,
  PaginatedFindingGroupsResponse,
  LinkGraphSummaryResponse,
  AuditRecord,
  AuditScorecardData,
  PriorityActionItem,
  PrioritiesResponse,
  ScoreBreakdownData,
  ScoreCoverageData,
  AnalyzeTechnologiesResponse,
  TechnologyListResponse,
  TechnologySummaryResponse,
  BackendHealthResponse,
  CreateAuditRequest,
  ListAuditsParams,
} from '../types/audit';

const DEFAULT_API_BASE = 'http://127.0.0.1:8000';

export async function checkBackendHealth(baseUrl: string = DEFAULT_API_BASE): Promise<BackendHealthResponse> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'degraded',
        service: `HTTP ${response.status}`,
        checkedAt: Date.now(),
        latencyMs
      };
    }

    const data = await response.json();
    return {
      status: data.status === 'ok' ? 'ok' : 'degraded',
      service: data.service || 'website-audit-api',
      checkedAt: Date.now(),
      latencyMs
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    return {
      status: 'offline',
      service: 'FastAPI Offline (127.0.0.1:8000)',
      checkedAt: Date.now(),
      latencyMs
    };
  }
}

/**
 * Create a persistent audit record (POST /api/v1/audits)
 */
export async function createAudit(
  request: CreateAuditRequest,
  idempotencyKey?: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AuditRecord> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await fetch(`${baseUrl}/api/v1/audits`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to create audit (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Retrieve an existing audit by ID (GET /api/v1/audits/{id})
 */
export async function getAudit(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AuditRecord> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to retrieve audit (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Query audits with pagination and status/hostname filters (GET /api/v1/audits)
 */
export async function listAudits(
  params?: ListAuditsParams,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AuditListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.page_size) query.set('page_size', String(params.page_size));
  if (params?.status) query.set('status', params.status);
  if (params?.hostname) query.set('hostname', params.hostname);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(`${baseUrl}/api/v1/audits${qs}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to list audits (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Cancel an audit job (POST /api/v1/audits/{id}/cancel)
 */
export async function cancelAudit(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AuditCancelResponse> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/cancel`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to cancel audit (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Retrieve pages for an audit (GET /api/v1/audits/{id}/pages)
 */
export async function getAuditPages(
  auditId: string,
  page: number = 1,
  pageSize: number = 20,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AuditPagesResponse> {
  const url = new URL(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/pages`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(pageSize));
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to fetch audit pages (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}




/**
 * Start background crawl execution for an audit (POST /api/v1/audits/{id}/start)
 */
export async function startAudit(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<{ message: string; audit_id: string; status: string }> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/start`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to start audit (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Run missing analysis stages for an existing completed crawl (POST /api/v1/audits/{id}/complete-analysis)
 */
export async function completeAuditAnalysis(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<{ message: string; audit_id: string; status: string }> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/complete-analysis`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to complete audit analysis (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Retrieve discovered sitemaps for an audit (GET /api/v1/audits/{id}/sitemaps)
 */
export async function getAuditSitemaps(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<{ audit_id: string; total: number; sitemaps: any[] }> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/sitemaps`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to fetch audit sitemaps (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Retrieve detected SEO issues for an audit (GET /api/v1/audits/{id}/issues)
 */
export async function getAuditIssues(
  auditId: string,
  options: {
    category?: string;
    severity?: string;
    status?: string;
    crawl_page_id?: string;
    page?: number;
    pageSize?: number;
  } = {},
  baseUrl: string = DEFAULT_API_BASE
): Promise<PaginatedIssuesResponse> {
  const query = new URLSearchParams();
  if (options.category) query.set('category', options.category);
  if (options.severity) query.set('severity', options.severity);
  if (options.status) query.set('status', options.status);
  if (options.crawl_page_id) query.set('crawl_page_id', options.crawl_page_id);
  if (options.page) query.set('page', String(options.page));
  if (options.pageSize) query.set('page_size', String(options.pageSize));

  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/issues${qs}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to fetch audit issues (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Retrieve aggregate summary counts of SEO issues (GET /api/v1/audits/{id}/issues/summary)
 */
export async function getAuditIssuesSummary(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<IssueSummaryData> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/issues/summary`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to fetch issues summary (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Trigger deterministic SEO rule analysis (POST /api/v1/audits/{id}/analyze)
 */
export async function runAuditAnalysis(
  auditId: string,
  category?: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AnalyzeAuditResponse> {
  const url = category
    ? `${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/analyze?category=${encodeURIComponent(category)}`
    : `${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/analyze`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to run SEO analysis (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Trigger deterministic technical SEO rule analysis (POST /api/v1/audits/{id}/analyze/technical)
 */
export async function runTechnicalAuditAnalysis(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AnalyzeAuditResponse> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/analyze/technical`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to run Technical SEO analysis (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}


/**


/**
 * Trigger deterministic site-wide SEO intelligence analysis (POST /api/v1/audits/{id}/analyze/sitewide)
 */
export async function runSitewideAuditAnalysis(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AnalyzeAuditResponse> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/analyze/sitewide`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to run site-wide SEO analysis (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Retrieve site-wide intelligence summary (GET /api/v1/audits/{id}/sitewide/summary)
 */
export async function getSitewideSummary(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<SiteWideSummaryResponse> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/sitewide/summary`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to fetch site-wide summary (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Retrieve site-wide duplicate finding groups (GET /api/v1/audits/{id}/sitewide/duplicate-groups)
 */
export async function getSitewideDuplicateGroups(
  auditId: string,
  options: {
    groupType?: string;
    ruleId?: string;
    page?: number;
    pageSize?: number;
  } = {},
  baseUrl: string = DEFAULT_API_BASE
): Promise<PaginatedFindingGroupsResponse> {
  const query = new URLSearchParams();
  if (options.groupType) query.set('group_type', options.groupType);
  if (options.ruleId) query.set('rule_id', options.ruleId);
  if (options.page) query.set('page', String(options.page));
  if (options.pageSize) query.set('page_size', String(options.pageSize));

  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/sitewide/duplicate-groups${qs}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to fetch duplicate groups (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * Retrieve deterministic internal link graph (GET /api/v1/audits/{id}/sitewide/link-graph)
 */
export async function getSitewideLinkGraph(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<LinkGraphSummaryResponse> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/sitewide/link-graph`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `Failed to fetch link graph (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

export async function calculateAuditScore(
  auditId: string,
  force: boolean = false,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AuditScorecardData> {
  const url = `${baseUrl}/api/v1/audits/${auditId}/score?force=${force}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to calculate audit score (HTTP ${response.status})`);
  }

  return response.json();
}

export async function getAuditScore(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AuditScorecardData> {
  const url = `${baseUrl}/api/v1/audits/${auditId}/score`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch audit score (HTTP ${response.status})`);
  }

  return response.json();
}

export async function getAuditScoreBreakdown(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<ScoreBreakdownData> {
  const url = `${baseUrl}/api/v1/audits/${auditId}/score/breakdown`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch score breakdown (HTTP ${response.status})`);
  }

  return response.json();
}

export async function getAuditScoreCoverage(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<ScoreCoverageData> {
  const url = `${baseUrl}/api/v1/audits/${auditId}/score/coverage`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch score coverage (HTTP ${response.status})`);
  }

  return response.json();
}

export async function getAuditPriorities(
  auditId: string,
  params: {
    priority_tier?: string;
    category?: string;
    rule_id?: string;
    page?: number;
    page_size?: number;
  } = {},
  baseUrl: string = DEFAULT_API_BASE
): Promise<PrioritiesResponse> {
  const query = new URLSearchParams();
  if (params.priority_tier) query.set('priority_tier', params.priority_tier);
  if (params.category) query.set('category', params.category);
  if (params.rule_id) query.set('rule_id', params.rule_id);
  if (params.page) query.set('page', params.page.toString());
  if (params.page_size) query.set('page_size', params.page_size.toString());

  const url = `${baseUrl}/api/v1/audits/${auditId}/priorities?${query.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch audit priorities (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Trigger technology and CMS analysis (POST /api/v1/audits/{id}/technologies/analyze)
 */
export async function analyzeTechnologies(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AnalyzeTechnologiesResponse> {
  const url = `${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/technologies/analyze`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to analyze technologies (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Retrieve detected technologies list (GET /api/v1/audits/{id}/technologies)
 */
export async function getAuditTechnologies(
  auditId: string,
  params: {
    category?: string;
    status?: string;
    min_confidence?: number;
    page?: number;
    page_size?: number;
  } = {},
  baseUrl: string = DEFAULT_API_BASE
): Promise<TechnologyListResponse> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.status) query.set('status', params.status);
  if (params.min_confidence !== undefined) query.set('min_confidence', params.min_confidence.toString());
  if (params.page) query.set('page', params.page.toString());
  if (params.page_size) query.set('page_size', params.page_size.toString());

  const qs = query.toString() ? `?${query.toString()}` : '';
  const url = `${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/technologies${qs}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch technologies (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Retrieve technology summary (GET /api/v1/audits/{id}/technologies/summary)
 */
export async function getAuditTechnologySummary(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<TechnologySummaryResponse> {
  const url = `${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/technologies/summary`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch technology summary (HTTP ${response.status})`);
  }

  return response.json();
}

