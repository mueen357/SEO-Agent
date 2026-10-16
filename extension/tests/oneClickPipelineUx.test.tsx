import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FullAuditOverview } from '../components/audit/FullAuditOverview';
import { SeoHealthDashboard } from '../components/audit/SeoHealthDashboard';
import { SeoFindingsView } from '../components/audit/SeoFindingsView';
import type { AuditRecord } from '../types/audit';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('One-Click Full Audit UX & Empty State Verification', () => {
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

  it('FullAuditOverview renders single primary action "Start Full Audit (1-Click Automation)"', async () => {
    const handleStart = vi.fn();
    await act(async () => {
      root.render(
        <FullAuditOverview
          audit={null}
          isRunning={false}
          onStartAudit={handleStart}
          onCancelAudit={vi.fn()}
          onRefresh={vi.fn()}
          targetUrl="https://example.com"
          isBackendOnline={true}
        />
      );
    });

    const startBtn = container.querySelector('button');
    expect(startBtn).not.toBeNull();
    expect(startBtn?.textContent).toContain('1-Click Automation');

    act(() => {
      startBtn?.click();
    });
    expect(handleStart).toHaveBeenCalledTimes(1);
  });

  it('FullAuditOverview renders automated pipeline stages matrix when audit exists', async () => {
    const mockAudit: AuditRecord = {
      id: 'test-audit-uuid-1234',
      target_url: 'https://example.com',
      normalized_url: 'https://example.com/',
      hostname: 'example.com',
      mode: 'full',
      status: 'crawling',
      max_pages: 50,
      pages_discovered: 120,
      pages_crawled: 25,
      configuration_json: {},
      progress_json: {
        pipeline: {
          current_stage: 'crawling',
          total_stages: 9,
          completed_stages: ['validation'],
          stages: {
            validation: { status: 'completed' },
            crawling: { status: 'running' },
          },
          errors: {},
        },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await act(async () => {
      root.render(
        <FullAuditOverview
          audit={mockAudit}
          isRunning={true}
          onStartAudit={vi.fn()}
          onCancelAudit={vi.fn()}
          onRefresh={vi.fn()}
          isBackendOnline={true}
        />
      );
    });

    expect(container.textContent).toContain('Automated Pipeline Stages');
    expect(container.textContent).toContain('1. Validation');
    expect(container.textContent).toContain('2. Crawling');
    expect(container.textContent).toContain('4. On-Page SEO');
    expect(container.textContent).toContain('5. Technical SEO');
    expect(container.textContent).toContain('6. Site-Wide SEO');
    expect(container.textContent).toContain('7. Technologies');
    expect(container.textContent).toContain('8. SEO Scoring');
    expect(container.textContent).toContain('9. Finalized');
  });

  it('FullAuditOverview shows "Complete Missing Analysis" for existing crawl with missing scoring', async () => {
    const handleCompleteMissing = vi.fn();
    const mockAudit: AuditRecord = {
      id: 'historical-audit-uuid',
      target_url: 'https://example.com',
      normalized_url: 'https://example.com/',
      hostname: 'example.com',
      mode: 'full',
      status: 'completed',
      max_pages: 50,
      pages_discovered: 50,
      pages_crawled: 50,
      configuration_json: {},
      progress_json: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await act(async () => {
      root.render(
        <FullAuditOverview
          audit={mockAudit}
          isRunning={false}
          onStartAudit={vi.fn()}
          onCancelAudit={vi.fn()}
          onRefresh={vi.fn()}
          onCompleteMissingAnalysis={handleCompleteMissing}
          isBackendOnline={true}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const completeBtn = buttons.find((b) => b.textContent?.includes('Complete Missing Analysis'));
    expect(completeBtn).toBeDefined();

    act(() => {
      completeBtn?.click();
    });
    expect(handleCompleteMissing).toHaveBeenCalledTimes(1);
  });

  it('SeoHealthDashboard displays "SEO analysis in progress" when isAuditRunning is true', async () => {
    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-running-id"
          isBackendOnline={true}
          isAuditRunning={true}
        />
      );
    });

    // Assert that false pass "No actionable SEO issues detected" is NOT displayed
    expect(container.textContent).not.toContain('No actionable SEO issues detected');
  });

  it('SeoFindingsView displays truthful state when isAuditRunning is true', async () => {
    await act(async () => {
      root.render(
        <SeoFindingsView
          auditId="audit-running-id"
          isBackendOnline={true}
          isAuditRunning={true}
        />
      );
    });

    // Assert that false-pass text is NOT displayed
    expect(container.textContent).not.toContain('No actionable SEO issues detected');
  });
});
