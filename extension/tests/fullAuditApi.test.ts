import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkBackendHealth,
  createAudit,
  startAudit,
  getAudit,
  getAuditPages,
  cancelAudit,
} from '../services/api';
import {
  saveActiveFullAuditId,
  getActiveFullAuditId,
  clearActiveFullAuditId,
} from '../services/storage';

describe('Full Website Audit API & Storage Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('checkBackendHealth returns ok status when backend is responsive', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', service: 'website-audit-api' }),
    } as any);

    const res = await checkBackendHealth('http://127.0.0.1:8000');
    expect(res.status).toBe('ok');
    expect(res.service).toBe('website-audit-api');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('checkBackendHealth returns offline status when network error occurs', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const res = await checkBackendHealth('http://127.0.0.1:8000');
    expect(res.status).toBe('offline');
    expect(res.service).toContain('Offline');
  });

  it('createAudit issues POST /api/v1/audits with idempotency key and configuration', async () => {
    const mockAudit = {
      id: '11111111-2222-3333-4444-555555555555',
      target_url: 'https://example.com',
      normalized_url: 'https://example.com',
      hostname: 'example.com',
      mode: 'full',
      status: 'created',
      max_pages: 50,
      pages_discovered: 0,
      pages_crawled: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAudit,
    } as any);

    const res = await createAudit(
      {
        target_url: 'https://example.com',
        mode: 'full',
        configuration: { max_pages: 50, render_javascript: 'auto' },
      },
      'custom-key-123'
    );

    expect(res.id).toBe(mockAudit.id);
    expect(res.status).toBe('created');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': expect.any(String),
        }),
      })
    );
  });

  it('startAudit triggers POST /api/v1/audits/{id}/start', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Audit started',
        audit_id: 'test-id',
        status: 'queued',
      }),
    } as any);

    const res = await startAudit('test-id');
    expect(res.status).toBe('queued');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits/test-id/start',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getAuditPages fetches paginated pages with dynamic render metadata', async () => {
    const mockResponse = {
      audit_id: 'test-id',
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
      pages: [
        {
          id: 'page-1',
          audit_id: 'test-id',
          requested_url: 'https://example.com',
          final_url: 'https://example.com',
          depth: 0,
          fetch_status: 'success',
          http_status: 200,
          response_time_ms: 85,
          title: 'Example Page',
          image_count: 2,
          internal_link_count: 3,
          external_link_count: 1,
          fetched_at: new Date().toISOString(),
          render: {
            id: 'render-1',
            render_status: 'success',
            render_strategy: 'RENDER_REQUIRED',
            render_reason: 'Client SPA detected',
            rendered_title: 'Hydrated Page Title',
            comparison_json: {
              title_changed: true,
              headings_added_count: 2,
              summary: 'Dynamic rendering revealed additional content',
            },
            performance_metrics_json: {
              is_lab_measurement: true,
              dom_content_loaded_ms: 120,
              load_event_ms: 250,
            },
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const res = await getAuditPages('test-id', 1, 20);
    expect(res.total).toBe(1);
    expect(res.pages[0]?.render?.render_status).toBe('success');
    expect(res.pages[0]?.render?.comparison_json?.title_changed).toBe(true);
    expect(res.pages[0]?.render?.performance_metrics_json?.dom_content_loaded_ms).toBe(120);
  });

  it('cancelAudit calls cancel endpoint and returns cancelled status', async () => {
    const mockAudit = {
      id: 'test-id',
      target_url: 'https://example.com',
      normalized_url: 'https://example.com',
      hostname: 'example.com',
      mode: 'full',
      status: 'cancelled',
      max_pages: 50,
      pages_discovered: 0,
      pages_crawled: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Audit cancelled',
        audit: mockAudit,
      }),
    } as any);

    const res = await cancelAudit('test-id');
    expect(res.audit.status).toBe('cancelled');
  });

  it('persists and retrieves active full audit ID via chrome.storage.local', async () => {
    const store: Record<string, any> = {};
    (global as any).chrome = {
      storage: {
        local: {
          set: vi.fn(async (obj) => Object.assign(store, obj)),
          get: vi.fn(async (keys) => {
            if (typeof keys === 'string') return { [keys]: store[keys] };
            return store;
          }),
          remove: vi.fn(async (key) => delete store[key]),
        },
      },
    };

    await saveActiveFullAuditId('audit-uuid-1234');
    expect(store['website_audit_active_full_id']).toBe('audit-uuid-1234');

    const retrieved = await getActiveFullAuditId();
    expect(retrieved).toBe('audit-uuid-1234');

    await clearActiveFullAuditId();
    expect(store['website_audit_active_full_id']).toBeUndefined();
  });
});
