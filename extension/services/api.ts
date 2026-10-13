/**
 * Backend API Client & Health Check Service
 */

import type {
  AuditCancelResponse,
  AuditIssuesResponse,
  AuditListResponse,
  AuditPagesResponse,
  AuditRecord,
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
 * Retrieve issues for an audit (GET /api/v1/audits/{id}/issues)
 */
export async function getAuditIssues(
  auditId: string,
  baseUrl: string = DEFAULT_API_BASE
): Promise<AuditIssuesResponse> {
  const response = await fetch(`${baseUrl}/api/v1/audits/${encodeURIComponent(auditId)}/issues`, {
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
