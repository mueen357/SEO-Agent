import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Filter,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCode,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Server,
  FileText,
} from 'lucide-react';

import {
  getAuditIssues,
  runAuditAnalysis,
  runTechnicalAuditAnalysis,
  runSitewideAuditAnalysis,
} from '../../services/api';
import type {
  SeoIssueItem,
  IssueSummaryData,
  IssueSeverity,
  IssueStatus,
} from '../../types/audit';

interface SeoFindingsViewProps {
  auditId: string | null;
  isBackendOnline: boolean;
  isAuditRunning?: boolean;
}

export function SeoFindingsView({
  auditId,
  isBackendOnline,
  isAuditRunning = false,
}: SeoFindingsViewProps) {
  const [issues, setIssues] = useState<SeoIssueItem[]>([]);
  const [summary, setSummary] = useState<IssueSummaryData | null>(null);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [analyzingType, setAnalyzingType] = useState<'all' | 'on_page' | 'technical' | 'sitewide' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Expanded evidence tracking
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  const fetchIssues = useCallback(
    async (page: number = 1) => {
      if (!auditId || !isBackendOnline) return;
      setLoading(true);
      setError(null);
      try {
        const resp = await getAuditIssues(auditId, {
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          severity: severityFilter !== 'all' ? severityFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          page,
          pageSize: 20,
        });
        setIssues(resp.issues || []);
        setTotal(resp.total || 0);
        setCurrentPage(resp.page || 1);
        setTotalPages(resp.total_pages || 1);
        if (resp.summary) {
          setSummary(resp.summary);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch SEO issues.');
      } finally {
        setLoading(false);
      }
    },
    [auditId, isBackendOnline, categoryFilter, severityFilter, statusFilter]
  );

  useEffect(() => {
    fetchIssues(1);
  }, [fetchIssues]);

  const handleRunAnalysis = async (categoryType: 'all' | 'on_page' | 'technical' | 'sitewide' = 'all') => {
    if (!auditId || !isBackendOnline || analyzingType) return;
    setAnalyzingType(categoryType);
    setError(null);
    try {
      let resp;
      if (categoryType === 'technical') {
        resp = await runTechnicalAuditAnalysis(auditId);
      } else if (categoryType === 'on_page') {
        resp = await runAuditAnalysis(auditId, 'on_page');
      } else if (categoryType === 'sitewide') {
        resp = await runSitewideAuditAnalysis(auditId);
      } else {
        resp = await runAuditAnalysis(auditId);
      }
      setSummary(resp.summary);
      await fetchIssues(1);
    } catch (err: any) {
      setError(err.message || 'Failed to execute SEO analysis.');
    } finally {
      setAnalyzingType(null);
    }
  };

  const getStatusIcon = (status: IssueStatus) => {
    switch (status) {
      case 'fail':
        return <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'unknown':
      default:
        return <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  const getSeverityBadgeClass = (severity: IssueSeverity) => {
    switch (severity) {
      case 'critical':
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
      case 'high':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      case 'medium':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'low':
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
      case 'info':
      default:
        return 'bg-slate-900 text-slate-400 border-slate-800';
    }
  };

  if (!auditId) {
    return (
      <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
        <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-200">No Full Audit Selected</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Start or select a Full Website Audit above to inspect evidence-based on-page and technical findings.
        </p>
      </div>
    );
  }

  // Summary counts
  const totalAssessments = summary?.total_assessments ?? summary?.total_issues ?? 0;
  const actionableFindings =
    summary?.actionable_findings ??
    ((summary?.by_status?.fail || 0) + (summary?.by_status?.warning || 0));
  const failCount = summary?.fail_count ?? summary?.by_status?.fail ?? 0;
  const warningCount = summary?.warning_count ?? summary?.by_status?.warning ?? 0;
  const passCount = summary?.pass_count ?? summary?.by_status?.pass ?? 0;

  return (
    <div className="space-y-4">
      {/* Action & Status Header */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-200">Evidence-Based SEO Rule Findings</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                51 Rules Total
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                22 Technical
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-800">
                16 On-Page
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                13 Site-Wide
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Grounded in HTTP response headers, robots directives, sitemaps, and W3C/Google Search Central standards.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Run Technical Button */}
            <button
              onClick={() => handleRunAnalysis('technical')}
              disabled={!!analyzingType || !isBackendOnline || isAuditRunning}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                !isBackendOnline || isAuditRunning
                  ? 'bg-slate-800/50 border-slate-700/50 text-slate-500 cursor-not-allowed'
                  : analyzingType === 'technical'
                  ? 'bg-indigo-950 border-indigo-700 text-indigo-300 cursor-wait'
                  : 'bg-indigo-950/60 hover:bg-indigo-900/80 border-indigo-800/80 text-indigo-300 hover:text-indigo-200 active:scale-95'
              }`}
              title="Execute 22 Technical SEO checks: HTTP status codes, robots, sitemaps, redirects, canon, HTTPS"
            >
              {analyzingType === 'technical' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Server className="w-3.5 h-3.5" />
              )}
              <span>Run Technical</span>
            </button>

            {/* Run On-Page Button */}
            <button
              onClick={() => handleRunAnalysis('on_page')}
              disabled={!!analyzingType || !isBackendOnline || isAuditRunning}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                !isBackendOnline || isAuditRunning
                  ? 'bg-slate-800/50 border-slate-700/50 text-slate-500 cursor-not-allowed'
                  : analyzingType === 'on_page'
                  ? 'bg-slate-900 border-slate-700 text-slate-300 cursor-wait'
                  : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-300 active:scale-95'
              }`}
              title="Execute 16 On-Page SEO checks: titles, descriptions, headings, images, links"
            >
              {analyzingType === 'on_page' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Run On-Page</span>
            </button>

            {/* Run All Analysis Button */}
            <button
              onClick={() => handleRunAnalysis('all')}
              disabled={!!analyzingType || !isBackendOnline || isAuditRunning}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                !isBackendOnline || isAuditRunning
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : analyzingType === 'all'
                  ? 'bg-cyan-500/50 text-slate-950 cursor-wait'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-95'
              }`}
              title="Execute all 38 rules across on-page and technical categories"
            >
              {analyzingType === 'all' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Evaluating All Rules...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Run Full Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Aggregate KPI Badges */}
        {totalAssessments > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800/60">
            <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Actionable Issues</span>
              <div className="text-base font-bold text-cyan-400 font-mono">{actionableFindings}</div>
            </div>
            <div className="p-2 rounded-lg bg-rose-950/20 border border-rose-900/40 text-center">
              <span className="text-[10px] text-rose-400 uppercase font-semibold">Failures</span>
              <div className="text-base font-bold text-rose-300 font-mono">{failCount}</div>
            </div>
            <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-900/40 text-center">
              <span className="text-[10px] text-amber-400 uppercase font-semibold">Warnings</span>
              <div className="text-base font-bold text-amber-300 font-mono">{warningCount}</div>
            </div>
            <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-center">
              <span className="text-[10px] text-emerald-400 uppercase font-semibold">Passed Checks</span>
              <div className="text-base font-bold text-emerald-300 font-mono">{passCount}</div>
            </div>
            <div className="p-2 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-center">
              <span className="text-[10px] text-indigo-400 uppercase font-semibold">Total Assessed</span>
              <div className="text-base font-bold text-indigo-300 font-mono">{totalAssessments}</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 pt-2 border-t border-slate-800/60 flex items-center space-x-2">
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>Analysis has not run yet. Click &quot;Run Full Analysis&quot; above to inspect crawled evidence.</span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 flex items-start space-x-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 flex flex-wrap items-center gap-2.5 text-xs">
        <div className="flex items-center space-x-1 text-slate-400 font-medium">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters:</span>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none focus:border-cyan-500"
        >
          <option value="all">All Statuses</option>
          <option value="fail">Failures Only</option>
          <option value="warning">Warnings Only</option>
          <option value="pass">Passed Rules</option>
          <option value="unknown">Unknown</option>
        </select>

        {/* Severity Filter */}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none focus:border-cyan-500"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>

        {/* Category Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none focus:border-cyan-500"
        >
          <option value="all">All Categories</option>
          <option value="technical">Technical SEO (22 Rules)</option>
          <option value="on_page">On-Page Metadata (16 Rules)</option>
          <option value="images">Images & Media</option>
          <option value="links">Links Structure</option>
        </select>

        <span className="text-[11px] text-slate-500 ml-auto">
          Showing {issues.length} of {total} findings
        </span>
      </div>

      {/* Findings List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 space-y-2">
          <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mx-auto" />
          <p>Loading audit findings...</p>
        </div>
      ) : issues.length === 0 ? (
        <div className="p-8 rounded-xl bg-slate-900/30 border border-slate-800/60 text-center space-y-2">
          <p className="text-xs text-slate-400 font-medium">
            {totalAssessments > 0
              ? 'No issues found matching current filters.'
              : 'Analysis not run yet. Click "Run Full Analysis" or "Run Technical" above to evaluate crawl evidence.'}
          </p>
          <p className="text-[11px] text-slate-500">
            Our rules do not generate fictional issues or arbitrary numeric scores.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {issues.map((issue) => {
            const isExpanded = expandedIssueId === issue.id;
            return (
              <div
                key={issue.id}
                className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all space-y-2.5"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2">
                    {getStatusIcon(issue.status)}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200">{issue.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{issue.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border uppercase ${getSeverityBadgeClass(
                        issue.severity
                      )}`}
                    >
                      {issue.severity}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-800">
                      {issue.category}:{issue.subcategory}
                    </span>
                  </div>
                </div>

                {/* Affected Page URL & Source */}
                {issue.page_url && (
                  <div className="text-[11px] font-mono text-slate-400 bg-slate-950/60 px-2.5 py-1 rounded border border-slate-800/60 flex items-center justify-between">
                    <span className="truncate max-w-md">{issue.page_url}</span>
                    <span className="text-[10px] text-slate-500 uppercase shrink-0 ml-2">
                      src: {issue.source_type}
                    </span>
                  </div>
                )}

                {/* Recommendation */}
                {issue.recommendation && (
                  <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-900/40 text-[11px] text-cyan-300">
                    <strong className="text-cyan-400 font-semibold">Recommendation: </strong>
                    {issue.recommendation}
                  </div>
                )}

                {/* Collapsible Evidence JSON */}
                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <button
                    onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                    className="flex items-center space-x-1 text-slate-400 hover:text-slate-200"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{isExpanded ? 'Hide Evidence' : 'Inspect Evidence'}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {issue.documentation_url && (
                    <a
                      href={issue.documentation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 text-[10px]"
                    >
                      <span>Google Docs</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>

                {isExpanded && issue.evidence_json && (
                  <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-[10px] font-mono text-slate-300 overflow-x-auto">
                    {JSON.stringify(issue.evidence_json, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchIssues(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchIssues(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
