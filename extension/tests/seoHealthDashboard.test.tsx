import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SeoHealthDashboard } from '../components/audit/SeoHealthDashboard';
import * as api from '../services/api';
import type {
  AuditScorecardData,
  PriorityActionItem,
  PrioritiesResponse,
} from '../types/audit';

// Configure React act environment for jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('SeoHealthDashboard Component Verification', () => {
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

  const baseScorecard: AuditScorecardData = {
    id: 'score-1',
    audit_id: 'audit-123',
    policy_version: '2026.1',
    overall_score: 88.5,
    score_label: 'Good',
    overall_state: 'available',
    on_page_score: 92.0,
    technical_score: 85.0,
    sitewide_score: 84.0,
    pages_evaluated: 15,
    rules_evaluated: 48,
    critical_count: 0,
    high_count: 1,
    medium_count: 2,
    low_count: 1,
    pass_count: 44,
    category_scores: { on_page: 92.0, technical: 85.0, site_wide: 84.0 },
    coverage: {
      coverage_ratio: 0.95,
      coverage_label: 'High',
      pages_crawled: 15,
      pages_eligible: 15,
    },
    explanation: {
      formula: 'Audit Health Score = 0.35 * OnPage + 0.40 * Technical + 0.25 * SiteWide',
      disclaimer: 'Audit Health Score is an internal diagnostic metric.',
    },
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
  };

  const samplePriorities: PriorityActionItem[] = [
    {
      id: 'prio-1',
      audit_id: 'audit-123',
      priority_tier: 'P0',
      priority_rank: 1,
      group_fingerprint: 'fp-p0-1',
      rule_id: 'TECH_HTTP_5XX',
      category: 'technical',
      title: 'Server Error (5xx) Detected',
      description: 'Critical server error encountered on key landing page.',
      recommendation: 'Inspect server logs and resolve uncaught exception.',
      affected_page_count: 1,
      affected_urls: ['https://example.com/checkout'],
      score_impact: 20.0,
      created_at: '2026-10-14T00:00:00Z',
    },
    {
      id: 'prio-2',
      audit_id: 'audit-123',
      priority_tier: 'P1',
      priority_rank: 2,
      group_fingerprint: 'fp-p1-1',
      rule_id: 'ONPAGE_TITLE_MISSING',
      category: 'on_page',
      title: 'Missing Title Tag',
      description: 'Page lacks a document title tag.',
      recommendation: 'Add a descriptive title tag.',
      affected_page_count: 2,
      affected_urls: ['https://example.com/p1', 'https://example.com/p2'],
      score_impact: 10.0,
      created_at: '2026-10-14T00:00:00Z',
    },
  ];

  const samplePrioritiesResponse: PrioritiesResponse = {
    items: samplePriorities,
    total: 2,
    limit: 50,
    offset: 0,
    tier_counts: { P0: 1, P1: 1, P2: 0, P3: 0 },
  };

  it('1. renders Not-Analyzed state when auditId is null', async () => {
    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId={null}
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('No Active Audit Selected');
    expect(container.textContent).toContain('Start or select a Full Website Audit above');
  });

  it('2. renders Null Score and Unrated state correctly', async () => {
    const nullScorecard: AuditScorecardData = {
      ...baseScorecard,
      overall_score: null,
      score_label: 'Unrated',
      overall_state: 'insufficient_evidence',
      on_page_score: null,
      technical_score: null,
      sitewide_score: null,
    };

    vi.spyOn(api, 'getAuditScore').mockResolvedValue(nullScorecard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      tier_counts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    });

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('--');
    expect(container.textContent).toContain('Unrated');
    expect(container.textContent).toContain('Insufficient Evidence');
  });

  it('3. displays Provisional state badge', async () => {
    const provisionalCard: AuditScorecardData = {
      ...baseScorecard,
      overall_state: 'provisional',
      overall_score: 75.0,
      score_label: 'Provisional',
    };

    vi.spyOn(api, 'getAuditScore').mockResolvedValue(provisionalCard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('Provisional');
    expect(container.textContent).toContain('75.0');
  });

  it('4. displays Stale Evidence badge when underlying evidence changed', async () => {
    const staleCard: AuditScorecardData = {
      ...baseScorecard,
      overall_state: 'stale',
    };

    vi.spyOn(api, 'getAuditScore').mockResolvedValue(staleCard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('Stale Evidence');
  });

  it('4b. renders genuinely fresh completed scorecard without Stale Evidence badge', async () => {
    const freshCard: AuditScorecardData = {
      ...baseScorecard,
      overall_score: 51.1,
      overall_state: 'available',
      rules_evaluated: 45,
    };

    vi.spyOn(api, 'getAuditScore').mockResolvedValue(freshCard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-sendroq"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('51.1');
    expect(container.textContent).toContain('45 Rules');
    expect(container.textContent).not.toContain('Stale Evidence');
  });

  it('5. renders category score percentages accurately', async () => {
    vi.spyOn(api, 'getAuditScore').mockResolvedValue(baseScorecard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('On-Page (35%)');
    expect(container.textContent).toContain('92.0%');
    expect(container.textContent).toContain('Technical (40%)');
    expect(container.textContent).toContain('85.0%');
    expect(container.textContent).toContain('Site-Wide (25%)');
    expect(container.textContent).toContain('84.0%');
  });

  it('6. toggles Formula and Disclaimer popup', async () => {
    vi.spyOn(api, 'getAuditScore').mockResolvedValue(baseScorecard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    const formulaBtn = container.querySelector('button[title="View Scoring Formula"]');
    expect(formulaBtn).not.toBeNull();

    await act(async () => {
      formulaBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Audit Health Score Formula & Policy v2.4.0');
    expect(container.textContent).toContain('Diagnostic Disclaimer:');
    expect(container.textContent).toContain('does not predict Google ranking');
  });

  it('7. allows priority tier filtering and expands remediation details', async () => {
    vi.spyOn(api, 'getAuditScore').mockResolvedValue(baseScorecard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    expect(container.textContent).toContain('P0 #1');
    expect(container.textContent).toContain('Server Error (5xx) Detected');
    expect(container.textContent).toContain('P1 #2');
    expect(container.textContent).toContain('Missing Title Tag');

    // Click to expand first item
    const itemHeader = container.querySelector('div[class*="cursor-pointer"]');
    expect(itemHeader).not.toBeNull();

    await act(async () => {
      itemHeader?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Recommended Action:');
    expect(container.textContent).toContain('Inspect server logs and resolve uncaught exception.');
    expect(container.textContent).toContain('https://example.com/checkout');
  });

  it('8. triggers Recalculate with force=true on button click', async () => {
    const recalcSpy = vi.spyOn(api, 'calculateAuditScore').mockResolvedValue(baseScorecard);
    vi.spyOn(api, 'getAuditScore').mockResolvedValue(baseScorecard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // Find Recalculate button
    const buttons = Array.from(container.querySelectorAll('button'));
    const recalcBtn = buttons.find(b => b.textContent?.includes('Recalculate'));
    expect(recalcBtn).toBeDefined();

    await act(async () => {
      recalcBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(recalcSpy).toHaveBeenCalledWith('audit-123', true);
  });

  it('9. disables Recalculate button when backend is offline', async () => {
    vi.spyOn(api, 'getAuditScore').mockResolvedValue(baseScorecard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={false}
          isAuditRunning={false}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const recalcBtn = buttons.find(b => b.textContent?.includes('Recalculate'));
    expect(recalcBtn?.hasAttribute('disabled')).toBe(true);
  });

  it('10. renders cleanly within a narrow side-panel container (360px)', async () => {
    container.style.width = '360px';
    container.style.overflow = 'hidden';

    vi.spyOn(api, 'getAuditScore').mockResolvedValue(baseScorecard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue(samplePrioritiesResponse);

    await act(async () => {
      root.render(
        <div style={{ width: '360px' }}>
          <SeoHealthDashboard
            auditId="audit-123"
            isBackendOnline={true}
            isAuditRunning={false}
          />
        </div>
      );
    });

    expect(container.querySelector('.text-4xl')).not.toBeNull();
    expect(container.textContent).toContain('Audit Health Score');
  });

  it('11. handles API errors gracefully without crashing', async () => {
    vi.spyOn(api, 'getAuditScore').mockRejectedValue(new Error('Network connection timeout'));

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-123"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // When API fails, scorecard is null -> shows unrated/--
    expect(container.textContent).toContain('--');
    expect(container.textContent).toContain('Unrated');
  });

  it('12. displays truthful failure message and suppresses technical conformity statement when crawl fails during storage', async () => {
    vi.spyOn(api, 'getAuditScore').mockResolvedValue(null as any);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      tier_counts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    });

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-failed-crawl"
          isBackendOnline={true}
          isAuditRunning={false}
          auditStatus="failed"
          auditError="CRAWL_STORAGE_ERROR"
          progressJson={{
            pipeline: {
              stages: {
                crawling: { status: 'failed' },
              },
            },
          }}
        />
      );
    });

    // Must display exact expected messaging
    expect(container.textContent).toContain('SEO analysis was not completed.');
    expect(container.textContent).toContain('The crawl failed during page storage.');

    // Must NOT falsely claim website conforms to technical standards
    expect(container.textContent).not.toContain('conforms to verified technical standards');
  });

  it('13. renders "Analysis incomplete or outdated" and suppresses conformity statement when scorecard is stale', async () => {
    const staleScorecard: AuditScorecardData = {
      ...baseScorecard,
      overall_state: 'stale',
      overall_score: null,
      score_label: 'Unrated',
    };
    vi.spyOn(api, 'getAuditScore').mockResolvedValue(staleScorecard);
    vi.spyOn(api, 'getAuditPriorities').mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      tier_counts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    });

    await act(async () => {
      root.render(
        <SeoHealthDashboard
          auditId="audit-stale"
          isBackendOnline={true}
          isAuditRunning={false}
        />
      );
    });

    // Must display truthful incomplete statement instead of positive badge
    expect(container.textContent).toContain('Analysis incomplete or outdated');
    expect(container.textContent).not.toContain('conforms to verified technical standards');
  });
});
