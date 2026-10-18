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

export function StandaloneAuditView() {
  const [targetUrl, setTargetUrl] = useState('');
  const [maxPages, setMaxPages] = useState(10);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [activeJob, setActiveJob] = useState<StandaloneAuditJob | null>(null);
  const [crawledPages, setCrawledPages] = useState<StandaloneCrawlPage[]>([]);
  const [findings, setFindings] = useState<StandaloneSeoFinding[]>([]);
  const [technologies, setTechnologies] = useState<StandaloneTechFinding[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'tech' | 'issues'>('overview');
  const [loading, setLoading] = useState(false);

  // 1. Initial load: detect active tab URL and check latest stored audit
  useEffect(() => {
    // Try to get active tab URL
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
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
          setTargetUrl(job.targetUrl);
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
      if (job.status === 'completed' || job.status === 'crawling') {
        const pages = await StandaloneAuditStorage.getPagesForAudit(job.id);
        setCrawledPages(pages);
      }
      if (job.status === 'completed') {
        setLoading(false);
        const [issueList, techList] = await Promise.all([
          StandaloneAuditStorage.getFindingsForAudit(job.id),
          StandaloneAuditStorage.getTechnologiesForAudit(job.id),
        ]);
        setFindings(issueList);
        setTechnologies(techList);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleRequestPermission = async () => {
    if (!targetUrl) return;
    const granted = await standaloneCoordinator.requestHostPermission(targetUrl);
    setPermissionGranted(granted);
  };

  const handleStartAudit = async () => {
    if (!targetUrl) return;
    setLoading(true);
    setCrawledPages([]);
    setFindings([]);
    setTechnologies([]);
    await standaloneCoordinator.startAudit(targetUrl, { maxPages });
  };

  const handleCancelAudit = () => {
    standaloneCoordinator.cancelAudit();
    setLoading(false);
  };

  const handleExportJson = () => {
    if (!activeJob) return;
    StandaloneExporter.downloadJson(activeJob, crawledPages, findings, technologies);
  };

  const handleExportCsv = () => {
    if (!activeJob) return;
    StandaloneExporter.downloadCsv(activeJob, crawledPages, findings);
  };

  const scorecard = activeJob?.scorecard;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto font-sans">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-semibold text-slate-100">Standalone In-Browser Audit</h2>
            <span className="px-1.5 py-0.5 text-[10px] font-medium tracking-wide bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">
              Zero Backend
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Executes 100% inside your Chrome browser. No Python, SQLite, or API keys.
          </p>
        </div>
      </div>

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
              <span className="font-semibold text-slate-200">
                {activeJob.status.toUpperCase()}
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
                activeJob.status === 'error'
                  ? 'bg-rose-500'
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
      {activeJob && (activeJob.status === 'completed' || crawledPages.length > 0) && (
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
              SEO Issues ({findings.length})
            </button>
          </div>

          {/* Tab: Overview */}
          {activeTab === 'overview' && scorecard && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Overall</div>
                  <div className="text-xl font-bold text-indigo-400 mt-0.5">
                    {scorecard.overallScore}
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">On-Page</div>
                  <div className="text-xl font-bold text-emerald-400 mt-0.5">
                    {scorecard.onPageScore}
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Technical</div>
                  <div className="text-xl font-bold text-amber-400 mt-0.5">
                    {scorecard.technicalScore}
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Sitewide</div>
                  <div className="text-xl font-bold text-blue-400 mt-0.5">
                    {scorecard.sitewideScore}
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
                    <div className="font-medium text-slate-200 truncate">{p.title || 'Untitled'}</div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">{p.url}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${
                        p.httpStatus === 200
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
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {findings.length === 0 ? (
                <div className="p-4 text-center text-xs text-emerald-400">
                  Zero SEO issues detected across evaluated pages!
                </div>
              ) : (
                findings.map((f) => (
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
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
