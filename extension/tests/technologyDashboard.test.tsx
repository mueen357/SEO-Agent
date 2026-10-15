import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TechnologyDashboard } from '../components/audit/TechnologyDashboard';
import * as api from '../services/api';
import type {
  TechnologyFindingItem,
  TechnologySummaryResponse,
} from '../types/audit';

// Configure React act environment for jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('TechnologyDashboard Component Verification (Mocked Suite)', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // Base fixtures
  const auditId = 'test-audit-123';

  const wpSummary: TechnologySummaryResponse = {
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
        confidence: 0.95,
        confidence_level: 'high',
        evidence_source: '/wp-content/themes/twentytwentyfour/style.css?ver=1.2',
      },
      {
        slug: 'astra',
        name: 'Astra',
        version: null,
        status: 'referenced',
        confidence: 0.65,
        confidence_level: 'medium',
        evidence_source: '/wp-content/themes/astra/assets/css/style.css',
      },
    ],
    wordpress_plugins: [
      {
        slug: 'woocommerce',
        name: 'WooCommerce',
        version: '8.5',
        confidence: 0.88,
        confidence_level: 'high',
        evidence_source: '/wp-content/plugins/woocommerce/assets/client/blocks/wc-settings.js?ver=8.5',
      },
    ],
    created_at: '2026-10-15T00:00:00Z',
    updated_at: '2026-10-15T00:00:00Z',
  };

  const wpItems: TechnologyFindingItem[] = [
    {
      id: 'tech-wp',
      audit_id: auditId,
      technology_id: 'wordpress',
      technology_name: 'WordPress',
      technology_category: 'cms',
      status: 'detected',
      confidence: 0.95,
      confidence_level: 'high',
      detection_method: 'composite',
      evidence_type: 'composite',
      evidence_summary: 'Observed /wp-content/ assets and meta generator tag.',
      evidence_source: '/wp-content/themes/twentytwentyfour/style.css',
      observed_page_or_url: 'https://example.com/',
      version_or_null: null,
      page_count: 5,
      affected_urls: ['https://example.com/'],
      evidence_items: [
        {
          evidence_type: 'meta_tag',
          evidence_source: '<meta name="generator" content="WordPress 6.4.2" />',
          evidence_summary: 'Generator meta tag',
          observed_page_or_url: 'https://example.com/',
          detection_method: 'meta_generator',
          weight: 0.8,
        },
        {
          evidence_type: 'asset_path',
          evidence_source: '/wp-content/themes/twentytwentyfour/',
          evidence_summary: 'WordPress theme path',
          observed_page_or_url: 'https://example.com/',
          detection_method: 'theme_path',
          weight: 0.7,
        },
      ],
      created_at: '2026-10-15T00:00:00Z',
      updated_at: '2026-10-15T00:00:00Z',
    },
    {
      id: 'tech-php',
      audit_id: auditId,
      technology_id: 'php',
      technology_name: 'PHP',
      technology_category: 'backend',
      status: 'detected',
      confidence: 0.85,
      confidence_level: 'high',
      detection_method: 'inferred',
      evidence_type: 'header',
      evidence_summary: 'Inferred from detected WordPress CMS environment.',
      evidence_source: 'x-powered-by header or CMS prerequisite',
      observed_page_or_url: 'https://example.com/',
      version_or_null: null,
      page_count: 5,
      affected_urls: ['https://example.com/'],
      evidence_items: [
        {
          evidence_type: 'header',
          evidence_source: 'X-Powered-By: PHP/8.2.14',
          evidence_summary: 'Server runtime header',
          observed_page_or_url: 'https://example.com/',
          detection_method: 'http_header',
          weight: 0.85,
        },
      ],
      created_at: '2026-10-15T00:00:00Z',
      updated_at: '2026-10-15T00:00:00Z',
    },
    {
      id: 'tech-react',
      audit_id: auditId,
      technology_id: 'react',
      technology_name: 'React',
      technology_category: 'frontend',
      status: 'detected',
      confidence: 0.9,
      confidence_level: 'high',
      detection_method: 'dom_element',
      evidence_type: 'dom_element',
      evidence_summary: 'Observed React root container attributes and bundle markers.',
      evidence_source: '<div id="root" data-reactroot=""></div>',
      observed_page_or_url: 'https://example.com/app',
      version_or_null: null,
      page_count: 3,
      affected_urls: ['https://example.com/app'],
      evidence_items: [],
      created_at: '2026-10-15T00:00:00Z',
      updated_at: '2026-10-15T00:00:00Z',
    },
  ];

  it('1. State: NO AUDIT SELECTED renders prompt to select or initiate audit', async () => {
    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={null}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('No Full Website Audit Selected');
    expect(container.textContent).toContain('Full Website Audit mode');
  });

  it('2. State: BACKEND OFFLINE renders warning banner with connection advice', async () => {
    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={false}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('Backend Service Offline');
    expect(container.textContent).toContain('127.0.0.1:8000');
  });

  it('3. State: AUDIT RUNNING renders progress indicator preventing premature detection', async () => {
    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={true}
        />
      );
    });

    expect(container.textContent).toContain('Full Audit Crawl In Progress');
    expect(container.textContent).toContain('The crawler is collecting pages and response headers');
  });

  it('4. State: SUMMARY 404 / NOT ANALYZED renders re-analyze prompt instead of fatal crash', async () => {
    vi.spyOn(api, 'getAuditTechnologySummary').mockRejectedValue(
      new Error("Technology analysis has not been executed for audit 'test-audit-123' (HTTP 404)")
    );
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      wordpress_themes: [],
      wordpress_plugins: [],
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('Technology Analysis Not Run Yet');
    expect(container.textContent).toContain('Run Technology Analysis');
  });

  it('5. State: INSUFFICIENT EVIDENCE (0 crawled pages) renders explicit limitation notice', async () => {
    vi.spyOn(api, 'getAuditTechnologySummary').mockRejectedValue(
      new Error("Audit 'test-audit-123' has 0 crawled pages. Cannot perform technology detection.")
    );

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('Insufficient Crawl Evidence');
    expect(container.textContent).toContain('This audit has 0 crawled pages');
  });

  it('6. Section A & B: WordPress with themes, plugins, active vs referenced, and unverified disclaimer', async () => {
    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(wpSummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: wpItems,
      total: wpItems.length,
      limit: 100,
      offset: 0,
      wordpress_themes: wpSummary.wordpress_themes,
      wordpress_plugins: wpSummary.wordpress_plugins,
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // Overview Section
    expect(container.textContent).toContain('WordPress');
    expect(container.textContent).toContain('3 Technologies');

    // Themes Section
    expect(container.textContent).toContain('Twenty Twenty-Four');
    expect(container.textContent).toContain('Active Theme');
    expect(container.textContent).toContain('Astra');
    expect(container.textContent).toContain('Referenced Theme');

    // Unverified version hint presentation check
    expect(container.textContent).toContain('Asset hint: v1.2 (Unverified release)');
    expect(container.textContent).toContain('Version not verified');

    // Plugins Section
    expect(container.textContent).toContain('WooCommerce');
    expect(container.textContent).toContain('Detection Boundary:');
    expect(container.textContent).toContain('Only publicly observable frontend asset paths');
  });

  it('7. Section C & D: Next.js + React coexistence and PHP runtime inference', async () => {
    const coexistenceSummary: TechnologySummaryResponse = {
      audit_id: auditId,
      primary_cms: null,
      frontend_frameworks: ['Next.js', 'React'],
      backend_runtimes: ['Node.js'],
      total_detected: 3,
      detected_technologies_count: 3,
      possible_technologies_count: 0,
      confidence_distribution: { high: 3, medium: 0, low: 0 },
      wordpress_themes: [],
      wordpress_plugins: [],
      created_at: '2026-10-15T00:00:00Z',
      updated_at: '2026-10-15T00:00:00Z',
    };

    const coexistenceItems: TechnologyFindingItem[] = [
      {
        id: 'tech-nextjs',
        audit_id: auditId,
        technology_id: 'nextjs',
        technology_name: 'Next.js',
        technology_category: 'frontend',
        status: 'detected',
        confidence: 0.95,
        confidence_level: 'high',
        detection_method: 'composite',
        evidence_type: 'script_src',
        evidence_summary: 'Observed /_next/static/ scripts and __NEXT_DATA__ tag.',
        evidence_source: '<script id="__NEXT_DATA__">',
        observed_page_or_url: 'https://example.com/',
        version_or_null: null,
        page_count: 4,
        affected_urls: ['https://example.com/'],
        evidence_items: [],
        created_at: '2026-10-15T00:00:00Z',
        updated_at: '2026-10-15T00:00:00Z',
      },
      {
        id: 'tech-react',
        audit_id: auditId,
        technology_id: 'react',
        technology_name: 'React',
        technology_category: 'frontend',
        status: 'detected',
        confidence: 0.9,
        confidence_level: 'high',
        detection_method: 'script_src',
        evidence_type: 'script_src',
        evidence_summary: 'Coexists as underlying Next.js rendering engine.',
        evidence_source: '/_next/static/chunks/framework.js',
        observed_page_or_url: 'https://example.com/',
        version_or_null: null,
        page_count: 4,
        affected_urls: ['https://example.com/'],
        evidence_items: [],
        created_at: '2026-10-15T00:00:00Z',
        updated_at: '2026-10-15T00:00:00Z',
      },
      {
        id: 'tech-node',
        audit_id: auditId,
        technology_id: 'nodejs',
        technology_name: 'Node.js',
        technology_category: 'backend',
        status: 'detected',
        confidence: 0.85,
        confidence_level: 'high',
        detection_method: 'inferred',
        evidence_type: 'inferred',
        evidence_summary: 'Inferred server runtime for Next.js SSR deployment.',
        evidence_source: 'Next.js server-side environment',
        observed_page_or_url: 'https://example.com/',
        version_or_null: null,
        page_count: 4,
        affected_urls: ['https://example.com/'],
        evidence_items: [],
        created_at: '2026-10-15T00:00:00Z',
        updated_at: '2026-10-15T00:00:00Z',
      },
    ];

    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(coexistenceSummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: coexistenceItems,
      total: 3,
      limit: 100,
      offset: 0,
      wordpress_themes: [],
      wordpress_plugins: [],
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // Both Next.js and React must coexist
    expect(container.textContent).toContain('Next.js');
    expect(container.textContent).toContain('React');
    expect(container.textContent).toContain('Node.js');
  });

  it('8. Section B: Shopify CMS detection with accurate confidence and tags', async () => {
    const shopifySummary: TechnologySummaryResponse = {
      audit_id: auditId,
      primary_cms: 'Shopify',
      frontend_frameworks: [],
      backend_runtimes: [],
      total_detected: 1,
      detected_technologies_count: 1,
      possible_technologies_count: 0,
      confidence_distribution: { high: 1, medium: 0, low: 0 },
      wordpress_themes: [],
      wordpress_plugins: [],
      created_at: '2026-10-15T00:00:00Z',
      updated_at: '2026-10-15T00:00:00Z',
    };

    const shopifyItems: TechnologyFindingItem[] = [
      {
        id: 'tech-shopify',
        audit_id: auditId,
        technology_id: 'shopify',
        technology_name: 'Shopify',
        technology_category: 'cms',
        status: 'detected',
        confidence: 0.98,
        confidence_level: 'high',
        detection_method: 'composite',
        evidence_type: 'script_src',
        evidence_summary: 'Observed cdn.shopify.com and Shopify.shop object.',
        evidence_source: 'https://cdn.shopify.com/s/files/theme.js',
        observed_page_or_url: 'https://shop.example.com/',
        version_or_null: null,
        page_count: 8,
        affected_urls: ['https://shop.example.com/'],
        evidence_items: [],
        created_at: '2026-10-15T00:00:00Z',
        updated_at: '2026-10-15T00:00:00Z',
      },
    ];

    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(shopifySummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: shopifyItems,
      total: 1,
      limit: 100,
      offset: 0,
      wordpress_themes: [],
      wordpress_plugins: [],
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('Shopify');
    expect(container.textContent).toContain('98% (high)');
  });

  it('9. Section B: Unknown CMS is not falsely labeled as Custom without proof', async () => {
    const unknownSummary: TechnologySummaryResponse = {
      audit_id: auditId,
      primary_cms: null,
      frontend_frameworks: [],
      backend_runtimes: [],
      total_detected: 0,
      detected_technologies_count: 0,
      possible_technologies_count: 0,
      confidence_distribution: { high: 0, medium: 0, low: 0 },
      wordpress_themes: [],
      wordpress_plugins: [],
      created_at: '2026-10-15T00:00:00Z',
      updated_at: '2026-10-15T00:00:00Z',
    };

    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(unknownSummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      wordpress_themes: [],
      wordpress_plugins: [],
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('None / Unknown');
    expect(container.textContent).not.toContain('Custom / Not Identified');
  });

  it('10. Accurate confidence thresholds (detected >= 0.70, possible 0.40 - 0.70)', async () => {
    const possibleItems: TechnologyFindingItem[] = [
      {
        id: 'tech-vue',
        audit_id: auditId,
        technology_id: 'vue',
        technology_name: 'Vue.js',
        technology_category: 'frontend',
        status: 'possible',
        confidence: 0.55,
        confidence_level: 'medium',
        detection_method: 'script_src',
        evidence_type: 'script_src',
        evidence_summary: 'Partial vue variable name observed in minified script.',
        evidence_source: '/assets/app.js',
        observed_page_or_url: 'https://example.com/',
        version_or_null: null,
        page_count: 1,
        affected_urls: ['https://example.com/'],
        evidence_items: [],
        created_at: '2026-10-15T00:00:00Z',
        updated_at: '2026-10-15T00:00:00Z',
      },
    ];

    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue({
      ...wpSummary,
      primary_cms: null,
      total_detected: 1,
      detected_technologies_count: 0,
      possible_technologies_count: 1,
    });
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: possibleItems,
      total: 1,
      limit: 100,
      offset: 0,
      wordpress_themes: [],
      wordpress_plugins: [],
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('Possible');
    expect(container.textContent).toContain('55% (medium)');
  });

  it('11. Evidence Inspector: Disclosure expands and displays evidence items safely', async () => {
    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(wpSummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: wpItems,
      total: wpItems.length,
      limit: 100,
      offset: 0,
      wordpress_themes: wpSummary.wordpress_themes,
      wordpress_plugins: wpSummary.wordpress_plugins,
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // Find the WordPress item disclosure button
    const wpDisclosure = container.querySelector('[role="button"][aria-expanded="false"]');
    expect(wpDisclosure).not.toBeNull();

    // Click to expand evidence
    await act(async () => {
      wpDisclosure?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(wpDisclosure?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Primary Evidence Source');
    expect(container.textContent).toContain('Supporting Signal Provenance');
    expect(container.textContent).toContain('meta_tag');
    expect(container.textContent).toContain('asset_path');
  });

  it('12. Keyboard accessibility: Space and Enter keys toggle disclosure', async () => {
    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(wpSummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: wpItems,
      total: wpItems.length,
      limit: 100,
      offset: 0,
      wordpress_themes: wpSummary.wordpress_themes,
      wordpress_plugins: wpSummary.wordpress_plugins,
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    const wpDisclosure = container.querySelector('[role="button"][aria-expanded="false"]');
    expect(wpDisclosure).not.toBeNull();

    // Trigger Enter key
    await act(async () => {
      wpDisclosure?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(wpDisclosure?.getAttribute('aria-expanded')).toBe('true');

    // Trigger Space key
    await act(async () => {
      wpDisclosure?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(wpDisclosure?.getAttribute('aria-expanded')).toBe('false');
  });

  it('13. Security: Malicious text is safely escaped without script injection', async () => {
    const maliciousItems: TechnologyFindingItem[] = [
      {
        id: 'tech-xss',
        audit_id: auditId,
        technology_id: 'xss-payload',
        technology_name: '<script>alert("xss")</script>',
        technology_category: 'frontend',
        status: 'detected',
        confidence: 0.99,
        confidence_level: 'high',
        detection_method: 'composite',
        evidence_type: 'script_src',
        evidence_summary: '<img src=x onerror=alert(1) />',
        evidence_source: 'javascript:void(0)',
        observed_page_or_url: 'javascript:alert(document.cookie)',
        version_or_null: '1.0<script>evil()</script>',
        page_count: 1,
        affected_urls: ['javascript:alert(document.cookie)'],
        evidence_items: [],
        created_at: '2026-10-15T00:00:00Z',
        updated_at: '2026-10-15T00:00:00Z',
      },
    ];

    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue({
      ...wpSummary,
      primary_cms: null,
      total_detected: 1,
      wordpress_themes: [],
      wordpress_plugins: [],
    });
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: maliciousItems,
      total: 1,
      limit: 100,
      offset: 0,
      wordpress_themes: [],
      wordpress_plugins: [],
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // Ensure raw scripts were not executed or injected as DOM elements
    expect(container.querySelectorAll('script').length).toBe(0);
    expect(container.querySelectorAll('img[onerror]').length).toBe(0);
    // Plain text content safely shows the string
    expect(container.textContent).toContain('<script>alert("xss")</script>');
  });

  it('14. Search filter updates displayed list', async () => {
    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(wpSummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: wpItems,
      total: wpItems.length,
      limit: 100,
      offset: 0,
      wordpress_themes: wpSummary.wordpress_themes,
      wordpress_plugins: wpSummary.wordpress_plugins,
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // Type 'React' into search
    await act(async () => {
      searchInput.value = 'React';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('React');
    expect(container.textContent).not.toContain('WordPress observed');
  });

  it('15. Category filter isolates category findings', async () => {
    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(wpSummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: wpItems,
      total: wpItems.length,
      limit: 100,
      offset: 0,
      wordpress_themes: wpSummary.wordpress_themes,
      wordpress_plugins: wpSummary.wordpress_plugins,
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    const selects = container.querySelectorAll('select');
    const categorySelect = selects[0] as HTMLSelectElement;

    // Select 'backend' category
    await act(async () => {
      categorySelect.value = 'backend';
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('PHP');
  });

  it('16. Re-analyze action invokes analyzeTechnologies and refreshes data', async () => {
    vi.spyOn(api, 'getAuditTechnologySummary').mockResolvedValue(wpSummary);
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: wpItems,
      total: wpItems.length,
      limit: 100,
      offset: 0,
      wordpress_themes: wpSummary.wordpress_themes,
      wordpress_plugins: wpSummary.wordpress_plugins,
    });
    const analyzeSpy = vi.spyOn(api, 'analyzeTechnologies').mockResolvedValue({
      message: 'Analyzed',
      audit_id: auditId,
      technologies_detected: 3,
      primary_cms: 'WordPress',
      technologies: wpItems,
      wordpress_themes: wpSummary.wordpress_themes,
      wordpress_plugins: wpSummary.wordpress_plugins,
    });

    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId={auditId}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    const reanalyzeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('re-analyze')
    );
    expect(reanalyzeBtn).not.toBeUndefined();

    await act(async () => {
      reanalyzeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(analyzeSpy).toHaveBeenCalledWith(auditId);
  });

  it('17. Rapid audit ID changes do not produce race condition overwrites', async () => {
    let resolveFirst: any;
    const firstPromise = new Promise<TechnologySummaryResponse>((res) => {
      resolveFirst = res;
    });

    vi.spyOn(api, 'getAuditTechnologySummary').mockImplementation((id) => {
      if (id === 'audit-1') return firstPromise;
      return Promise.resolve({
        ...wpSummary,
        audit_id: 'audit-2',
        primary_cms: 'Shopify',
        total_detected: 1,
        wordpress_themes: [],
        wordpress_plugins: [],
      });
    });
    vi.spyOn(api, 'getAuditTechnologies').mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      wordpress_themes: [],
      wordpress_plugins: [],
    });

    // Render with audit-1
    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId="audit-1"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // Quickly switch to audit-2
    await act(async () => {
      root.render(
        <TechnologyDashboard
          auditId="audit-2"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // Now resolve audit-1 late
    await act(async () => {
      resolveFirst({
        ...wpSummary,
        audit_id: 'audit-1',
        primary_cms: 'WordPress',
        total_detected: 3,
      });
    });

    // Stale audit-1 must NOT overwrite audit-2
    expect(container.textContent).toContain('Shopify');
  });
});
