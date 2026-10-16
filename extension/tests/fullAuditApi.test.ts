import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkBackendHealth,
  createAudit,
  startAudit,
  completeAuditAnalysis,
  getAudit,
  getAuditPages,
  cancelAudit,
  getAuditIssues,
  getAuditIssuesSummary,
  runAuditAnalysis,
  runTechnicalAuditAnalysis,
  runSitewideAuditAnalysis,
  getSitewideSummary,
  getSitewideDuplicateGroups,
  getSitewideLinkGraph,
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

  it('getAuditIssues fetches paginated issues with filter parameters', async () => {
    const mockIssuesResp = {
      audit_id: 'test-id',
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
      issues: [
        {
          id: 'issue-1',
          audit_id: 'test-id',
          crawl_page_id: 'page-1',
          page_url: 'https://example.com/item',
          rule_id: 'ONPAGE_TITLE_PRESENT',
          category: 'on_page',
          subcategory: 'title',
          title: 'Missing page title',
          description: 'The page has no title tag.',
          severity: 'high',
          status: 'fail',
          evidence_json: { document_title: null },
          recommendation: 'Add a concise, descriptive title.',
          source_type: 'raw_http',
          confidence: 1.0,
          rule_version: '1.0.0',
          fingerprint: 'abc123hash',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      summary: {
        audit_id: 'test-id',
        total_issues: 1,
        by_category: { on_page: 1 },
        by_severity: { high: 1 },
        by_status: { fail: 1 },
        rules_executed_count: 1,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockIssuesResp,
    } as any);

    const res = await getAuditIssues('test-id', { severity: 'high', category: 'on_page', page: 1, pageSize: 20 });
    expect(res.total).toBe(1);
    expect(res.issues[0]?.rule_id).toBe('ONPAGE_TITLE_PRESENT');
    expect(res.issues[0]?.severity).toBe('high');
    expect(res.summary?.by_status.fail).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/audits/test-id/issues?category=on_page&severity=high&page=1&page_size=20'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('getAuditIssuesSummary fetches aggregate issue breakdown', async () => {
    const mockSummary = {
      audit_id: 'test-id',
      total_issues: 12,
      by_category: { on_page: 8, images: 2, links: 2 },
      by_severity: { high: 2, medium: 4, low: 6 },
      by_status: { fail: 2, warning: 4, pass: 6 },
      rules_executed_count: 12,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as any);

    const res = await getAuditIssuesSummary('test-id');
    expect(res.total_issues).toBe(12);
    expect(res.by_category.on_page).toBe(8);
    expect(res.by_status.fail).toBe(2);
  });

  it('runAuditAnalysis triggers POST /api/v1/audits/{id}/analyze', async () => {
    const mockAnalyzeResp = {
      audit_id: 'test-id',
      status: 'completed',
      message: 'Analysis completed successfully',
      pages_analyzed: 3,
      issues_found: 16,
      summary: {
        audit_id: 'test-id',
        total_issues: 16,
        by_category: { on_page: 12, images: 2, links: 2 },
        by_severity: { high: 2, medium: 4, low: 10 },
        by_status: { fail: 2, warning: 4, pass: 10 },
        rules_executed_count: 16,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnalyzeResp,
    } as any);

    const res = await runAuditAnalysis('test-id');
    expect(res.status).toBe('completed');
    expect(res.pages_analyzed).toBe(3);
    expect(res.issues_found).toBe(16);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits/test-id/analyze',
      expect.objectContaining({ method: 'POST' })
    );
  });
  it('runTechnicalAuditAnalysis triggers POST /api/v1/audits/{id}/analyze/technical', async () => {
    const mockAnalyzeResp = {
      audit_id: 'test-id',
      status: 'completed',
      message: 'Technical SEO rule analysis completed successfully. Analyzed 3 page(s).',
      pages_analyzed: 3,
      issues_found: 22,
      summary: {
        total_assessments: 22,
        actionable_findings: 5,
        fail_count: 2,
        warning_count: 3,
        pass_count: 17,
        total_issues: 22,
        by_category: { technical: 22 },
        by_severity: { high: 2, medium: 3, low: 17 },
        by_status: { fail: 2, warning: 3, pass: 17 },
        rules_executed_count: 22,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnalyzeResp,
    } as any);

    const res = await runTechnicalAuditAnalysis('test-id');
    expect(res.status).toBe('completed');
    expect(res.pages_analyzed).toBe(3);
    expect(res.issues_found).toBe(22);
    expect(res.summary.actionable_findings).toBe(5);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits/test-id/analyze/technical',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('runSitewideAuditAnalysis triggers POST /api/v1/audits/{id}/analyze/sitewide', async () => {
    const mockResp = {
      audit_id: 'test-id',
      status: 'completed',
      message: 'Site-wide SEO analysis completed.',
      pages_analyzed: 5,
      issues_found: 13,
      summary: {
        total_assessments: 13,
        actionable_findings: 3,
        fail_count: 1,
        warning_count: 2,
        pass_count: 10,
        total_issues: 13,
        by_category: { content: 5, links: 6, technical: 2 },
        by_severity: { high: 1, medium: 2, low: 10 },
        by_status: { fail: 1, warning: 2, pass: 10 },
        rules_executed_count: 13,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResp,
    } as any);

    const res = await runSitewideAuditAnalysis('test-id');
    expect(res.status).toBe('completed');
    expect(res.pages_analyzed).toBe(5);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits/test-id/analyze/sitewide',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getSitewideSummary retrieves GET /api/v1/audits/{id}/sitewide/summary', async () => {
    const mockSummary = {
      audit_id: 'test-id',
      total_assessments: 13,
      actionable_findings: 4,
      pass_count: 9,
      warning_count: 3,
      fail_count: 1,
      unknown_count: 0,
      exact_duplicate_groups_count: 1,
      near_duplicate_groups_count: 1,
      duplicate_metadata_groups_count: 2,
      canonical_conflict_groups_count: 0,
      pages_analyzed: 8,
      pages_excluded: 0,
      evidence_coverage: 'sampled_crawl',
      rules_executed_count: 13,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    } as any);

    const res = await getSitewideSummary('test-id');
    expect(res.exact_duplicate_groups_count).toBe(1);
    expect(res.near_duplicate_groups_count).toBe(1);
    expect(res.rules_executed_count).toBe(13);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits/test-id/sitewide/summary',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('getSitewideDuplicateGroups queries GET /api/v1/audits/{id}/sitewide/duplicate-groups with params', async () => {
    const mockGroupsResp = {
      audit_id: 'test-id',
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
      items: [
        {
          id: 'group-1',
          audit_id: 'test-id',
          rule_id: 'SITE_CONTENT_DUPLICATE_EXACT',
          rule_version: '1.0.0',
          group_fingerprint: 'sha_test',
          group_type: 'exact_duplicate_content',
          affected_page_ids: ['p1', 'p2'],
          affected_urls: ['https://example.com/p1', 'https://example.com/p2'],
          evidence: { sha256: 'abcd1234' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGroupsResp,
    } as any);

    const res = await getSitewideDuplicateGroups('test-id', { groupType: 'exact_duplicate_content' });
    expect(res.total).toBe(1);
    expect(res.items?.[0]?.group_type).toBe('exact_duplicate_content');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits/test-id/sitewide/duplicate-groups?group_type=exact_duplicate_content',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('getSitewideLinkGraph retrieves GET /api/v1/audits/{id}/sitewide/link-graph', async () => {
    const mockGraphResp = {
      audit_id: 'test-id',
      total_nodes: 2,
      total_internal_edges: 3,
      unique_destinations: 2,
      orphan_count: 0,
      low_inlink_count: 1,
      broken_link_destinations: 0,
      redirect_destinations: 0,
      max_crawl_depth: 1,
      sitemap_only_count: 0,
      crawl_completeness_caveat: 'Sampled crawl graph.',
      nodes: [
        {
          url: 'https://example.com/',
          inbound_internal_count: 1,
          outbound_internal_count: 2,
          crawl_depth: 0,
          is_sitemap_only: false,
          is_seed: true,
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGraphResp,
    } as any);

    const res = await getSitewideLinkGraph('test-id');
    expect(res.total_nodes).toBe(2);
    expect(res.nodes?.[0]?.is_seed).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits/test-id/sitewide/link-graph',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('completeAuditAnalysis issues POST /api/v1/audits/{id}/complete-analysis', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Analysis job enqueued for existing audit.',
        audit_id: 'test-id',
        status: 'queued',
      }),
    } as any);

    const res = await completeAuditAnalysis('test-id');
    expect(res.status).toBe('queued');
    expect(res.audit_id).toBe('test-id');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/audits/test-id/complete-analysis',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('completeAuditAnalysis throws error when backend returns failure status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: "Audit 'test-id' not found." } }),
    } as any);

    await expect(completeAuditAnalysis('test-id')).rejects.toThrow("Audit 'test-id' not found.");
  });
});
