import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeTechnologies,
  getAuditTechnologies,
  getAuditTechnologySummary,
} from '../services/api';
import type {
  AnalyzeTechnologiesResponse,
  TechnologyListResponse,
  TechnologySummaryResponse,
} from '../types/audit';

describe('Technology & CMS Detection API Client (Mocked API Suite)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const auditId = 'test-audit-123';

  it('analyzeTechnologies sends POST request to analyze endpoint with correct headers', async () => {
    const mockResponse: AnalyzeTechnologiesResponse = {
      message: 'Technologies analyzed successfully',
      audit_id: auditId,
      technologies_detected: 4,
      primary_cms: 'WordPress',
      technologies: [],
      wordpress_themes: [],
      wordpress_plugins: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    global.fetch = fetchMock;

    const result = await analyzeTechnologies(auditId, 'http://127.0.0.1:8000');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBe(1);
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:8000/api/v1/audits/${encodeURIComponent(auditId)}/technologies/analyze`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Accept: 'application/json' });
    expect(result.technologies_detected).toBe(4);
    expect(result.primary_cms).toBe('WordPress');
  });

  it('analyzeTechnologies throws descriptive error on non-200 failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Audit 'test-audit-123' has 0 crawled pages. Cannot perform technology detection without crawl evidence." }),
    });

    await expect(analyzeTechnologies(auditId, 'http://127.0.0.1:8000')).rejects.toThrow(
      "Audit 'test-audit-123' has 0 crawled pages"
    );
  });

  it('getAuditTechnologies formats query parameters properly', async () => {
    const mockList: TechnologyListResponse = {
      items: [
        {
          id: 'tech-1',
          audit_id: auditId,
          technology_id: 'wordpress',
          technology_name: 'WordPress',
          technology_category: 'cms',
          status: 'detected',
          confidence: 0.95,
          confidence_level: 'high',
          detection_method: 'composite',
          evidence_type: 'composite',
          evidence_summary: 'wp-content paths and meta generator',
          evidence_source: '/wp-content/themes/twentytwentyfour/style.css',
          observed_page_or_url: 'https://example.com/',
          version_or_null: null,
          page_count: 5,
          affected_urls: ['https://example.com/'],
          evidence_items: [],
          created_at: '2026-10-15T00:00:00Z',
          updated_at: '2026-10-15T00:00:00Z',
        },
      ],
      total: 1,
      limit: 10,
      offset: 5,
      wordpress_themes: [],
      wordpress_plugins: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockList,
    });
    global.fetch = fetchMock;

    const result = await getAuditTechnologies(
      auditId,
      {
        category: 'cms',
        status: 'detected',
        min_confidence: 0.7,
        page: 2,
        page_size: 5,
      },
      'http://127.0.0.1:8000'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls;
    const [calledUrl] = calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/api/v1/audits/test-audit-123/technologies?');
    expect(calledUrl).toContain('category=cms');
    expect(calledUrl).toContain('status=detected');
    expect(calledUrl).toContain('min_confidence=0.7');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('page_size=5');
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.technology_name).toBe('WordPress');
  });

  it('getAuditTechnologies handles empty filter parameters with clean URL', async () => {
    const mockList: TechnologyListResponse = {
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      wordpress_themes: [],
      wordpress_plugins: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockList,
    });
    global.fetch = fetchMock;

    await getAuditTechnologies(auditId, {}, 'http://127.0.0.1:8000');

    const calls = fetchMock.mock.calls;
    const [calledUrl] = calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`http://127.0.0.1:8000/api/v1/audits/${auditId}/technologies`);
  });

  it('getAuditTechnologySummary retrieves high-level summary including WordPress details', async () => {
    const mockSummary: TechnologySummaryResponse = {
      audit_id: auditId,
      primary_cms: 'WordPress',
      frontend_frameworks: ['React'],
      backend_runtimes: ['PHP'],
      total_detected: 3,
      detected_technologies_count: 3,
      possible_technologies_count: 0,
      confidence_distribution: { high: 2, medium: 1, low: 0 },
      wordpress_themes: [
        {
          slug: 'twentytwentyfour',
          name: 'Twenty Twenty-Four',
          version: '1.2',
          status: 'active',
          confidence: 0.9,
          confidence_level: 'high',
          evidence_source: '/wp-content/themes/twentytwentyfour/style.css',
        },
      ],
      wordpress_plugins: [
        {
          slug: 'woocommerce',
          name: 'WooCommerce',
          version: '8.5',
          confidence: 0.85,
          confidence_level: 'high',
          evidence_source: '/wp-content/plugins/woocommerce/assets/client/blocks/wc-settings.js',
        },
      ],
      created_at: '2026-10-15T00:00:00Z',
      updated_at: '2026-10-15T00:00:00Z',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSummary,
    });

    const summary = await getAuditTechnologySummary(auditId, 'http://127.0.0.1:8000');

    expect(summary.primary_cms).toBe('WordPress');
    expect(summary.total_detected).toBe(3);
    expect(summary.wordpress_themes.length).toBe(1);
    expect(summary.wordpress_themes[0]?.slug).toBe('twentytwentyfour');
    expect(summary.wordpress_plugins.length).toBe(1);
    expect(summary.wordpress_plugins[0]?.slug).toBe('woocommerce');
  });

  it('getAuditTechnologySummary throws on 404 not analyzed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Technology analysis has not been executed for audit 'test-audit-123'" }),
    });

    await expect(getAuditTechnologySummary(auditId, 'http://127.0.0.1:8000')).rejects.toThrow(
      "Technology analysis has not been executed"
    );
  });
});
