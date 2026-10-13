import React, { useEffect, useState, useCallback } from 'react';
import { Play, Sparkles, PanelRightOpen, Lock, ShieldCheck, AlertCircle, RefreshCw, Globe } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { BackendIndicator } from '../../components/common/BackendIndicator';
import { Badge } from '../../components/common/Badge';
import { getActiveTab } from '../../services/tab';
import { checkBackendHealth, createAudit, startAudit } from '../../services/api';
import { runQuickAudit } from '../../services/auditRunner';
import { getAuditResultForUrl, saveActiveFullAuditId } from '../../services/storage';
import type { ActiveTabInfo, QuickAuditResult, BackendHealthResponse } from '../../types/audit';

export default function App() {
  const [tab, setTab] = useState<ActiveTabInfo | null>(null);
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [audit, setAudit] = useState<QuickAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isFullAuditing, setIsFullAuditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTab = useCallback(async () => {
    setError(null);
    const activeTab = await getActiveTab();
    setTab(activeTab);

    if (activeTab.url && activeTab.isAuditable) {
      const existing = await getAuditResultForUrl(activeTab.url);
      setAudit(existing);
    } else {
      setAudit(null);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    const res = await checkBackendHealth();
    setHealth(res);
    setHealthLoading(false);
  }, []);

  useEffect(() => {
    refreshTab();
    refreshHealth();
  }, [refreshTab, refreshHealth]);

  const handleRunQuickAudit = async () => {
    if (!tab?.id || !tab.url || !tab.isAuditable) {
      setError(tab?.unsupportedReason || 'Active tab cannot be audited.');
      return;
    }

    setIsAuditing(true);
    setError(null);
    try {
      const res = await runQuickAudit(tab.id, tab.url);
      setAudit(res);
    } catch (err: any) {
      setError(err?.message || 'Audit failed to execute on current page.');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleStartFullAudit = async () => {
    if (!tab?.url || !tab.isAuditable) {
      setError('Active tab cannot be audited.');
      return;
    }
    if (health?.status !== 'ok') {
      setError('FastAPI backend service is offline. Please start backend at 127.0.0.1:8000.');
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

      // Open side panel
      handleOpenSidePanel();
    } catch (err: any) {
      setError(err?.message || 'Failed to start full website audit.');
    } finally {
      setIsFullAuditing(false);
    }
  };

  const handleOpenSidePanel = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.sidePanel) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch((err) => {
            console.warn('Failed to open sidepanel from popup:', err);
          });
        }
      });
    }
  };

  return (
    <div className="w-[380px] bg-slate-950 text-slate-100 p-4 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950 flex flex-col space-y-4">
      {/* Header & Detected Tab */}
      <Header tab={tab} />

      {/* Backend Status & Health */}
      <BackendIndicator
        health={health}
        loading={healthLoading}
        onRefresh={refreshHealth}
      />

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 flex items-start space-x-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tier 1: Quick Page Audit (Functional) */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-100">Quick Page Audit</h3>
              <p className="text-[11px] text-slate-400">Instant DOM analysis (Client-Side)</p>
            </div>
          </div>
          <Badge variant="info">Ready</Badge>
        </div>

        {audit && (
          <div className="grid grid-cols-3 gap-2 py-2 px-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center text-xs">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Headings</span>
              <span className="font-semibold text-slate-200">{audit.headings.totalCount}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Images</span>
              <span className="font-semibold text-slate-200">{audit.images.totalCount}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Links</span>
              <span className="font-semibold text-slate-200">{audit.links.totalCount}</span>
            </div>
          </div>
        )}

        <button
          onClick={handleRunQuickAudit}
          disabled={isAuditing || !tab?.isAuditable}
          className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-all shadow-md ${
            !tab?.isAuditable
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
              : isAuditing
              ? 'bg-cyan-500/50 text-slate-950 cursor-wait'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-[0.98]'
          }`}
        >
          {isAuditing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Analyzing DOM...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>{audit ? 'Re-run Quick Audit' : 'Run Quick Page Audit'}</span>
            </>
          )}
        </button>
      </div>

      {/* Tier 2: Full Website Audit (FastAPI Crawler) */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-100">Full Website Audit</h3>
              <p className="text-[11px] text-slate-400">HTTP crawler & dynamic rendering</p>
            </div>
          </div>
          <Badge variant={health?.status === 'ok' ? 'success' : 'neutral'}>
            {health?.status === 'ok' ? 'Online' : 'Offline'}
          </Badge>
        </div>

        <button
          onClick={handleStartFullAudit}
          disabled={isFullAuditing || health?.status !== 'ok' || !tab?.isAuditable}
          className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
            health?.status === 'ok' && tab?.isAuditable
              ? 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/30'
              : 'bg-slate-850 text-slate-600 border-slate-800 cursor-not-allowed'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isFullAuditing ? 'Starting Audit...' : 'Start Full Audit (Max 50 Pages)'}</span>
        </button>
      </div>

      {/* Tier 3: Verified Owner Audit (Upcoming) */}
      <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/60 opacity-60 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-300">Verified Owner Audit</h3>
              <p className="text-[11px] text-slate-500">Google Search Console & DNS auth</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            Phase 2
          </span>
        </div>
      </div>

      {/* Open Comprehensive Side Panel Shortcut */}
      <button
        onClick={handleOpenSidePanel}
        className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-colors"
      >
        <PanelRightOpen className="w-4 h-4 text-cyan-400" />
        <span>Open Audit Dashboard in Side Panel</span>
      </button>

      {/* Footer */}
      <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
        <span>SiteAudit AI</span>
        <span className="font-mono text-cyan-500/80">Phase 1 &bull; MVP</span>
      </div>
    </div>
  );
}
