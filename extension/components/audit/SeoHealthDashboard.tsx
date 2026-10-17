import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  FileText,
  Activity,
  Sliders,
  Info,
} from 'lucide-react';
import { calculateAuditScore, getAuditScore, getAuditPriorities } from '../../services/api';
import type {
  AuditScorecardData,
  PriorityActionItem,
  PrioritiesResponse,
  PriorityTier,
} from '../../types/audit';

interface SeoHealthDashboardProps {
  auditId: string | null;
  isBackendOnline: boolean;
  isAuditRunning: boolean;
  auditStatus?: string;
  auditError?: string | null;
  progressJson?: any;
  onNavigateToFindings?: () => void;
  onNavigateToPages?: () => void;
}

export function SeoHealthDashboard({
  auditId,
  isBackendOnline,
  isAuditRunning,
  auditStatus,
  auditError,
  progressJson,
  onNavigateToFindings,
  onNavigateToPages,
}: SeoHealthDashboardProps) {
  const [scorecard, setScorecard] = useState<AuditScorecardData | null>(null);
  const [priorities, setPriorities] = useState<PriorityActionItem[]>([]);
  const [tierCounts, setTierCounts] = useState<Record<string, number>>({ P0: 0, P1: 0, P2: 0, P3: 0 });
  const [selectedTier, setSelectedTier] = useState<PriorityTier | 'ALL'>('ALL');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFingerprint, setExpandedFingerprint] = useState<string | null>(null);
  const [showFormulaModal, setShowFormulaModal] = useState(false);

  const loadData = useCallback(async (id: string, forceRecalc: boolean = false) => {
    if (!isBackendOnline) return;
    setError(null);
    try {
      if (forceRecalc) {
        setCalculating(true);
        const card = await calculateAuditScore(id, true);
        setScorecard(card);
      } else {
        setLoading(true);
        const card = await getAuditScore(id);
        setScorecard(card);
      }

      // Fetch priorities
      const prioRes = await getAuditPriorities(id, {
        priority_tier: selectedTier === 'ALL' ? undefined : selectedTier,
        page_size: 50,
      });
      setPriorities(prioRes?.items || []);
      setTierCounts(prioRes?.tier_counts || { P0: 0, P1: 0, P2: 0, P3: 0 });
    } catch (err: any) {
      console.error('Failed to load SEO Health data:', err);
      setError(err.message || 'Unable to load SEO Health Scorecard.');
    } finally {
      setLoading(false);
      setCalculating(false);
    }
  }, [isBackendOnline, selectedTier]);

  useEffect(() => {
    if (auditId) {
      loadData(auditId, false);
    } else {
      setScorecard(null);
      setPriorities([]);
    }
  }, [auditId, loadData]);

  const handleRecalculate = () => {
    if (auditId) {
      loadData(auditId, true);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-slate-500';
    if (score >= 90) return 'text-emerald-400';
    if (score >= 75) return 'text-cyan-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getScoreBg = (score: number | null) => {
    if (score === null) return 'bg-slate-800/60 border-slate-700';
    if (score >= 90) return 'bg-emerald-950/30 border-emerald-800/50';
    if (score >= 75) return 'bg-cyan-950/30 border-cyan-800/50';
    if (score >= 50) return 'bg-amber-950/30 border-amber-800/50';
    return 'bg-rose-950/30 border-rose-800/50';
  };

  const getTierBadge = (tier: PriorityTier) => {
    switch (tier) {
      case 'P0':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'P1':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
      case 'P2':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'P3':
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  if (!auditId) {
    return (
      <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
        <Activity className="w-8 h-8 text-slate-600 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-300">No Active Audit Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Start or select a Full Website Audit above to compute deterministic SEO Health Scores and priority remediation items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. TOP HEADER & OVERALL SCORECARD */}
      <div className={`p-4 rounded-xl border ${getScoreBg(scorecard?.overall_score ?? null)} transition-all space-y-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Audit Health Score</h3>
            {scorecard?.overall_state === 'stale' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Stale Evidence
              </span>
            )}
            {scorecard?.overall_state === 'provisional' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                Provisional
              </span>
            )}
            {scorecard?.overall_state === 'insufficient_evidence' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/40">
                Insufficient Evidence
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFormulaModal(!showFormulaModal)}
              className="px-2 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center space-x-1"
              title="View Scoring Formula"
            >
              <Info className="w-3 h-3 text-cyan-400" />
              <span>Formula</span>
            </button>
            <button
              onClick={handleRecalculate}
              disabled={calculating || isAuditRunning || !isBackendOnline}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center space-x-1 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${calculating ? 'animate-spin' : ''}`} />
              <span>{calculating ? 'Scoring...' : 'Recalculate'}</span>
            </button>
          </div>
        </div>

        {/* Big Score Display */}
        <div className="flex items-baseline space-x-3 pt-1">
          <div className={`text-4xl font-extrabold ${getScoreColor(scorecard?.overall_score ?? null)} tracking-tight`}>
            {scorecard?.overall_score !== null && scorecard?.overall_score !== undefined
              ? scorecard.overall_score.toFixed(1)
              : '--'}
          </div>
          <div className="text-xs text-slate-400 font-medium">
            <span className="text-slate-200 capitalize font-bold">{scorecard?.score_label || 'Unrated'}</span>
            {scorecard?.overall_score !== null && <span className="text-slate-500"> / 100</span>}
          </div>
        </div>

        {/* Category Breakdown Progress Bars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          {/* On-Page */}
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">On-Page (35%)</span>
              <span className="font-semibold text-slate-200">
                {scorecard?.on_page_score !== null && scorecard?.on_page_score !== undefined
                  ? `${scorecard.on_page_score.toFixed(1)}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, scorecard?.on_page_score ?? 0))}%` }}
              />
            </div>
          </div>

          {/* Technical */}
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Technical (40%)</span>
              <span className="font-semibold text-slate-200">
                {scorecard?.technical_score !== null && scorecard?.technical_score !== undefined
                  ? `${scorecard.technical_score.toFixed(1)}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, scorecard?.technical_score ?? 0))}%` }}
              />
            </div>
          </div>

          {/* Site-Wide */}
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Site-Wide (25%)</span>
              <span className="font-semibold text-slate-200">
                {scorecard?.sitewide_score !== null && scorecard?.sitewide_score !== undefined
                  ? `${scorecard.sitewide_score.toFixed(1)}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, scorecard?.sitewide_score ?? 0))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Coverage Summary Pill */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
          <span>
            Evidence Coverage:{' '}
            <strong className="text-slate-200">
              {scorecard?.coverage?.coverage_ratio !== undefined
                ? `${(scorecard.coverage.coverage_ratio * 100).toFixed(0)}% (${scorecard.coverage.coverage_label})`
                : 'Evaluating'}
            </strong>
          </span>
          <span>
            {scorecard?.pages_evaluated ?? 0} Pages Evaluated • {scorecard?.rules_evaluated ?? 0} Rules
          </span>
        </div>
      </div>

      {/* FORMULA & DISCLAIMER POPUP / COLLAPSIBLE */}
      {showFormulaModal && (
        <div className="p-3.5 rounded-xl bg-slate-950 border border-cyan-500/30 text-xs space-y-2 text-slate-300 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <strong className="text-cyan-400 font-semibold">Audit Health Score Formula & Policy v2.4.0</strong>
            <button onClick={() => setShowFormulaModal(false)} className="text-slate-500 hover:text-slate-300">
              ✕
            </button>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The Audit Health Score is an internal technical diagnostic metric calculated as a deterministic weighted composite:
            <code className="block mt-1 p-1 bg-slate-900 rounded font-mono text-cyan-300">
              Overall = 0.35 * OnPage + 0.40 * Technical + 0.25 * SiteWide
            </code>
          </p>
          <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800">
            <strong>Diagnostic Disclaimer:</strong> This score assesses technical hygiene and best practices based on verified crawl evidence. It does not predict Google ranking, traffic, or search engine revenue.
          </div>
        </div>
      )}

      {/* 2. PRIORITIZED REMEDIATION ACTIONS (P0-P3) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
            <span>Priority Remediation Plan</span>
          </h4>

          {/* Tier Filter Pills */}
          <div className="flex items-center space-x-1 text-[11px]">
            {(['ALL', 'P0', 'P1', 'P2', 'P3'] as const).map((tier) => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={`px-2 py-0.5 rounded font-medium transition-all ${
                  selectedTier === tier
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tier} {tier !== 'ALL' && `(${tierCounts[tier] || 0})`}
              </button>
            ))}
          </div>
        </div>

        {/* Priority Items List */}
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-500">Loading priority actions...</div>
        ) : priorities.length === 0 ? (
          <div className="p-6 text-center bg-slate-900/30 border border-slate-800/60 rounded-xl space-y-1">
            {isAuditRunning ? (
              <>
                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
                <div className="text-xs font-semibold text-slate-300">
                  SEO analysis in progress
                </div>
                <div className="text-[11px] text-slate-500">
                  Calculating evidence-based health scores and priority action items...
                </div>
              </>
            ) : (() => {
              const pipeline = (progressJson as any)?.pipeline;
              const stageErrors = pipeline?.errors || {};
              const isCrawlFailed =
                auditStatus === 'failed' &&
                (Boolean(stageErrors.crawling) ||
                  Boolean(stageErrors.storage) ||
                  (Boolean(auditError) &&
                    (auditError!.includes('storage') ||
                      auditError!.includes('crawl') ||
                      auditError!.includes('PAGE_PERSISTENCE_CONFLICT') ||
                      auditError!.includes('CRAWL_STORAGE_ERROR') ||
                      auditError!.includes('IntegrityError'))));

              if (isCrawlFailed) {
                return (
                  <>
                    <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                    <div className="text-xs font-semibold text-slate-200">
                      SEO analysis was not completed.
                    </div>
                    <div className="text-[11px] text-rose-400/90 max-w-sm mx-auto">
                      The crawl failed during page storage.
                    </div>
                  </>
                );
              }

              if (auditStatus === 'failed') {
                return (
                  <>
                    <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto" />
                    <div className="text-xs font-semibold text-slate-200">
                      SEO analysis was not completed.
                    </div>
                    <div className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      {auditError || 'The audit encountered a critical error during execution.'}
                    </div>
                  </>
                );
              }

              if (scorecard?.overall_state === 'not_analyzed' || !scorecard) {
                return (
                  <>
                    <AlertTriangle className="w-6 h-6 text-slate-500 mx-auto" />
                    <div className="text-xs font-semibold text-slate-300">
                      Analysis not completed
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Run the automated audit pipeline to evaluate SEO rules and generate priority recommendations.
                    </div>
                  </>
                );
              }

              if (scorecard?.overall_state === 'insufficient_evidence' || scorecard?.overall_state === 'provisional') {
                return (
                  <>
                    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                    <div className="text-xs font-semibold text-slate-300">
                      {scorecard?.overall_state === 'insufficient_evidence' ? 'Insufficient evidence' : 'Some checks unavailable'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {selectedTier === 'ALL'
                        ? 'No actionable issues found among the completed checks. Crawl budget or coverage limits apply.'
                        : `No ${selectedTier} issues found in current provisional evaluation.`}
                    </div>
                  </>
                );
              }

              if (scorecard?.overall_state === 'stale') {
                return (
                  <>
                    <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                    <div className="text-xs font-semibold text-slate-300">
                      Analysis incomplete or outdated
                    </div>
                    <div className="text-[11px] text-slate-500">
                      SEO analysis was not completed or requires recalculation.
                    </div>
                  </>
                );
              }

              return (
                <>
                  <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                  <div className="text-xs font-semibold text-slate-300">
                    {selectedTier === 'ALL'
                      ? 'No actionable issues found among the completed checks'
                      : `No ${selectedTier} issues found among completed checks.`}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Website conforms to verified technical standards for this tier.
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-2">
            {priorities.map((item) => {
              const isExpanded = expandedFingerprint === item.group_fingerprint;
              return (
                <div
                  key={item.group_fingerprint}
                  className="rounded-lg bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedFingerprint(isExpanded ? null : item.group_fingerprint)}
                    className="p-3 flex items-start justify-between cursor-pointer space-x-2"
                  >
                    <div className="flex items-start space-x-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${getTierBadge(item.priority_tier)}`}>
                        {item.priority_tier} #{item.priority_rank}
                      </span>
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-200 leading-snug">{item.title}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.affected_page_count} page(s) affected • Rule: <code className="text-cyan-300">{item.rule_id}</code>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {item.score_impact > 0 && (
                        <span className="text-[10px] font-mono font-semibold text-rose-400 bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-900/50">
                          -{item.score_impact.toFixed(1)} pts
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Remediation Details */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-800/60 bg-slate-950/50 space-y-2.5 text-xs">
                      <div>
                        <strong className="text-slate-300 block text-[11px] uppercase tracking-wider mb-1">
                          Recommended Action:
                        </strong>
                        <p className="text-slate-400 leading-relaxed text-[11px] bg-slate-900 p-2 rounded border border-slate-800/80">
                          {item.recommendation}
                        </p>
                      </div>

                      {item.affected_urls && item.affected_urls.length > 0 && (
                        <div>
                          <strong className="text-slate-300 block text-[11px] uppercase tracking-wider mb-1">
                            Sample Affected URLs:
                          </strong>
                          <div className="space-y-1 max-h-24 overflow-y-auto no-scrollbar font-mono text-[10px] text-cyan-300">
                            {item.affected_urls.slice(0, 5).map((url, idx) => (
                              <div key={idx} className="truncate p-1 bg-slate-900/80 rounded border border-slate-800">
                                {url}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. NAVIGATION SHORTCUTS */}
      <div className="flex items-center space-x-2 pt-2 border-t border-slate-800/80">
        {onNavigateToFindings && (
          <button
            onClick={onNavigateToFindings}
            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center space-x-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>View All Rule Findings</span>
          </button>
        )}
        {onNavigateToPages && (
          <button
            onClick={onNavigateToPages}
            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center space-x-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>View Crawled Pages</span>
          </button>
        )}
      </div>
    </div>
  );
}
