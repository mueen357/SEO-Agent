import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  RefreshCw,
  Copy,
  ExternalLink,
  CheckCircle2,
  XCircle,
  FileText,
  Network,
  ChevronDown,
  ChevronUp,
  Search,
  Info,
} from 'lucide-react';

import {
  runSitewideAuditAnalysis,
  getSitewideSummary,
  getSitewideDuplicateGroups,
  getSitewideLinkGraph,
} from '../../services/api';
import type {
  SiteWideSummaryResponse,
  SiteFindingGroupItem,
  LinkGraphSummaryResponse,
} from '../../types/audit';

interface SiteWideIntelligenceViewProps {
  auditId: string | null;
  isBackendOnline: boolean;
  isAuditRunning?: boolean;
}

type SectionTab =
  | 'overview'
  | 'content_duplicates'
  | 'metadata_duplicates'
  | 'link_graph'
  | 'canonical'
  | 'limitations';

export function SiteWideIntelligenceView({
  auditId,
  isBackendOnline,
  isAuditRunning = false,
}: SiteWideIntelligenceViewProps) {
  const [activeSection, setActiveSection] = useState<SectionTab>('overview');
  const [summary, setSummary] = useState<SiteWideSummaryResponse | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<SiteFindingGroupItem[]>([]);
  const [linkGraph, setLinkGraph] = useState<LinkGraphSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

  // Link Graph filters
  const [linkFilter, setLinkFilter] = useState<'all' | 'orphans' | 'low_inlinks' | 'sitemap_only'>('all');
  const [urlSearch, setUrlSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!auditId || !isBackendOnline) return;
    setLoading(true);
    setError(null);
    try {
      const [sumRes, groupsRes, graphRes] = await Promise.all([
        getSitewideSummary(auditId).catch(() => null),
        getSitewideDuplicateGroups(auditId, { pageSize: 100 }).catch(() => null),
        getSitewideLinkGraph(auditId).catch(() => null),
      ]);

      if (sumRes) setSummary(sumRes);
      if (groupsRes?.items) setDuplicateGroups(groupsRes.items);
      if (graphRes) setLinkGraph(graphRes);
    } catch (err: any) {
      setError(err?.message || 'Failed to load site-wide intelligence data.');
    } finally {
      setLoading(false);
    }
  }, [auditId, isBackendOnline]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunAnalysis = async () => {
    if (!auditId || !isBackendOnline || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      await runSitewideAuditAnalysis(auditId);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to execute site-wide analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleGroupExpanded = (id: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!auditId) {
    return (
      <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
        <Network className="w-8 h-8 text-slate-600 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-200">No Full Audit Selected</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Start or select a Full Website Audit above to inspect site-wide duplicates and internal link intelligence.
        </p>
      </div>
    );
  }

  // Filter duplicate groups by category
  const exactContentGroups = duplicateGroups.filter(
    (g) => g.group_type === 'exact_duplicate_content' || g.rule_id === 'SITE_CONTENT_DUPLICATE_EXACT'
  );
  const nearContentGroups = duplicateGroups.filter(
    (g) => g.group_type === 'near_duplicate_content' || g.rule_id === 'SITE_CONTENT_DUPLICATE_NEAR'
  );
  const duplicateTitleGroups = duplicateGroups.filter(
    (g) => g.group_type === 'duplicate_title' || g.rule_id === 'SITE_TITLE_DUPLICATE'
  );
  const duplicateMetaDescGroups = duplicateGroups.filter(
    (g) => g.group_type === 'duplicate_meta_description' || g.rule_id === 'SITE_META_DESCRIPTION_DUPLICATE'
  );
  const duplicateH1Groups = duplicateGroups.filter(
    (g) => g.group_type === 'duplicate_h1' || g.rule_id === 'SITE_H1_DUPLICATE'
  );
  const canonicalConflictGroups = duplicateGroups.filter(
    (g) =>
      g.group_type === 'canonical_conflict' ||
      g.rule_id === 'SITE_DUPLICATE_CANONICAL_REVIEW' ||
      g.rule_id === 'SITE_CONTENT_CANONICAL_CONFLICT'
  );

  // Filter link graph nodes
  const filteredNodes = (linkGraph?.nodes || []).filter((node) => {
    if (urlSearch && !node.url.toLowerCase().includes(urlSearch.toLowerCase())) {
      return false;
    }
    if (linkFilter === 'orphans') return node.inbound_internal_count === 0 && !node.is_seed;
    if (linkFilter === 'low_inlinks') return node.inbound_internal_count > 0 && node.inbound_internal_count <= 2;
    if (linkFilter === 'sitemap_only') return node.is_sitemap_only;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Banner & Run Action */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-200">Site-Wide Intelligence & Link Graph</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                13 Site-Wide Rules
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-800/60">
                SimHash 64-bit
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/60">
                Sampled Graph
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cross-page duplicate detection, normalized text hashing, deterministic internal link topology, and canonical consolidation review.
            </p>
          </div>

          <button
            onClick={handleRunAnalysis}
            disabled={analyzing || isAuditRunning || !isBackendOnline}
            className={`flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all shrink-0 ${
              !isBackendOnline
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : analyzing || isAuditRunning
                ? 'bg-cyan-500/50 text-slate-950 cursor-wait'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-95'
            }`}
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing Site-Wide...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>Run Site-Wide Analysis</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-900/60 flex items-start space-x-2 text-xs text-rose-300">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Metrics Bar */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-800/60 text-xs">
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Pages Analyzed</span>
              <span className="text-base font-bold text-slate-200">{summary.pages_analyzed}</span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Exact Duplicates</span>
              <span className={`text-base font-bold ${summary.exact_duplicate_groups_count > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {summary.exact_duplicate_groups_count} groups
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Near Duplicates</span>
              <span className={`text-base font-bold ${summary.near_duplicate_groups_count > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {summary.near_duplicate_groups_count} groups
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Duplicate Meta</span>
              <span className={`text-base font-bold ${summary.duplicate_metadata_groups_count > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {summary.duplicate_metadata_groups_count} groups
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Canonical Reviews</span>
              <span className={`text-base font-bold ${summary.canonical_conflict_groups_count > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {summary.canonical_conflict_groups_count}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Link Graph Nodes</span>
              <span className="text-base font-bold text-cyan-400">{linkGraph?.total_nodes || 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-slate-800">
        <button
          onClick={() => setActiveSection('overview')}
          className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
            activeSection === 'overview'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          Summary & Intelligence
        </button>
        <button
          onClick={() => setActiveSection('content_duplicates')}
          className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeSection === 'content_duplicates'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <span>Duplicate Content</span>
          {(exactContentGroups.length + nearContentGroups.length) > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-950/80 text-rose-300 font-mono border border-rose-800">
              {exactContentGroups.length + nearContentGroups.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSection('metadata_duplicates')}
          className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeSection === 'metadata_duplicates'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <span>Duplicate Metadata</span>
          {(duplicateTitleGroups.length + duplicateMetaDescGroups.length + duplicateH1Groups.length) > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-950/80 text-amber-300 font-mono border border-amber-800">
              {duplicateTitleGroups.length + duplicateMetaDescGroups.length + duplicateH1Groups.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSection('link_graph')}
          className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeSection === 'link_graph'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <span>Internal Link Graph</span>
          {linkGraph && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-950/80 text-cyan-300 font-mono border border-cyan-800">
              {linkGraph.total_nodes}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSection('canonical')}
          className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
            activeSection === 'canonical'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <span>Canonical Consolidation</span>
          {canonicalConflictGroups.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950/80 text-purple-300 font-mono border border-purple-800">
              {canonicalConflictGroups.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSection('limitations')}
          className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
            activeSection === 'limitations'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          Coverage & Caveats
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Duplication Highlights */}
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div className="flex items-center space-x-2">
                <Copy className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Duplicate Content Clusters</h4>
              </div>
              <p className="text-xs text-slate-400">
                Exact duplicates share identical normalized main-content SHA-256 digests. Near-duplicates share SimHash-64 signatures with Hamming distance &le; 3.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                  <span className="text-slate-300">Exact Duplicate Content Groups</span>
                  <span className="font-mono font-semibold text-rose-400">{exactContentGroups.length}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                  <span className="text-slate-300">Near-Duplicate Candidate Groups</span>
                  <span className="font-mono font-semibold text-amber-400">{nearContentGroups.length}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                  <span className="text-slate-300">Duplicate Title Clusters</span>
                  <span className="font-mono font-semibold text-slate-300">{duplicateTitleGroups.length}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                  <span className="text-slate-300">Duplicate Description Clusters</span>
                  <span className="font-mono font-semibold text-slate-300">{duplicateMetaDescGroups.length}</span>
                </div>
              </div>
            </div>

            {/* Link Graph Highlights */}
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div className="flex items-center space-x-2">
                <Network className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Internal Link Topology</h4>
              </div>
              <p className="text-xs text-slate-400">
                Calculated strictly from observed in-scope HTTP crawl links. Demonstrates discovered reachability and crawl depth.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                  <span className="text-slate-300">Total Internal Link Edges</span>
                  <span className="font-mono font-semibold text-cyan-400">{linkGraph?.total_internal_edges || 0}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                  <span className="text-slate-300">No Observed Inlinks (Orphan Candidates)</span>
                  <span className={`font-mono font-semibold ${(linkGraph?.orphan_count || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {linkGraph?.orphan_count || 0}
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                  <span className="text-slate-300">Low Inlink Coverage (&le; 2 links)</span>
                  <span className="font-mono font-semibold text-slate-300">{linkGraph?.low_inlink_count || 0}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                  <span className="text-slate-300">Links to Confirmed 4xx/5xx</span>
                  <span className={`font-mono font-semibold ${(linkGraph?.broken_link_destinations || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {linkGraph?.broken_link_destinations || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONTENT DUPLICATES */}
      {activeSection === 'content_duplicates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Showing exact and near duplicate main-content clusters ({exactContentGroups.length + nearContentGroups.length} total)
            </span>
          </div>

          {exactContentGroups.length === 0 && nearContentGroups.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-900/30 border border-slate-800 text-center space-y-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
              <h4 className="text-xs font-semibold text-slate-200">No Duplicate Content Detected</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                All audited pages feature unique normalized main text or insufficient length for similarity comparison.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...exactContentGroups, ...nearContentGroups].map((group) => {
                const isExact = group.group_type === 'exact_duplicate_content' || group.rule_id === 'SITE_CONTENT_DUPLICATE_EXACT';
                const isExpanded = expandedGroupIds.has(group.id);
                return (
                  <div
                    key={group.id}
                    className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                              isExact
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                                : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {isExact ? 'Exact Duplicate Content' : 'Near-Duplicate Candidate'}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {group.affected_urls.length} Affected URLs
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium">
                          {isExact
                            ? 'Pages share identical normalized primary content SHA-256 hash.'
                            : `High similarity candidate (Hamming distance ${group.evidence?.hamming_distance ?? '<= 3'}, SimHash metric ${((group.evidence?.simhash_similarity || 0.95) * 100).toFixed(1)}%).`}
                        </p>
                      </div>

                      <button
                        onClick={() => toggleGroupExpanded(group.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* URLs List */}
                    <div className="space-y-1.5 bg-slate-950/70 p-3 rounded-lg border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Affected Pages</span>
                      {group.affected_urls.map((url, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-400 hover:underline truncate max-w-md flex items-center gap-1.5 font-mono text-[11px]"
                          >
                            <span>{url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                          </a>
                        </div>
                      ))}
                    </div>

                    {/* Evidence & Technical Details (Expanded) */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-slate-800/60 text-xs space-y-2 text-slate-400 font-mono text-[11px]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="text-slate-500 block text-[10px]">Group Fingerprint:</span>
                            <span className="text-slate-300 break-all">{group.group_fingerprint}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">Evidence Source:</span>
                            <span className="text-slate-300">{group.evidence?.evidence_source || 'normalized_main_text'}</span>
                          </div>
                        </div>
                        {group.evidence?.sha256 && (
                          <div>
                            <span className="text-slate-500 block text-[10px]">Normalized Content SHA-256:</span>
                            <span className="text-slate-300 break-all">{group.evidence.sha256}</span>
                          </div>
                        )}
                        {group.evidence?.recommended_action && (
                          <div className="p-2 rounded bg-slate-950/90 border border-slate-800 text-slate-300 text-xs font-sans">
                            <span className="font-semibold text-cyan-400 block mb-0.5">Recommended Action:</span>
                            {group.evidence.recommended_action}
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
      )}

      {/* TAB 3: METADATA DUPLICATES */}
      {activeSection === 'metadata_duplicates' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {/* Duplicate Titles */}
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Duplicate Title Tags ({duplicateTitleGroups.length} Groups)
                  </h4>
                </div>
              </div>

              {duplicateTitleGroups.length === 0 ? (
                <p className="text-xs text-slate-400">No duplicate title tags observed across distinct crawled pages.</p>
              ) : (
                <div className="space-y-3">
                  {duplicateTitleGroups.map((group) => (
                    <div key={group.id} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-semibold truncate max-w-md">
                          "{group.evidence?.raw_title || group.evidence?.normalized_title || 'Repeated Title'}"
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/60">
                          {group.affected_urls.length} pages
                        </span>
                      </div>
                      <div className="space-y-1">
                        {group.affected_urls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-400 hover:underline block truncate font-mono text-[11px]"
                          >
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Duplicate Meta Descriptions */}
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Duplicate Meta Descriptions ({duplicateMetaDescGroups.length} Groups)
                  </h4>
                </div>
              </div>

              {duplicateMetaDescGroups.length === 0 ? (
                <p className="text-xs text-slate-400">No duplicate meta descriptions observed across distinct crawled pages.</p>
              ) : (
                <div className="space-y-3">
                  {duplicateMetaDescGroups.map((group) => (
                    <div key={group.id} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-semibold truncate max-w-md">
                          "{group.evidence?.raw_description || group.evidence?.normalized_description || 'Repeated Meta Description'}"
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/60">
                          {group.affected_urls.length} pages
                        </span>
                      </div>
                      <div className="space-y-1">
                        {group.affected_urls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-400 hover:underline block truncate font-mono text-[11px]"
                          >
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Duplicate H1s */}
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Duplicate H1 Headings ({duplicateH1Groups.length} Groups)
                  </h4>
                </div>
              </div>

              {duplicateH1Groups.length === 0 ? (
                <p className="text-xs text-slate-400">No duplicate primary H1 headings observed across distinct crawled pages.</p>
              ) : (
                <div className="space-y-3">
                  {duplicateH1Groups.map((group) => (
                    <div key={group.id} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-semibold truncate max-w-md">
                          "{group.evidence?.raw_h1 || group.evidence?.normalized_h1 || 'Repeated H1'}"
                        </span>
                        <span className="text-[10px] font-mono text-slate-300 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                          {group.affected_urls.length} pages
                        </span>
                      </div>
                      <div className="space-y-1">
                        {group.affected_urls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-400 hover:underline block truncate font-mono text-[11px]"
                          >
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: INTERNAL LINK GRAPH */}
      {activeSection === 'link_graph' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <button
                onClick={() => setLinkFilter('all')}
                className={`px-2.5 py-1 rounded text-xs transition-all ${
                  linkFilter === 'all'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950'
                }`}
              >
                All Pages ({linkGraph?.nodes.length || 0})
              </button>
              <button
                onClick={() => setLinkFilter('orphans')}
                className={`px-2.5 py-1 rounded text-xs transition-all ${
                  linkFilter === 'orphans'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950'
                }`}
              >
                No Inlinks ({linkGraph?.orphan_count || 0})
              </button>
              <button
                onClick={() => setLinkFilter('low_inlinks')}
                className={`px-2.5 py-1 rounded text-xs transition-all ${
                  linkFilter === 'low_inlinks'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950'
                }`}
              >
                Low Coverage ({linkGraph?.low_inlink_count || 0})
              </button>
              <button
                onClick={() => setLinkFilter('sitemap_only')}
                className={`px-2.5 py-1 rounded text-xs transition-all ${
                  linkFilter === 'sitemap_only'
                    ? 'bg-purple-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-950'
                }`}
              >
                Sitemap Only ({linkGraph?.sitemap_only_count || 0})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter URL..."
                value={urlSearch}
                onChange={(e) => setUrlSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Graph Table */}
          <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950/80 sticky top-0 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <tr>
                    <th className="p-3">Page URL</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Inlinks</th>
                    <th className="p-3 text-center">Outlinks</th>
                    <th className="p-3 text-center">Crawl Depth</th>
                    <th className="p-3">Discovery Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {filteredNodes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                        No pages match the active filter.
                      </td>
                    </tr>
                  ) : (
                    filteredNodes.map((node, i) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 max-w-xs truncate">
                          <a
                            href={node.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-400 hover:underline flex items-center gap-1.5"
                          >
                            <span className="truncate">{node.url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                          </a>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono ${
                              node.http_status === 200
                                ? 'bg-emerald-950 text-emerald-300'
                                : (node.http_status || 0) >= 400
                                ? 'bg-rose-950 text-rose-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {node.http_status ?? '---'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`font-bold ${
                              node.inbound_internal_count === 0 && !node.is_seed
                                ? 'text-amber-400'
                                : 'text-slate-200'
                            }`}
                          >
                            {node.inbound_internal_count}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-400">{node.outbound_internal_count}</td>
                        <td className="p-3 text-center text-slate-400">{node.crawl_depth}</td>
                        <td className="p-3 font-sans">
                          {node.is_seed && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] mr-1">
                              Seed
                            </span>
                          )}
                          {node.is_sitemap_only && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px]">
                              Sitemap Only
                            </span>
                          )}
                          {!node.is_seed && !node.is_sitemap_only && (
                            <span className="text-slate-500 text-[10px]">Hyperlink Crawled</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CANONICAL CONSOLIDATION */}
      {activeSection === 'canonical' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Canonical Consolidation Signals
            </h4>
            <p className="text-xs text-slate-400">
              Evaluates whether duplicate or near-duplicate pages express matching canonical preferences, conflicting self-referencing canonicals, or point to unobserved targets.
            </p>
          </div>

          {canonicalConflictGroups.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-900/30 border border-slate-800 text-center space-y-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
              <h4 className="text-xs font-semibold text-slate-200">No Canonical Conflicts Detected</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                All duplicate content groups express consistent or intentional canonical targets.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {canonicalConflictGroups.map((group) => (
                <div key={group.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-mono text-[10px]">
                      {group.rule_id}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">{group.affected_urls.length} Pages</span>
                  </div>
                  <p className="text-slate-300 font-medium">
                    {group.evidence?.message || 'Conflicting or divergent canonical tags observed across equivalent content.'}
                  </p>
                  <div className="p-3 rounded bg-slate-950/80 border border-slate-800 space-y-1">
                    {group.affected_urls.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline block truncate font-mono text-[11px]">
                        {u}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: COVERAGE & LIMITATIONS */}
      {activeSection === 'limitations' && (
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3 text-xs text-slate-300">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Deterministic Evidence & Audit Limitations
            </h4>
          </div>
          <div className="space-y-2.5 leading-relaxed text-slate-400">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-200 font-semibold block mb-0.5">Sampled Crawl Caveat:</span>
              A limited crawl sample cannot prove that a page has zero inbound links across the entire domain. An absence of inbound links in our crawl graph indicates only that no link was observed within the sampled pages and seed path.
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-200 font-semibold block mb-0.5">Exact vs. Near-Duplicate Matching:</span>
              Exact duplicate content is identified when normalized main-body text produces identical SHA-256 digests. Near-duplicate groups are computed via 64-bit SimHash with a conservative threshold of Hamming distance &le; 3 with comparable content lengths. SimHash indicates similarity candidates, not guaranteed semantic identity.
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-200 font-semibold block mb-0.5">Declared Canonical Preferences:</span>
              All canonical findings represent declared HTML link rel="canonical" hints. They do not claim or predict Google's selected canonical URL, as Google uses external signals in addition to declared hints.
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <span className="text-slate-200 font-semibold block mb-0.5">Zero External AI / Zero Hallucinations:</span>
              All metrics, groups, and assessments are derived purely from stored database records without external LLM calls or fictional SEO scores.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
