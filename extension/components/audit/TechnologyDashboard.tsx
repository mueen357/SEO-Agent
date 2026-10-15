import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Cpu,
  Layers,
  Globe,
  Server,
  Code,
  Puzzle,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  ShieldAlert,
  Info,
  Clock,
  Check,
  X,
  Palette,
} from 'lucide-react';

import {
  analyzeTechnologies,
  getAuditTechnologies,
  getAuditTechnologySummary,
} from '../../services/api';
import type {
  TechnologyFindingItem,
  TechnologySummaryResponse,
  TechnologyListResponse,
  WordPressThemeItem,
  WordPressPluginItem,
} from '../../types/audit';

interface TechnologyDashboardProps {
  auditId: string | null;
  isBackendOnline: boolean;
  isAuditRunning: boolean;
  onSwitchToFullAudit?: () => void;
}

type CategoryFilter = 'ALL' | 'cms' | 'frontend' | 'backend';
type StatusFilter = 'ALL' | 'detected' | 'possible' | 'unknown';
type ConfidenceFilter = 'ALL' | 'high' | 'medium' | 'low';

export function TechnologyDashboard({
  auditId,
  isBackendOnline,
  isAuditRunning,
  onSwitchToFullAudit,
}: TechnologyDashboardProps) {
  // Data state
  const [summary, setSummary] = useState<TechnologySummaryResponse | null>(null);
  const [technologies, setTechnologies] = useState<TechnologyFindingItem[]>([]);
  const [themes, setThemes] = useState<WordPressThemeItem[]>([]);
  const [plugins, setPlugins] = useState<WordPressPluginItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [notAnalyzed, setNotAnalyzed] = useState<boolean>(false);
  const [insufficientEvidence, setInsufficientEvidence] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filtering state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('ALL');
  const [selectedConfidence, setSelectedConfidence] = useState<ConfidenceFilter>('ALL');
  const [activeSection, setActiveSection] = useState<'all' | 'cms' | 'frontend' | 'backend' | 'wordpress'>('all');

  // Disclosure state for expanded evidence
  const [expandedTechIds, setExpandedTechIds] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  // Race condition protection
  const activeAuditRef = useRef<string | null>(auditId);
  useEffect(() => {
    activeAuditRef.current = auditId;
  }, [auditId]);

  // Load technology summary & findings
  const loadData = useCallback(async (id: string) => {
    if (!isBackendOnline) return;
    setError(null);
    setNotAnalyzed(false);
    setInsufficientEvidence(false);
    setLoading(true);

    try {
      // 1. Fetch Summary
      let summaryData: TechnologySummaryResponse | null = null;
      try {
        summaryData = await getAuditTechnologySummary(id);
        if (activeAuditRef.current !== id) return;
        setSummary(summaryData);
        setThemes(summaryData.wordpress_themes || []);
        setPlugins(summaryData.wordpress_plugins || []);
      } catch (err: any) {
        if (activeAuditRef.current !== id) return;
        const msg = String(err.message || '');
        if (msg.includes('404') || msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('not been performed')) {
          setNotAnalyzed(true);
          setSummary(null);
          setTechnologies([]);
          setThemes([]);
          setPlugins([]);
          return;
        }
        throw err;
      }

      // 2. Fetch Findings List
      const listRes: TechnologyListResponse = await getAuditTechnologies(id, {
        page: 1,
        page_size: 100,
      });

      if (activeAuditRef.current !== id) return;
      setTechnologies(listRes.items || []);
      setTotalCount(listRes.total || (listRes.items ? listRes.items.length : 0));

      if (summaryData && listRes.items.length === 0 && (summaryData.wordpress_themes?.length || 0) === 0) {
        // Zero technologies found
      }
    } catch (err: any) {
      if (activeAuditRef.current !== id) return;
      console.error('Failed to load technology data:', err);
      const msg = String(err.message || '');
      if (msg.includes('0 crawled pages') || msg.includes('no crawled pages')) {
        setInsufficientEvidence(true);
      } else {
        setError(err.message || 'Unable to load website technology detection results.');
      }
    } finally {
      if (activeAuditRef.current === id) {
        setLoading(false);
      }
    }
  }, [isBackendOnline]);

  useEffect(() => {
    if (auditId) {
      loadData(auditId);
    } else {
      setSummary(null);
      setTechnologies([]);
      setThemes([]);
      setPlugins([]);
      setNotAnalyzed(false);
      setInsufficientEvidence(false);
      setError(null);
    }
  }, [auditId, loadData]);

  // Handle re-analyze / initial analyze action
  const handleAnalyze = async () => {
    if (!auditId || analyzing || !isBackendOnline) return;
    setAnalyzing(true);
    setError(null);
    setNotAnalyzed(false);
    setInsufficientEvidence(false);

    try {
      await analyzeTechnologies(auditId);
      if (activeAuditRef.current === auditId) {
        await loadData(auditId);
      }
    } catch (err: any) {
      if (activeAuditRef.current === auditId) {
        console.error('Technology analysis error:', err);
        const msg = String(err.message || '');
        if (msg.includes('0 crawled pages') || msg.includes('no crawled pages')) {
          setInsufficientEvidence(true);
        } else {
          setError(err.message || 'Failed to execute technology analysis.');
        }
      }
    } finally {
      if (activeAuditRef.current === auditId) {
        setAnalyzing(false);
      }
    }
  };

  const toggleExpand = (techId: string) => {
    setExpandedTechIds((prev) => {
      const next = new Set(prev);
      if (next.has(techId)) {
        next.delete(techId);
      } else {
        next.add(techId);
      }
      return next;
    });
  };

  // Filtered technology list
  const filteredTechnologies = useMemo(() => {
    return technologies.filter((item) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.technology_name.toLowerCase().includes(q);
        const matchCat = item.technology_category.toLowerCase().includes(q);
        const matchSummary = item.evidence_summary.toLowerCase().includes(q);
        if (!matchName && !matchCat && !matchSummary) return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && item.technology_category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL' && item.status !== selectedStatus) {
        return false;
      }

      // Confidence level filter
      if (selectedConfidence !== 'ALL' && item.confidence_level !== selectedConfidence) {
        return false;
      }

      // Section tab filter
      if (activeSection === 'cms' && item.technology_category !== 'cms') return false;
      if (activeSection === 'frontend' && item.technology_category !== 'frontend') return false;
      if (activeSection === 'backend' && item.technology_category !== 'backend') return false;

      return true;
    });
  }, [technologies, searchQuery, selectedCategory, selectedStatus, selectedConfidence, activeSection]);

  // Paginated slice
  const paginatedTechnologies = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTechnologies.slice(start, start + pageSize);
  }, [filteredTechnologies, currentPage]);

  const totalPages = Math.ceil(filteredTechnologies.length / pageSize) || 1;

  // Clear filters
  const hasActiveFilters = searchQuery !== '' || selectedCategory !== 'ALL' || selectedStatus !== 'ALL' || selectedConfidence !== 'ALL';
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('ALL');
    setSelectedStatus('ALL');
    setSelectedConfidence('ALL');
    setCurrentPage(1);
  };

  // Status helper badges
  const renderStatusBadge = (status: 'detected' | 'possible' | 'unknown') => {
    switch (status) {
      case 'detected':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Detected
          </span>
        );
      case 'possible':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <HelpCircle className="w-3 h-3 mr-1" />
            Possible
          </span>
        );
      case 'unknown':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-700/40 text-slate-400 border border-slate-700">
            Unknown
          </span>
        );
    }
  };

  const renderConfidenceBadge = (confidence: number, level: 'high' | 'medium' | 'low') => {
    const pct = Math.round(confidence * 100);
    let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
    if (level === 'high') colorClass = 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40';
    else if (level === 'medium') colorClass = 'bg-cyan-950/40 text-cyan-300 border-cyan-800/40';
    else colorClass = 'bg-amber-950/40 text-amber-300 border-amber-800/40';

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${colorClass}`}>
        {pct}% ({level})
      </span>
    );
  };

  // Safe string escaper for URL display
  const truncateSafe = (str: string, maxLen: number = 60) => {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
  };

  // ==========================================
  // STATE 1: NO AUDIT SELECTED
  // ==========================================
  if (!auditId) {
    return (
      <div className="p-8 text-center bg-slate-900/60 border border-slate-800/80 rounded-xl m-4">
        <div className="inline-flex p-3 rounded-xl bg-slate-800/60 text-slate-400 mb-3 border border-slate-700/60">
          <Cpu className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">No Full Website Audit Selected</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
          Technology and CMS fingerprinting is executed across crawled pages in Full Website Audit mode.
        </p>
        {onSwitchToFullAudit && (
          <button
            onClick={onSwitchToFullAudit}
            className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors shadow-sm shadow-cyan-500/20"
          >
            Switch to Full Website Audit
          </button>
        )}
      </div>
    );
  }

  // ==========================================
  // STATE 2: BACKEND OFFLINE
  // ==========================================
  if (!isBackendOnline) {
    return (
      <div className="p-6 bg-red-950/20 border border-red-900/40 rounded-xl m-4 text-center">
        <AlertCircle className="w-7 h-7 text-red-400 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-red-200 mb-1">Backend Service Offline</h3>
        <p className="text-xs text-red-300/80 max-w-sm mx-auto">
          The FastAPI audit service is currently unreachable. Please ensure the local backend server is running at http://127.0.0.1:8000.
        </p>
      </div>
    );
  }

  // ==========================================
  // STATE 3: AUDIT CURRENTLY RUNNING
  // ==========================================
  if (isAuditRunning) {
    return (
      <div className="p-8 text-center bg-slate-900/60 border border-slate-800/80 rounded-xl m-4">
        <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Full Audit Crawl In Progress</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          The crawler is collecting pages and response headers. Technology detection will analyze observable assets once pages are indexed.
        </p>
      </div>
    );
  }

  // ==========================================
  // STATE 4: INSUFFICIENT EVIDENCE (0 PAGES CRAWLED)
  // ==========================================
  if (insufficientEvidence) {
    return (
      <div className="p-6 bg-amber-950/20 border border-amber-900/40 rounded-xl m-4 text-center">
        <Info className="w-7 h-7 text-amber-400 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-amber-200 mb-1">Insufficient Crawl Evidence</h3>
        <p className="text-xs text-amber-300/80 max-w-sm mx-auto mb-4">
          This audit has 0 crawled pages. Passive technology fingerprinting requires crawled HTML or HTTP response headers to identify technologies honestly.
        </p>
        <button
          onClick={() => loadData(auditId)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          <span>Check for Crawled Pages</span>
        </button>
      </div>
    );
  }

  // ==========================================
  // STATE 5: AUDIT NOT ANALYZED YET (404 SUMMARY)
  // ==========================================
  if (notAnalyzed) {
    return (
      <div className="p-8 text-center bg-slate-900/60 border border-slate-800/80 rounded-xl m-4">
        <div className="inline-flex p-3 rounded-xl bg-cyan-950/40 text-cyan-400 mb-3 border border-cyan-800/40">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Technology Analysis Not Run Yet</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
          Crawl evidence is available for this audit. Run passive technology detection to identify the CMS, frontend libraries, backend runtimes, and active plugins.
        </p>
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all ${
            analyzing
              ? 'bg-cyan-500/50 text-slate-950 cursor-wait'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-95'
          }`}
        >
          {analyzing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
              <span>Analyzing Technologies...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              <span>Run Technology Analysis</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // ==========================================
  // STATE 6: LOADING / ANALYZING SPINNER
  // ==========================================
  if (loading && !summary) {
    return (
      <div className="p-12 text-center">
        <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-400">Loading technology detection results...</p>
      </div>
    );
  }

  // ==========================================
  // STATE 7: API ERROR
  // ==========================================
  if (error && !summary) {
    return (
      <div className="p-6 bg-red-950/20 border border-red-900/40 rounded-xl m-4 text-center">
        <AlertCircle className="w-7 h-7 text-red-400 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-red-200 mb-1">Technology Detection Error</h3>
        <p className="text-xs text-red-300/80 max-w-sm mx-auto mb-4">{error}</p>
        <button
          onClick={() => loadData(auditId)}
          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  // Primary CMS helper
  const detectedCmsFinding = technologies.find((t) => t.technology_category === 'cms' && t.status === 'detected');
  const primaryCmsName = summary?.primary_cms || detectedCmsFinding?.technology_name || 'None / Unknown';
  const hasCms = Boolean(summary?.primary_cms || detectedCmsFinding);
  const primaryCmsStatus = detectedCmsFinding ? detectedCmsFinding.status : (hasCms ? 'detected' : 'unknown');

  // Distribution counts
  const highConfCount = summary?.confidence_distribution?.high || 0;
  const medConfCount = summary?.confidence_distribution?.medium || 0;
  const lowConfCount = summary?.confidence_distribution?.low || 0;

  return (
    <div className="p-4 space-y-4">
      {/* ERROR BANNER IF REFRESH FAILED */}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg flex items-center justify-between text-xs text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ACTION BAR */}
      <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-cyan-950/60 border border-cyan-800/40 rounded-lg text-cyan-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-slate-200">Technology & CMS Stack</h2>
            <p className="text-[11px] text-slate-400">Deterministic passive fingerprinting from crawl evidence</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => loadData(auditId)}
            disabled={loading || analyzing}
            title="Refresh technology findings"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleAnalyze}
            disabled={analyzing || loading}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all ${
              analyzing
                ? 'bg-cyan-500/50 text-slate-950 cursor-wait'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-95'
            }`}
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                <span>Re-analyzing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                <span>Re-analyze</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* SECTION A: TECHNOLOGY OVERVIEW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Card 1: Primary CMS */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
            <span>Primary CMS</span>
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-sm font-bold text-slate-100 truncate" title={primaryCmsName}>
            {primaryCmsName}
          </div>
          <div className="mt-1 flex items-center space-x-1">
            {renderStatusBadge(primaryCmsStatus as any)}
          </div>
        </div>

        {/* Card 2: Total Detected */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
            <span>Technologies</span>
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-sm font-bold text-slate-100">
            {summary?.total_detected ?? technologies.length} Technologies
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center space-x-1.5">
            <span className="text-emerald-400 font-semibold">{summary?.detected_technologies_count || 0} detected</span>
            <span>•</span>
            <span className="text-amber-400">{summary?.possible_technologies_count || 0} possible</span>
          </div>
        </div>

        {/* Card 3: Confidence Distribution */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
            <span>Confidence Tier</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="flex items-center space-x-1.5 mt-1 text-xs">
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 font-semibold border border-emerald-800/40" title="High confidence (>= 85%)">
              {highConfCount} High
            </span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 font-medium border border-cyan-800/40" title="Medium confidence (50-84%)">
              {medConfCount} Med
            </span>
            {lowConfCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 font-medium border border-amber-800/40" title="Low confidence (< 50%)">
                {lowConfCount} Low
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-slate-500">Threshold: Detected $\ge$ 70%</div>
        </div>

        {/* Card 4: WordPress Assets Summary */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
            <span>WP Components</span>
            <Puzzle className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-sm font-bold text-slate-100">
            {themes.length} {themes.length === 1 ? 'Theme' : 'Themes'} / {plugins.length} {plugins.length === 1 ? 'Plugin' : 'Plugins'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            {themes.length > 0 && themes[0] ? (
              <span className="text-cyan-400 font-medium">{themes[0].name || themes[0].slug} ({themes[0].status})</span>
            ) : (
              <span className="text-slate-500">No WP assets observed</span>
            )}
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS FOR SUB-SECTIONS */}
      <div className="flex items-center space-x-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSection('all')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeSection === 'all'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          All Stack ({technologies.length})
        </button>

        <button
          onClick={() => setActiveSection('cms')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeSection === 'cms'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          CMS & Builders
        </button>

        <button
          onClick={() => setActiveSection('frontend')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeSection === 'frontend'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          Frontend Frameworks
        </button>

        <button
          onClick={() => setActiveSection('backend')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeSection === 'backend'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          Backend & Runtimes
        </button>

        {(themes.length > 0 || plugins.length > 0) && (
          <button
            onClick={() => setActiveSection('wordpress')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeSection === 'wordpress'
                ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            WordPress ({themes.length + plugins.length})
          </button>
        )}
      </div>

      {/* WORDPRESS THEMES & PLUGINS DEDICATED SECTIONS */}
      {(activeSection === 'all' || activeSection === 'wordpress') && (themes.length > 0 || plugins.length > 0) && (
        <div className="space-y-3">
          {/* SECTION E: WORDPRESS THEMES */}
          {themes.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Observed WordPress Themes ({themes.length})
                  </h3>
                </div>
                <span className="text-[10px] text-slate-500">Public stylesheet & body classes</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {themes.map((theme) => (
                  <div key={theme.slug} className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-100">
                        {theme.name || theme.slug}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          theme.status === 'active'
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {theme.status === 'active' ? 'Active Theme' : 'Referenced Theme'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-1">
                      <div>Slug: <code className="text-slate-300 font-mono bg-slate-900 px-1 py-0.5 rounded">{theme.slug}</code></div>
                      <div>
                        Version:{' '}
                        {theme.version ? (
                          <span className="text-slate-300">
                            Asset hint: v{theme.version}{' '}
                            <span className="text-[10px] text-slate-500">(Unverified release)</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Version not verified</span>
                        )}
                      </div>
                      <div className="truncate text-[10px] text-slate-500 font-mono" title={theme.evidence_source}>
                        Source: {truncateSafe(theme.evidence_source, 45)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION F: WORDPRESS PLUGINS */}
          {plugins.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <Puzzle className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Observed WordPress Plugins ({plugins.length})
                  </h3>
                </div>
                <span className="text-[10px] text-slate-500">Public asset paths & HTML comments</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {plugins.map((plugin) => (
                  <div key={plugin.slug} className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-100">
                        {plugin.name || plugin.slug}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-950/40 text-indigo-300 border border-indigo-800/40">
                        {Math.round(plugin.confidence * 100)}% conf
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-1">
                      <div>Slug: <code className="text-slate-300 font-mono bg-slate-900 px-1 py-0.5 rounded">{plugin.slug}</code></div>
                      <div>
                        Version:{' '}
                        {plugin.version ? (
                          <span className="text-slate-300">
                            Asset hint: v{plugin.version}{' '}
                            <span className="text-[10px] text-slate-500">(Unverified)</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Version not verified</span>
                        )}
                      </div>
                      <div className="truncate text-[10px] text-slate-500 font-mono" title={plugin.evidence_source}>
                        Source: {truncateSafe(plugin.evidence_source, 45)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800/50 text-[11px] text-slate-400 flex items-start space-x-2">
                <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Detection Boundary:</strong> Only publicly observable frontend asset paths and HTML comments are reported. Server-side, headless, or admin-only WordPress plugins do not emit public markers and cannot be discovered without intrusive probing.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FILTER & SEARCH TOOLBAR (FOR ALL STACK FINDINGS) */}
      {activeSection !== 'wordpress' && (
        <div className="space-y-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
          <div className="flex items-center space-x-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search technology by name or summary..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors whitespace-nowrap"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
            {/* Category Dropdown */}
            <div className="flex items-center space-x-1">
              <span className="text-[11px] text-slate-500">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value as CategoryFilter);
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="ALL">All Categories</option>
                <option value="cms">CMS & Builders</option>
                <option value="frontend">Frontend Frameworks</option>
                <option value="backend">Backend Runtimes</option>
              </select>
            </div>

            {/* Status Dropdown */}
            <div className="flex items-center space-x-1">
              <span className="text-[11px] text-slate-500">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value as StatusFilter);
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="ALL">All Statuses</option>
                <option value="detected">Detected (&ge; 70%)</option>
                <option value="possible">Possible (40-69%)</option>
                <option value="unknown">Unknown (&lt; 40%)</option>
              </select>
            </div>

            {/* Confidence Dropdown */}
            <div className="flex items-center space-x-1">
              <span className="text-[11px] text-slate-500">Confidence:</span>
              <select
                value={selectedConfidence}
                onChange={(e) => {
                  setSelectedConfidence(e.target.value as ConfidenceFilter);
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="ALL">All Tiers</option>
                <option value="high">High (&ge; 85%)</option>
                <option value="medium">Medium (50-84%)</option>
                <option value="low">Low (&lt; 50%)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* SECTION B, C, D: FINDINGS LIST WITH EVIDENCE INSPECTOR */}
      {activeSection !== 'wordpress' && (
        <div className="space-y-2">
          {paginatedTechnologies.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/40 border border-slate-800/80 rounded-xl">
              <Cpu className="w-6 h-6 text-slate-500 mx-auto mb-2" />
              <h4 className="text-xs font-semibold text-slate-300 mb-1">
                {hasActiveFilters ? 'No Technologies Match Filters' : 'No Technologies Detected'}
              </h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'Try clearing or broadening your search and category filters.'
                  : 'No evidence matching known CMS, frontend, or backend signatures was observed in this website audit.'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-3 px-3 py-1 rounded bg-slate-800 text-xs text-slate-300 hover:text-slate-100"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            paginatedTechnologies.map((item) => {
              const isExpanded = expandedTechIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl overflow-hidden transition-all"
                >
                  {/* Card Header (Disclosure Trigger) */}
                  <div
                    onClick={() => toggleExpand(item.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpand(item.id);
                      }
                    }}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-slate-800 text-cyan-400 border border-slate-700 flex-shrink-0">
                        {item.technology_category === 'cms' ? (
                          <Globe className="w-4 h-4" />
                        ) : item.technology_category === 'frontend' ? (
                          <Code className="w-4 h-4" />
                        ) : (
                          <Server className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-100 truncate">
                            {item.technology_name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono uppercase px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                            {item.technology_category}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {item.evidence_summary}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                      {renderStatusBadge(item.status)}
                      {renderConfidenceBadge(item.confidence, item.confidence_level)}
                      <div className="text-slate-500">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* SECTION 5: EXPANDABLE EVIDENCE INSPECTOR */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-800/80 bg-slate-950/50 space-y-3 text-xs">
                      {/* Metadata Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                        <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-[10px] text-slate-500 uppercase block">Version</span>
                          <span className="font-medium text-slate-200">
                            {item.version_or_null ? (
                              `v${item.version_or_null}`
                            ) : (
                              <span className="text-slate-500 italic">Not verified</span>
                            )}
                          </span>
                        </div>

                        <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-[10px] text-slate-500 uppercase block">Detection Method</span>
                          <span className="font-mono text-slate-300 text-[11px]">
                            {item.detection_method}
                          </span>
                        </div>

                        <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-[10px] text-slate-500 uppercase block">Affected Pages</span>
                          <span className="font-semibold text-cyan-400">
                            {item.page_count} {item.page_count === 1 ? 'page' : 'pages'}
                          </span>
                        </div>

                        <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-[10px] text-slate-500 uppercase block">Evidence Signals</span>
                          <span className="font-semibold text-slate-200">
                            {item.evidence_items?.length || 1} items
                          </span>
                        </div>
                      </div>

                      {/* Primary Evidence Source */}
                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Primary Evidence Source
                        </span>
                        <div className="p-2 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-slate-300 break-all">
                          {item.evidence_source}
                        </div>
                      </div>

                      {/* Supporting Evidence Items */}
                      {item.evidence_items && item.evidence_items.length > 0 && (
                        <div>
                          <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Supporting Signal Provenance ({item.evidence_items.length})
                          </span>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {item.evidence_items.map((ev, idx) => (
                              <div
                                key={idx}
                                className="p-2 bg-slate-900/80 border border-slate-800/70 rounded text-[11px] space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-cyan-400 text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                                    {ev.evidence_type}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    Weight: {ev.weight}
                                  </span>
                                </div>
                                <div className="text-slate-300 font-medium">{ev.evidence_summary}</div>
                                <div className="text-slate-500 font-mono text-[10px] break-all">
                                  Source: {ev.evidence_source}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Observed Page URLs */}
                      {item.affected_urls && item.affected_urls.length > 0 && (
                        <div>
                          <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Observed On ({item.affected_urls.length})
                          </span>
                          <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[10px] text-slate-400">
                            {item.affected_urls.map((u, i) => (
                              <div key={i} className="truncate p-1 bg-slate-900 rounded border border-slate-800/50" title={u}>
                                {u}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* PAGINATION CONTROLS */}
          {filteredTechnologies.length > pageSize && (
            <div className="flex items-center justify-between pt-2 px-1 text-xs text-slate-400">
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredTechnologies.length)} of {filteredTechnologies.length} findings
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-2 font-medium text-slate-300">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
