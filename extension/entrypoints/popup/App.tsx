import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Play,
  Sparkles,
  PanelRightOpen,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Globe,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  StopCircle,
  ExternalLink,
  Layers,
  Cpu,
  Lock,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { BackendIndicator } from '../../components/common/BackendIndicator';
import { Badge } from '../../components/common/Badge';
import { getActiveTab } from '../../services/tab';
import { checkBackendHealth, createAudit, startAudit } from '../../services/api';
import { runQuickAudit } from '../../services/auditRunner';
import { getAuditResultForUrl, saveActiveFullAuditId } from '../../services/storage';
import { standaloneCoordinator } from '../../standalone/coordinator';
import { StandaloneAuditStorage } from '../../standalone/persistence/indexedDb';
import type { ActiveTabInfo, QuickAuditResult, BackendHealthResponse } from '../../types/audit';
import type { StandaloneAuditJob } from '../../standalone/types';

export default function App() {
  const [tab, setTab] = useState<ActiveTabInfo | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [maxPages, setMaxPages] = useState(10);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Standalone in-browser audit state (Primary Product)
  const [standaloneJob, setStandaloneJob] = useState<StandaloneAuditJob | null>(null);
  const [isStartingAudit, setIsStartingAudit] = useState(false);

  // Quick single-page DOM audit state (Secondary)
  const [quickAudit, setQuickAudit] = useState<QuickAuditResult | null>(null);
  const [isQuickAuditing, setIsQuickAuditing] = useState(false);

  // Developer / Legacy Backend state (Explicitly labeled, optional, zero auto-polling)
  const [showDevOptions, setShowDevOptions] = useState(false);
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [isFullAuditing, setIsFullAuditing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const activeJobRef = useRef<StandaloneAuditJob | null>(null);
  activeJobRef.current = standaloneJob;

  const refreshTab = useCallback(async () => {
    setError(null);
    setPermissionError(null);
    const activeTab = await getActiveTab();
    setTab(activeTab);

    if (activeTab.url && activeTab.isAuditable) {
      setTargetUrl(activeTab.url);
      // Check host permission for active tab URL
      standaloneCoordinator.checkHostPermission(activeTab.url).then(setPermissionGranted);
      // Check existing quick audit cache
      getAuditResultForUrl(activeTab.url).then(setQuickAudit);
    } else {
      setQuickAudit(null);
    }
  }, []);

  // Manual-only health check for developer backend (Zero FastAPI on mount!)
  const handleCheckBackendHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await checkBackendHealth();
      setHealth(res);
    } catch {
      setHealth({ status: 'offline', service: 'fastapi', checkedAt: Date.now() });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTab();

    // Query active or latest standalone audit from service worker
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
        if (res?.success && res.job) {
          setStandaloneJob(res.job);
        } else {
          StandaloneAuditStorage.getLatestJob().then((latest) => {
            if (latest) setStandaloneJob(latest);
          }).catch(() => {});
        }
      });
    }

    // Subscribe to standalone coordinator broadcasts
    const messageListener = (msg: any) => {
      if (!msg) return;
      const type: string = msg.type || msg.action;
      const job: StandaloneAuditJob | undefined = msg.job || msg.payload?.job;

      if (!job) return;

      if (
        type === 'AUDIT_PROGRESS' ||
        type === 'STANDALONE_AUDIT_PROGRESS' ||
        type === 'AUDIT_COMPLETED' ||
        type === 'AUDIT_FAILED' ||
        type === 'AUDIT_CANCELLED'
      ) {
        setStandaloneJob({ ...job });
        if (job.status === 'completed' || job.status === 'completed_with_limitations') {
          setIsStartingAudit(false);
        }
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    return () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, [refreshTab]);

  // Request per-origin host permission
  const handleGrantPermission = async () => {
    if (!targetUrl) return;
    setPermissionError(null);
    const granted = await standaloneCoordinator.requestHostPermission(targetUrl);
    setPermissionGranted(granted);
    if (!granted) {
      setPermissionError('Permission was declined. Manifest V3 requires explicit host consent to audit this site.');
    }
  };

  // Primary Action: Run Full Website Audit using in-browser standalone MV3 engine
  const handleRunStandaloneAudit = async () => {
    if (!targetUrl || !tab?.isAuditable) {
      setError(tab?.unsupportedReason || 'Active tab cannot be audited.');
      return;
    }
    setError(null);
    setPermissionError(null);

    // Verify host permission first; request if needed
    let hasPerm = permissionGranted;
    if (!hasPerm) {
      hasPerm = await standaloneCoordinator.checkHostPermission(targetUrl);
      if (!hasPerm) {
        hasPerm = await standaloneCoordinator.requestHostPermission(targetUrl);
        if (!hasPerm) {
          setPermissionError('Host permission is required to start the in-browser audit.');
          return;
        }
        setPermissionGranted(true);
      }
    }

    setIsStartingAudit(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: 'START_AUDIT',
            payload: {
              targetUrl,
              options: {
                maxPages,
                maxDepth: 3,
                delayMs: 30,
                respectRobots: true,
              },
            },
          },
          (res) => {
            setIsStartingAudit(false);
            if (res?.success && res.job) {
              setStandaloneJob(res.job);
            } else if (res?.error) {
              setError(res.error);
            }
          }
        );
      }
    } catch (err: any) {
      setIsStartingAudit(false);
      setError(err?.message || 'Failed to start in-browser audit.');
    }
  };

  const handleCancelStandaloneAudit = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'CANCEL_AUDIT',
        payload: { auditId: standaloneJob?.id },
      });
    }
  };

  // Open native side panel or fallback to tab
  const handleOpenSidePanel = () => {
    if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
      // Synchronously call chrome.sidePanel.open using in-memory tab state to preserve transient user activation
      if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
          console.warn('[Popup] Native sidePanel.open returned error, falling back to tab:', err);
          if (chrome.tabs?.create) {
            chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
          }
        });
        return;
      }
    }
    // Direct tab fallback
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
    }
  };

  // Secondary Quick Page Audit (Single-Page DOM inspection)
  const handleRunQuickAudit = async () => {
    if (!tab?.id || !tab.url || !tab.isAuditable) {
      setError(tab?.unsupportedReason || 'Active tab cannot be audited.');
      return;
    }
    setIsQuickAuditing(true);
    setError(null);
    try {
      const res = await runQuickAudit(tab.id, tab.url);
      setQuickAudit(res);
    } catch (err: any) {
      setError(err?.message || 'Quick audit failed to execute.');
    } finally {
      setIsQuickAuditing(false);
    }
  };

  // Legacy Developer Backend Trigger (Only if user explicitly chose it)
  const handleStartLegacyFullAudit = async () => {
    if (!tab?.url || !tab.isAuditable) return;
    if (health?.status !== 'ok') {
      setError('Local Python backend offline at 127.0.0.1:8000.');
      return;
    }
    setIsFullAuditing(true);
    setError(null);
    try {
      const created = await createAudit({
        target_url: tab.url,
        mode: 'full',
        configuration: { max_pages: 50, render_javascript: 'auto' },
      });
      await startAudit(created.id);
      await saveActiveFullAuditId(created.id);
      handleOpenSidePanel();
    } catch (err: any) {
      setError(err?.message || 'Failed to start legacy audit.');
    } finally {
      setIsFullAuditing(false);
    }
  };

  const isRunning =
    standaloneJob &&
    (standaloneJob.status === 'crawling' ||
      standaloneJob.status === 'analyzing' ||
      standaloneJob.status === 'scoring');

  const isCompleted =
    standaloneJob &&
    (standaloneJob.status === 'completed' || standaloneJob.status === 'completed_with_limitations');

  return (
    <div className="w-[390px] bg-slate-950 text-slate-100 p-4 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950 flex flex-col space-y-3.5">
      {/* Header & Detected Tab */}
      <Header tab={tab} />

      {/* Engine Indicator Banner: Standalone Chrome MV3 (Zero Localhost / Zero FastAPI) */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-800/80 text-[11px] text-indigo-300">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-slate-200">Engine: Standalone Chrome MV3</span>
        </div>
        <span className="text-[10px] bg-indigo-900/80 px-2 py-0.5 rounded text-indigo-200 border border-indigo-700/60">
          Zero Localhost • Zero FastAPI
        </span>
      </div>

      {/* Error Banners */}
      {error && (
        <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-900/60 flex items-start space-x-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {permissionError && (
        <div className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-900/60 flex items-start space-x-2 text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{permissionError}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRIMARY CARD: FULL WEBSITE AUDIT (STANDALONE CHROME MV3 ENGINE)           */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/30 shadow-lg shadow-indigo-950/20 space-y-3">
        {/* Card Header & Permission Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-100">Full Website Audit</h3>
              <p className="text-[11px] text-slate-400">51 Canonical SEO Rules • Tech Detection</p>
            </div>
          </div>

          {permissionGranted ? (
            <span className="inline-flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800 text-emerald-300">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Permission Granted</span>
            </span>
          ) : (
            <button
              onClick={handleGrantPermission}
              className="inline-flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-950/70 hover:bg-amber-900/80 border border-amber-800 text-amber-300 transition-colors"
            >
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span>Grant Permission</span>
            </button>
          )}
        </div>

        {/* Target URL & Page Budget Configuration */}
        <div className="space-y-2 text-xs">
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
              Audit Scope & Target URL
            </label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com/"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                Page Budget Limit
              </label>
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                disabled={Boolean(isRunning)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value={5}>5 Pages (Fast Check)</option>
                <option value={10}>10 Pages (Recommended)</option>
                <option value={25}>25 Pages (Standard)</option>
                <option value={50}>50 Pages (Deep Audit)</option>
              </select>
            </div>

            <div className="flex-1 text-right">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1">
                Engine Mode
              </span>
              <span className="text-xs font-mono font-semibold text-cyan-400">100% In-Browser</span>
            </div>
          </div>
        </div>

        {/* In-Flight Audit Progress Bar */}
        {isRunning && (
          <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-900/60 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-indigo-300 font-medium truncate max-w-[240px]">
                {standaloneJob?.currentStage || 'Auditing website in-browser...'}
              </span>
              <span className="font-mono text-indigo-400 font-semibold">{standaloneJob?.progressPercent || 0}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-850 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${standaloneJob?.progressPercent || 5}%` }}
              />
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[10px] text-slate-400">
                Auditing {standaloneJob?.targetUrl}
              </span>
              <button
                onClick={handleCancelStandaloneAudit}
                className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold inline-flex items-center space-x-1"
              >
                <StopCircle className="w-3 h-3" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}

        {/* Completed Audit Summary Card */}
        {isCompleted && !isRunning && (
          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Latest In-Browser Audit</span>
              <span className="font-mono text-xs font-bold text-emerald-400">
                Score: {standaloneJob?.scorecard?.overallScore ?? 100}/100 ({standaloneJob?.scorecard?.grade ?? 'A'})
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center text-[10px] font-mono text-slate-300 pt-1 border-t border-slate-850">
              <div>Pages: {standaloneJob?.scorecard?.pagesCrawled ?? standaloneJob?.crawledUrls?.length ?? 0}</div>
              <div>Issues: {standaloneJob?.scorecard?.totalIssuesCount ?? 0}</div>
              <div>Status: {standaloneJob?.status === 'completed' ? 'Pass' : 'Limited'}</div>
            </div>
          </div>
        )}

        {/* PRIMARY CTA: Run Full Website Audit Button */}
        <button
          onClick={handleRunStandaloneAudit}
          disabled={isRunning || isStartingAudit || !tab?.isAuditable}
          className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-all shadow-md ${
            !tab?.isAuditable
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
              : isRunning || isStartingAudit
              ? 'bg-indigo-600/60 text-indigo-200 cursor-wait'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 active:scale-[0.98]'
          }`}
        >
          {isRunning || isStartingAudit ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{isStartingAudit ? 'Initializing Audit...' : 'Audit In Progress...'}</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>{isCompleted ? 'Re-Run Full Website Audit' : 'Run Full Website Audit'}</span>
            </>
          )}
        </button>
      </div>

      {/* Open Dashboard in Side Panel Action */}
      <button
        onClick={handleOpenSidePanel}
        className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-colors shadow-sm"
      >
        <PanelRightOpen className="w-4 h-4 text-cyan-400" />
        <span>Open Audit Dashboard in Side Panel</span>
      </button>

      {/* Quick Single-Page DOM Audit (Secondary Compact Card) */}
      <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-medium text-slate-300 text-[11px]">Quick DOM Inspection</span>
          </div>
          <button
            onClick={handleRunQuickAudit}
            disabled={isQuickAuditing || !tab?.isAuditable}
            className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 disabled:text-slate-600"
          >
            {isQuickAuditing ? 'Analyzing...' : quickAudit ? 'Re-check DOM' : 'Check DOM'}
          </button>
        </div>

        {quickAudit && (
          <div className="grid grid-cols-3 gap-1 py-1 px-2 rounded bg-slate-950 border border-slate-850 text-center text-[10px] text-slate-400 font-mono">
            <div>Headings: <span className="text-slate-200 font-semibold">{quickAudit.headings.totalCount}</span></div>
            <div>Images: <span className="text-slate-200 font-semibold">{quickAudit.images.totalCount}</span></div>
            <div>Links: <span className="text-slate-200 font-semibold">{quickAudit.links.totalCount}</span></div>
          </div>
        )}
      </div>

      {/* Collapsible Developer / Legacy Backend (Explicitly labeled, Zero auto-poll) */}
      <div className="pt-1">
        <button
          onClick={() => setShowDevOptions(!showDevOptions)}
          className="w-full flex items-center justify-between text-[11px] text-slate-500 hover:text-slate-400 transition-colors py-1 px-1"
        >
          <span>Developer Options: Local Python Backend (127.0.0.1:8000)</span>
          {showDevOptions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {showDevOptions && (
          <div className="mt-2 p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Backend Server</span>
              <BackendIndicator
                health={health}
                loading={healthLoading}
                onRefresh={handleCheckBackendHealth}
              />
            </div>
            <button
              onClick={handleStartLegacyFullAudit}
              disabled={isFullAuditing || health?.status !== 'ok' || !tab?.isAuditable}
              className={`w-full py-1.5 px-3 rounded text-[11px] font-medium border transition-colors ${
                health?.status === 'ok'
                  ? 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-700'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800/60 cursor-not-allowed'
              }`}
            >
              {isFullAuditing ? 'Starting Legacy Audit...' : 'Run Legacy FastAPI Audit (Dev Only)'}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-900">
        <span>Website Audit Agent</span>
        <span className="font-mono text-indigo-400/80">Standalone Chrome MV3</span>
      </div>
    </div>
  );
}
