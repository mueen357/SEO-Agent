import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateAuditScore,
  getAuditScore,
  getAuditScoreBreakdown,
  getAuditScoreCoverage,
  getAuditPriorities,
} from '../services/api';
import type {
  AuditScorecardData,
  ScoreBreakdownData,
  ScoreCoverageData,
  PrioritiesResponse,
} from '../types/audit';

describe('Audit Health Scoring & Prioritization API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockScorecard: AuditScorecardData = {
    id: 'score-1111-2222',
    audit_id: 'audit-1111-2222',
    policy_version: '2026.1',
    overall_score: 87.5,
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
    category_scores: {
      on_page: 92.0,
      technical: 85.0,
      site_wide: 84.0,
    },
    coverage: {
      pages_crawled: 15,
      pages_eligible: 15,
      pages_failed: 0,
      total_findings: 4,
      unknown_findings_count: 0,
      state: 'available',
      evaluated_rule_count: 48,
    },
    explanation: {
      formula: 'Audit Health Score = 0.35 * OnPage + 0.40 * Technical + 0.25 * SiteWide',
      top_deductions: [
        {
          rule_id: 'tech_broken_internal_links',
          category: 'technical',
          impact_score: 15.0,
          description: 'Detected 2 broken internal links',
        },
      ],
      disclaimer: 'Audit Health Score is an internal diagnostic score, not an official Google ranking score.',
    },
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
  };

  it('calculateAuditScore posts to /api/v1/audits/{id}/score', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockScorecard,
    } as any);

    const res = await calculateAuditScore('audit-1111-2222', true);
    expect(res).toEqual(mockScorecard);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/audits/audit-1111-2222/score?force=true'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('getAuditScore fetches /api/v1/audits/{id}/score', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockScorecard,
    } as any);

    const res = await getAuditScore('audit-1111-2222');
    expect(res).toEqual(mockScorecard);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/audits/audit-1111-2222/score'),
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('getAuditScoreBreakdown fetches rule-level breakdown', async () => {
    const mockBreakdown: ScoreBreakdownData = {
      audit_id: 'audit-1111-2222',
      overall_score: 87.5,
      overall_state: 'available',
      score_label: 'Good',
      category_scores: { on_page: 92.0, technical: 85.0, site_wide: 84.0 },
      top_deductions: [
        {
          category: 'technical',
          rule_id: 'tech_broken_internal_links',
          points_lost: 15.0,
          raw_deduction: 15.0,
          fail_count: 2,
          warn_count: 0,
        },
      ],
      formula: 'Audit Health Score = 0.35 * OnPage + 0.40 * Technical + 0.25 * SiteWide',
      disclaimer: 'Audit Health Score is an internal diagnostic score, not an official Google ranking score.',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBreakdown,
    } as any);

    const res = await getAuditScoreBreakdown('audit-1111-2222');
    expect(res.overall_score).toBe(87.5);
    expect(res.top_deductions[0]?.rule_id).toBe('tech_broken_internal_links');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/audits/audit-1111-2222/score/breakdown'),
      expect.any(Object)
    );
  });

  it('getAuditScoreCoverage fetches evidence coverage details', async () => {
    const mockCoverage: ScoreCoverageData = {
      audit_id: 'audit-1111-2222',
      score_state: 'available',
      coverage_ratio: 1.0,
      coverage_label: 'Complete',
      total_pages_crawled: 15,
      pages_evaluated: 15,
      pages_failed: 0,
      rule_evaluations_total: 48,
      rule_family_completion: { on_page: 1.0, technical: 1.0, site_wide: 1.0 },
      has_rendering_evidence: true,
      crawl_limit_hit: false,
      details: {},
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCoverage,
    } as any);

    const res = await getAuditScoreCoverage('audit-1111-2222');
    expect(res.coverage_ratio).toBe(1.0);
    expect(res.score_state).toBe('available');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/audits/audit-1111-2222/score/coverage'),
      expect.any(Object)
    );
  });

  it('getAuditPriorities fetches prioritized remediation action items with query params', async () => {
    const mockPriorities: PrioritiesResponse = {
      total: 2,
      limit: 10,
      offset: 0,
      tier_counts: { P0: 1, P1: 1, P2: 0, P3: 0 },
      items: [
        {
          id: 'pri-1',
          audit_id: 'audit-1111-2222',
          scorecard_id: 'score-1',
          priority_tier: 'P0',
          priority_rank: 1,
          group_fingerprint: 'fp-123',
          rule_id: 'tech_broken_internal_links',
          category: 'technical',
          title: 'Internal Broken Links (HTTP 404)',
          description: '2 internal link(s) point to non-existent URLs.',
          recommendation: 'Update broken references.',
          affected_page_count: 2,
          affected_urls: ['/page1', '/page2'],
          score_impact: 15.0,
          created_at: '2026-10-14T00:00:00Z',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPriorities,
    } as any);

    const res = await getAuditPriorities('audit-1111-2222', { priority_tier: 'P0', page_size: 10 });
    expect(res.total).toBe(2);
    expect(res.items[0]?.priority_tier).toBe('P0');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/audits\/audit-1111-2222\/priorities\?.*priority_tier=P0/),
      expect.any(Object)
    );
  });

  it('throws helpful error when backend returns failure response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Audit not found or no rule assessments completed' }),
    } as any);

    await expect(calculateAuditScore('non-existent-id')).rejects.toThrow(
      'Audit not found or no rule assessments completed'
    );
  });
});
