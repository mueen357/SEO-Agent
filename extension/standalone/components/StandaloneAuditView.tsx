/**
 * Standalone In-Browser Audit View.
 * 100% Client-Side Manifest V3 Experience (Zero Python / FastAPI Required).
 */

import React, { useState, useEffect } from 'react';
import {
  Play,
  RotateCcw,
  Download,
  ShieldCheck,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Cpu,
  Layers,
  StopCircle,
} from 'lucide-react';
import type {
  StandaloneAuditJob,
  StandaloneCrawlPage,
  StandaloneSeoFinding,
  StandaloneTechFinding,
} from '../types';
import { StandaloneAuditStorage } from '../persistence/indexedDb';
import { standaloneCoordinator } from '../coordinator';
import { StandaloneExporter } from '../export/exporter';
import { StandaloneFindingsClassifier } from '../audit/findingsClassifier';

export interface StandaloneAuditViewProps {
  activeUrl?: string;
}

export function StandaloneAuditView({ activeUrl }: StandaloneAuditViewProps = {}) {
  const [targetUrl, setTargetUrl] = useState(activeUrl || '');
  const [maxPages, setMaxPages] = useState(5);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<StandaloneAuditJob | null>(null);
  const [crawledPages, setCrawledPages] = useState<StandaloneCrawlPage[]>([]);
  const [findings, setFindings] = useState<StandaloneSeoFinding[]>([]);
  const [technologies, setTechnologies] = useState<StandaloneTechFinding[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'tech' | 'issues' | 'coverage'>('overview');
  const [issuesViewFilter, setIssuesViewFilter] = useState<'issues' | 'passed' | 'all'>('issues');
  const [loading, setLoading] = useState(false);

  const activeJobRef = React.useRef<StandaloneAuditJob | null>(null);
  activeJobRef.current = activeJob;

  // Sync activeUrl if targetUrl is empty
  useEffect(() => {
    if (activeUrl && !targetUrl) {
      setTargetUrl(activeUrl);
    }
  }, [activeUrl]);

  // Check initial permission status if targetUrl changes
  useEffect(() => {
    if (targetUrl) {
      standaloneCoordinator.checkHostPermission(targetUrl).then(setPermissionGranted);
    }
  }, [targetUrl]);

  // 1. Initial load: detect active tab URL and check latest stored audit
  useEffect(() => {
    // Try to get active tab URL if not provided via props
    if (!activeUrl && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url && tabs[0].url.startsWith('http')) {
          setTargetUrl(tabs[0].url);
        }
      });
    }

    // Restore latest audit from IndexedDB
    StandaloneAuditStorage.getLatestJob()
      .then(async (job) => {
        if (job) {
          setActiveJob(job);
          activeJobRef.current = job;
          if (!targetUrl) setTargetUrl(job.targetUrl);
          if (job.status === 'crawling' || job.status === 'analyzing' || job.status === 'scoring') {
            setLoading(true);
          }
          const [pages, issueList, techList] = await Promise.all([
            StandaloneAuditStorage.getPagesForAudit(job.id),
            StandaloneAuditStorage.getFindingsForAudit(job.id),
            StandaloneAuditStorage.getTechnologiesForAudit(job.id),
          ]);
          setCrawledPages(pages);
          setFindings(issueList);
          setTechnologies(techList);
        }
      })
      .catch((err) => console.warn('Could not restore standalone job:', err));

    // Subscribe to coordinator progress
    const unsubscribe = standaloneCoordinator.onProgress(async (job) => {
      setActiveJob({ ...job });
      activeJobRef.current = { ...job };
      if (
        job.status === 'completed' ||
        job.status === 'completed_with_limitations' ||
        job.status === 'crawling' ||
        job.status === 'failed'
      ) {
        const pages = await StandaloneAuditStorage.getPagesForAudit(job.id);
        setCrawledPages(pages);
      }
      if (
        job.status === 'completed' ||
        job.status === 'completed_with_limitations' ||
        job.status === 'failed' ||
        job.status === 'cancelled' ||
        job.status === 'error'
      ) {
        setLoading(false);
        const [issueList, techList] = await Promise.all([
          StandaloneAuditStorage.getFindingsForAudit(job.id),
          StandaloneAuditStorage.getTechnologiesForAudit(job.id),
        ]);
        setFindings(issueList);
        setTechnologies(techList);
      }
    });

    // Listen for background worker messages with unified typed schema
    const messageListener = (msg: any) => {
      if (!msg) return;

      const job: StandaloneAuditJob | undefined = msg.job || msg.payload?.job;
      const type: string = msg.type || msg.action;

      if (!job) return;

      // Reject stale messages from previous audits
      if (
        activeJobRef.current &&
        job.id !== activeJobRef.current.id &&
        activeJobRef.current.status !== 'completed' &&
        activeJobRef.current.status !== 'completed_with_limitations' &&
        activeJobRef.current.status !== 'failed' &&
        activeJobRef.current.status !== 'idle'
      ) {
        return;
      }

      // Check sequence number to discard out-of-order broadcasts
      if (msg.sequence && activeJobRef.current?.sequence && msg.sequence < activeJobRef.current.sequence) {
        return;
      }

      setActiveJob({ ...job });
      activeJobRef.current = { ...job };

      if (type === 'AUDIT_PROGRESS' || type === 'STANDALONE_AUDIT_PROGRESS') {
        if (job.status === 'crawling') {
          StandaloneAuditStorage.getPagesForAudit(job.id).then(setCrawledPages).catch(() => {});
        }
      }

      if (
        type === 'AUDIT_COMPLETED' ||
        job.status === 'completed' ||
        job.status === 'completed_with_limitations'
      ) {
        setLoading(false);
        Promise.all([
          StandaloneAuditStorage.getPagesForAudit(job.id),
          StandaloneAuditStorage.getFindingsForAudit(job.id),
          StandaloneAuditStorage.getTechnologiesForAudit(job.id),
        ])
          .then(([pages, issueList, techList]) => {
            setCrawledPages(pages);
            setFindings(issueList);
            setTechnologies(techList);
          })
          .catch((err) => console.warn('Error loading completed audit data:', err));
      }

      if (type === 'AUDIT_CANCELLED' || job.status === 'cancelled') {
        setLoading(false);
      }

      if (type === 'AUDIT_FAILED' || job.status === 'failed' || job.status === 'error') {
        setLoading(false);
        StandaloneAuditStorage.getPagesForAudit(job.id).then(setCrawledPages).catch(() => {});
        setPermissionError(msg.error || job.errorMessage || 'Audit encountered an error.');
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    return () => {
      unsubscribe();
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, []);

  const handleRequestPermission = async () => {
    if (!targetUrl) return;
    setPermissionError(null);
    const granted = await standaloneCoordinator.requestHostPermission(targetUrl);
    setPermissionGranted(granted);
    if (!granted) {
      setPermissionError('Permission was denied. Manifest V3 requires explicit host permission to crawl this website.');
    }
  };

  const handleStartAudit = async () => {
    if (!targetUrl) return;
    setPermissionError(null);

    // Verify permission first
    const hasPerm = await standaloneCoordinator.checkHostPermission(targetUrl);
    if (!hasPerm) {
      const granted = await standaloneCoordinator.requestHostPermission(targetUrl);
      if (!granted) {
        setPermissionError('Permission was denied. Please grant host permission to start the in-browser audit.');
        return;
      }
      setPermissionGranted(true);
    }

    setLoading(true);
    setCrawledPages([]);
    setFindings([]);
    setTechnologies([]);

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: 'START_AUDIT',
            payload: { targetUrl, options: { maxPages } },
            action: 'START_STANDALONE_AUDIT',
          },
          (res) => {
            if (chrome.runtime.lastError) {
              // Background worker might be waking up; query status to avoid duplicate audits
              console.warn('Background start response error:', chrome.runtime.lastError.message);
              chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (statusRes) => {
                if (statusRes?.job && statusRes.job.status !== 'completed') {
                  setActiveJob(statusRes.job);
                  activeJobRef.current = statusRes.job;
                } else {
                  setPermissionError('Could not connect to background service worker. Please try again.');
                  setLoading(false);
                }
              });
              return;
            }

            if (res && res.type === 'AUDIT_ACCEPTED') {
              setActiveJob(res.job);
              activeJobRef.current = res.job;
              setLoading(true);
            } else if (res && res.type === 'AUDIT_REJECTED') {
              setPermissionError(res.error || 'Audit request was rejected.');
              setLoading(false);
            } else if (res && res.success && res.job) {
              setActiveJob(res.job);
              activeJobRef.current = res.job;
              setLoading(true);
            } else if (res && !res.success) {
              setPermissionError(res.error || 'Failed to start audit.');
              setLoading(false);
            }
          }
        );
      } else {
        // Direct test runner environment
        const job = await standaloneCoordinator.startAudit(targetUrl, { maxPages });
        setActiveJob(job);
        activeJobRef.current = job;
      }
    } catch (err: any) {
      setPermissionError(err?.message || 'Audit start failed.');
      setLoading(false);
    }
  };

  const handleCancelAudit = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'CANCEL_AUDIT',
        payload: { auditId: activeJob?.id },
        action: 'CANCEL_STANDALONE_AUDIT',
      });
    }
    standaloneCoordinator.cancelAudit(activeJob?.id);
    setLoading(false);
  };

  const handleExportJson = async () => {
    if (!activeJob) return;
    try {
      const ledger = await StandaloneAuditStorage.getExecutionLedgerForAudit(activeJob.id);
      StandaloneExporter.downloadJson(activeJob, crawledPages, findings, technologies, ledger);
    } catch {
      StandaloneExporter.downloadJson(activeJob, crawledPages, findings, technologies);
    }
  };

  const handleExportCsv = async () => {
    if (!activeJob) return;
    try {
      const ledger = await StandaloneAuditStorage.getExecutionLedgerForAudit(activeJob.id);
      StandaloneExporter.downloadCsv(activeJob, crawledPages, findings, ledger);
    } catch {
      StandaloneExporter.downloadCsv(activeJob, crawledPages, findings);
    }
  };

  const scorecard = activeJob?.scorecard;
  const findingsSummary = StandaloneFindingsClassifier.classify(findings);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto font-sans">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-semibold text-slate-100">Standalone In-Browser Audit</h2>
            <span className="px-1.5 py-0.5 text-[10px] font-medium tracking-wide bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">
              Beta • Zero Localhost
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Executes 100% inside your Chrome browser. No Python, SQLite, or API keys.
          </p>
        </div>
      </div>

      {/* Engine Indicator Banner */}
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-xs">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium text-indigo-200">
            Engine: Standalone Chrome MV3 (Zero Localhost / Zero FastAPI)
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">100% Client-Side</span>
      </div>

      {/* Permission Error Banner */}
      {permissionError && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-rose-200">Permission Action Required</div>
            <div className="mt-0.5">{permissionError}</div>
          </div>
        </div>
      )}

      {/* Target URL & Controls */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-3">
        <div>
          <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Target Website URL
          </label>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Globe className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={loading}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              disabled={loading}
              className="bg-slate-950 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-none"
            >
              <option value={5}>5 pages</option>
              <option value={10}>10 pages</option>
              <option value={25}>25 pages</option>
              <option value={50}>50 pages</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRequestPermission}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                permissionGranted
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{permissionGranted ? 'Host Permission Granted' : 'Grant Host Permission'}</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {loading ? (
              <button
                onClick={handleCancelAudit}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            ) : (
              <button
                onClick={handleStartAudit}
                disabled={!targetUrl}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded shadow-sm transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start In-Browser Audit</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Stage Stepper & Progress */}
      {activeJob && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span
                className={`font-semibold px-1.5 py-0.5 rounded text-[10px] tracking-wide uppercase ${
                  activeJob.status === 'completed'
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                    : activeJob.status === 'completed_with_limitations'
                    ? 'bg-amber-950/60 text-amber-300 border border-amber-800'
                    : activeJob.status === 'failed' || activeJob.status === 'error'
                    ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                    : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800'
                }`}
              >
                {activeJob.status.replace(/_/g, ' ')}
              </span>
              <span className="text-slate-400">• {activeJob.currentStage}</span>
            </div>
            <span className="font-mono text-indigo-400 font-medium">
              {activeJob.progressPercent}%
            </span>
          </div>

          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                activeJob.status === 'error' || activeJob.status === 'failed'
                  ? 'bg-rose-500'
                  : activeJob.status === 'completed_with_limitations'
                  ? 'bg-amber-500'
                  : activeJob.status === 'completed'
                  ? 'bg-emerald-500'
                  : 'bg-indigo-500'
              }`}
              style={{ width: `${activeJob.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Results Section */}
      {activeJob && (
        activeJob.status === 'completed' ||
        activeJob.status === 'completed_with_limitations' ||
        activeJob.status === 'failed' ||
        crawledPages.length > 0
      ) && (
        <div className="space-y-3">
          {/* Tabs */}
          <div className="flex items-center space-x-1 border-b border-slate-800 pb-1 text-xs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-t font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview & Score
            </button>
            <button
              onClick={() => setActiveTab('pages')}
              className={`px-3 py-1.5 rounded-t font-medium transition-colors ${
                activeTab === 'pages'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pages ({crawledPages.length})
            </button>
            <button
              onClick={() => setActiveTab('tech')}
              className={`px-3 py-1.5 rounded-t font-medium transition-colors ${
                activeTab === 'tech'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tech Stack ({technologies.length})
            </button>
            <button
              onClick={() => setActiveTab('issues')}
              className={`px-3 py-1.5 rounded-t font-medium transition-colors ${
                activeTab === 'issues'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SEO Issues ({findingsSummary.issueCount})
            </button>
            <button
              onClick={() => setActiveTab('coverage')}
              className={`px-3 py-1.5 rounded-t font-medium transition-colors ${
                activeTab === 'coverage'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Coverage & Rules ({scorecard?.coverage?.executedRulesTotal ?? 9}/51)
            </button>
          </div>

          {/* Tab: Overview */}
          {activeTab === 'overview' && scorecard && (
            <div className="space-y-3">
              {!scorecard.available ? (
                <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-lg text-xs space-y-1">
                  <div className="flex items-center space-x-1.5 font-semibold text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>SEO Scorecard Unavailable (Grade: N/A)</span>
                  </div>
                  <div className="text-slate-300">
                    {scorecard.reason || 'Crawl failed / insufficient evidence to compute reliable score.'}
                  </div>
                  <div className="text-[11px] text-slate-400 pt-1 font-mono">
                    Attempted URLs: {scorecard.attemptedPagesCount ?? crawledPages.length} | Usable HTML Pages: {scorecard.usablePagesCount ?? 0}
                  </div>
                </div>
              ) : null}

              {scorecard.coverage && (
                <div
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                    scorecard.coverage.scoreState === 'fully_evaluated'
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                      : scorecard.coverage.scoreState === 'substantial_coverage'
                      ? 'bg-blue-950/40 border-blue-800/80 text-blue-200'
                      : 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase border rounded ${
                        scorecard.coverage.scoreState === 'fully_evaluated'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : scorecard.coverage.scoreState === 'substantial_coverage'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {scorecard.coverage.scoreState === 'fully_evaluated'
                        ? 'FULLY EVALUATED'
                        : scorecard.coverage.scoreState === 'substantial_coverage'
                        ? 'SUBSTANTIAL COVERAGE'
                        : 'PROVISIONAL SCORE'}
                    </span>
                    <span className="text-slate-300 font-medium">
                      Coverage: {scorecard.coverage.executedRulesTotal}/{scorecard.coverage.expectedRulesTotal} canonical rules ({Math.round(scorecard.coverage.coverageRatio * 100)}%)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {scorecard.coverage.policyVersion || 'v2.0.0-standalone'}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Overall</div>
                  <div className="text-xl font-bold text-indigo-400 mt-0.5">
                    {scorecard.available && scorecard.overallScore !== null ? `${scorecard.overallScore}/100` : 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">On-Page</div>
                  <div className="text-xl font-bold text-emerald-400 mt-0.5">
                    {scorecard.available && scorecard.onPageScore !== null ? `${scorecard.onPageScore}/100` : 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Technical</div>
                  <div className="text-xl font-bold text-amber-400 mt-0.5">
                    {scorecard.available && scorecard.technicalScore !== null ? `${scorecard.technicalScore}/100` : 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Sitewide</div>
                  <div className="text-xl font-bold text-blue-400 mt-0.5">
                    {scorecard.available && scorecard.sitewideScore !== null ? `${scorecard.sitewideScore}/100` : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Honest Evaluation Metric Cards */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded p-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Issues</div>
                  <div className={`text-base font-bold mt-0.5 ${scorecard.totalIssuesCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {scorecard.totalIssuesCount}
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 rounded p-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Warnings</div>
                  <div className={`text-base font-bold mt-0.5 ${findingsSummary.warningCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {findingsSummary.warningCount}
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 rounded p-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Passed Checks</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">
                    {findingsSummary.passedCount}
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 rounded p-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Coverage</div>
                  <div className="text-base font-bold text-indigo-400 mt-0.5">
                    {scorecard.coverage ? `${scorecard.coverage.executedRulesTotal}/${scorecard.coverage.expectedRulesTotal}` : '0/51'}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Export */}
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  onClick={handleExportJson}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab: Pages */}
          {activeTab === 'pages' && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {crawledPages.map((p, idx) => (
                <div
                  key={p.id || idx}
                  className="bg-slate-900/60 border border-slate-800/80 rounded p-2 text-xs flex items-center justify-between"
                >
                  <div className="truncate flex-1 mr-2">
                    <div className="font-medium text-slate-200 truncate">
                      {p.fetchStatus === 'success' ? (p.title || 'Untitled') : (p.errorCode || 'FETCH_FAILED')}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">{p.url}</div>
                    {p.errorMessage && (
                      <div className="text-[10px] text-rose-400 truncate mt-0.5">{p.errorMessage}</div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${
                        p.fetchStatus === 'success' && p.httpStatus === 200
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950/60 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {p.httpStatus || 'ERR'}
                    </span>
                    <span className="text-[10px] text-slate-500">{p.responseTimeMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab: Tech */}
          {activeTab === 'tech' && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {technologies.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No supported technologies confirmed from currently available evidence.
                </div>
              ) : (
                technologies.map((t) => (
                  <div
                    key={t.id}
                    className="bg-slate-900/60 border border-slate-800/80 rounded p-2 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium text-slate-200">{t.name}</div>
                      <div className="text-[10px] text-slate-500">{t.evidenceSummary}</div>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className="px-1.5 py-0.5 text-[9px] uppercase font-mono rounded bg-slate-800 text-slate-300">
                        {t.category}
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800">
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab: Issues */}
          {activeTab === 'issues' && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {/* Filter controls */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[11px]">
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setIssuesViewFilter('issues')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      issuesViewFilter === 'issues'
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Issues ({findingsSummary.issueCount})
                  </button>
                  <button
                    onClick={() => setIssuesViewFilter('passed')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      issuesViewFilter === 'passed'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Passed Checks ({findingsSummary.passedCount})
                  </button>
                  <button
                    onClick={() => setIssuesViewFilter('all')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      issuesViewFilter === 'all'
                        ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Records ({findingsSummary.totalRecords})
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {findingsSummary.distinctRulesEvaluated} rules / {findingsSummary.pagesEvaluated} pages
                </span>
              </div>

              {/* Issues view */}
              {issuesViewFilter === 'issues' && (
                findingsSummary.issueCount === 0 ? (
                  <div className="p-4 text-center text-xs text-emerald-400 space-y-1 bg-slate-900/40 border border-slate-800 rounded">
                    <div className="font-semibold text-emerald-300">✓ Zero SEO issues detected across evaluated pages!</div>
                    <div className="text-slate-400 text-[11px] font-mono">
                      {findingsSummary.passedCount} checks passed, 0 failures, 0 warnings
                    </div>
                  </div>
                ) : (
                  findings
                    .filter((f) => {
                      const s = f.status?.toLowerCase();
                      return s === 'fail' || s === 'failed' || s === 'warning' || s === 'warn';
                    })
                    .map((f) => (
                      <div
                        key={f.id}
                        className="bg-slate-900/60 border border-slate-800/80 rounded p-2 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-200">{f.title}</span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded ${
                              f.severity === 'critical'
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                                : f.severity === 'high'
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                                : 'bg-blue-950/80 text-blue-300 border border-blue-800'
                            }`}
                          >
                            {f.severity}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">{f.description}</div>
                        <div className="text-[10px] text-indigo-300/80 font-mono">
                          Rec: {f.recommendation}
                        </div>
                        {f.pageUrl && (
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            Page: {f.pageUrl}
                          </div>
                        )}
                      </div>
                    ))
                )
              )}

              {/* Passed view */}
              {issuesViewFilter === 'passed' && (
                findingsSummary.passedCount === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No passed check records stored.
                  </div>
                ) : (
                  findings
                    .filter((f) => f.status?.toLowerCase() === 'pass' || f.status?.toLowerCase() === 'passed')
                    .map((f) => (
                      <div
                        key={f.id}
                        className="bg-slate-900/60 border border-slate-800/80 rounded p-2 text-xs flex items-center justify-between"
                      >
                        <div className="truncate flex-1 mr-2">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-400 font-bold">✓</span>
                            <span className="font-medium text-slate-200">{f.title}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                            {f.pageUrl}
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                          {f.ruleId}
                        </span>
                      </div>
                    ))
                )
              )}

              {/* All records view */}
              {issuesViewFilter === 'all' && (
                findings.map((f) => (
                  <div
                    key={f.id}
                    className="bg-slate-900/60 border border-slate-800/80 rounded p-2 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200">{f.title}</span>
                      <div className="flex items-center space-x-1">
                        <span className="px-1.5 py-0.5 text-[9px] uppercase font-mono rounded bg-slate-800 text-slate-300">
                          {f.status}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800">
                          {f.ruleId}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400">{f.description}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab: Coverage */}
          {activeTab === 'coverage' && (
            <div className="space-y-3 text-xs bg-slate-900/60 border border-slate-800 p-3 rounded-lg">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-indigo-300">
                    Canonical SEO Rule Coverage: {scorecard?.coverage?.executedRulesTotal ?? 9} / 51 Rules Evaluated
                  </h4>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase rounded bg-amber-950/60 text-amber-300 border border-amber-800">
                    Provisional ({Math.round(((scorecard?.coverage?.executedRulesTotal ?? 9) / 51) * 100)}%)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-2">
                  Parity tracking against authoritative 51 backend SEO rule registry:
                </p>

                {/* Family Breakdown */}
                <div className="space-y-2 mb-3 bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-300">On-Page SEO (16 canonical rules)</span>
                    <span className="font-mono text-emerald-400">
                      {scorecard?.coverage?.familyCoverage?.on_page?.executed ?? 6} / 16 executed
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-300">Technical SEO (22 canonical rules)</span>
                    <span className="font-mono text-emerald-400">
                      {scorecard?.coverage?.familyCoverage?.technical?.executed ?? 2} / 22 executed
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-300">Site-Wide SEO (13 canonical rules)</span>
                    <span className="font-mono text-emerald-400">
                      {scorecard?.coverage?.familyCoverage?.sitewide?.executed ?? 1} / 13 executed
                    </span>
                  </div>
                </div>

                <div className="font-mono text-[10px] space-y-1 text-slate-400">
                  <div className="text-indigo-300 font-semibold text-[11px]">Standalone Evaluated Rules (9):</div>
                  <div className="grid grid-cols-2 gap-1 text-emerald-400">
                    <span>✓ ONPAGE_TITLE_TAG</span>
                    <span>✓ ONPAGE_TITLE_LENGTH</span>
                    <span>✓ ONPAGE_META_DESCRIPTION</span>
                    <span>✓ ONPAGE_META_DESCRIPTION_LENGTH</span>
                    <span>✓ ONPAGE_H1_PRESENCE</span>
                    <span>✓ ONPAGE_IMAGE_ALT_TEXT</span>
                    <span>✓ TECH_HTTPS_SECURITY</span>
                    <span>✓ TECH_ROBOTS_TXT</span>
                    <span>✓ SITE_CANONICAL_CONSISTENCY</span>
                  </div>
                  <div className="mt-2 text-slate-500">
                    42 Canonical Rules (Hreflang, Schema.org JSON-LD, OpenGraph, Link Graph Depth, TTFB, Redirect Chains, Sitemap Validation, etc.) scheduled for Phase 2/3 browser-native migration.
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-2">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-indigo-300">
                    Technology Fingerprint Catalog: 173 Fingerprints
                  </h4>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800">
                    Universal Catalog Loaded
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-1">
                  Exported directly from backend Python catalog with full multi-vector signatures (headers, meta, scripts, styles, DOM markers, version rules):
                </p>
                <div className="text-[10px] text-slate-400 leading-relaxed">
                  WordPress, WooCommerce, Elementor, Shopify, Webflow, Squarespace, Wix, Framer, Ghost, Drupal, Joomla, Next.js, Nuxt.js, React, Vue, Angular, Svelte, Astro, Tailwind, Bootstrap, Google Analytics, GTM, Meta Pixel, Cloudflare, Apache, Nginx, PHP, and 146 additional technologies.
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
