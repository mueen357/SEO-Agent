import React, { useEffect, useState, useCallback } from 'react';
import { Play, Sparkles, PanelRightOpen, Lock, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { BackendIndicator } from '../../components/common/BackendIndicator';
import { Badge } from '../../components/common/Badge';
import { getActiveTab } from '../../services/tab';
import { checkBackendHealth } from '../../services/api';
import { runQuickAudit } from '../../services/auditRunner';
import { getAuditResultForUrl } from '../../services/storage';
import type { ActiveTabInfo, QuickAuditResult, BackendHealthResponse } from '../../types/audit';

export default function App() {
  const [tab, setTab] = useState<ActiveTabInfo | null>(null);
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [audit, setAudit] = useState<QuickAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize active tab and health
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

    // Listen for tab activation / update changes
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const handleActivated = () => refreshTab();
      const handleUpdated = (_tabId: number, changeInfo: { status?: string; url?: string }) => {
        if (changeInfo.status === 'complete' || changeInfo.url) {
          refreshTab();
        }
      };

      chrome.tabs.onActivated.addListener(handleActivated);
      chrome.tabs.onUpdated.addListener(handleUpdated);

      return () => {
        chrome.tabs.onActivated.removeListener(handleActivated);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
      };
    }
  }, [refreshTab, refreshHealth]);

  // Execute Quick Audit
  const handleQuickAudit = async () => {
    if (!tab?.id || !tab?.url || !tab.isAuditable) return;
    setIsAuditing(true);
    setError(null);

    try {
      const result = await runQuickAudit(tab.id, tab.url);
      setAudit(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAuditing(false);
    }
  };

  // Open Side Panel
  const handleOpenSidePanel = async () => {
    if (typeof chrome !== 'undefined') {
      try {
        const currentWindow = await chrome.windows.getCurrent();
        if (chrome.sidePanel && currentWindow.id) {
          await chrome.sidePanel.open({ windowId: currentWindow.id });
          window.close(); // Close popup once side panel opens
          return;
        }
      } catch {
        // Fallback message to background script
        chrome.runtime.sendMessage({
          action: 'OPEN_SIDE_PANEL',
          payload: { windowId: tab?.id }
        });
      }
    }
  };

  return (
    <div className="flex flex-col w-[380px] min-h-[520px] bg-slate-950 text-slate-100 antialiased font-sans">
      {/* Header with active website detection */}
      <Header
        tab={tab}
        onOpenSidePanel={handleOpenSidePanel}
        showSidePanelButton={true}
      />

      {/* Main Content Area */}
      <div className="flex-1 p-4 space-y-4">
        {/* Backend Connectivity Indicator */}
        <BackendIndicator
          health={health}
          loading={healthLoading}
          onRefresh={refreshHealth}
        />

        {/* Action Buttons Group */}
        <div className="space-y-2">
          {/* 1. Quick Audit Button */}
          <button
            onClick={handleQuickAudit}
            disabled={!tab?.isAuditable || isAuditing}
            className={`w-full py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 font-semibold text-xs shadow-lg transition-all ${
              !tab?.isAuditable
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                : isAuditing
                ? 'bg-cyan-600/80 text-white cursor-wait animate-pulse'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20 active:scale-[0.99]'
            }`}
          >
            {isAuditing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Auditing Page Structure...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Quick Audit</span>
              </>
            )}
          </button>

          {/* 2. Full Website Audit (Disabled / Coming soon) */}
          <button
            disabled
            className="w-full py-2.5 px-4 rounded-xl flex items-center justify-between text-xs font-medium bg-slate-900/60 text-slate-500 border border-slate-800/80 cursor-not-allowed"
          >
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-slate-600" />
              <span>Full Website Audit</span>
            </div>
            <span className="text-[10px] text-slate-600 font-mono">Phase 2</span>
          </button>

          {/* 3. Verified Owner Audit (Disabled / Coming soon) */}
          <button
            disabled
            className="w-full py-2.5 px-4 rounded-xl flex items-center justify-between text-xs font-medium bg-slate-900/60 text-slate-500 border border-slate-800/80 cursor-not-allowed"
          >
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              <span>Verified Owner Audit</span>
            </div>
            <span className="text-[10px] text-slate-600 font-mono">Phase 3</span>
          </button>

          {/* 4. Open Side Panel Button */}
          <button
            onClick={handleOpenSidePanel}
            className="w-full py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800/90 text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/50 transition-colors"
          >
            <PanelRightOpen className="w-4 h-4 text-cyan-400" />
            <span>Open Side Panel Dashboard</span>
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 flex items-start space-x-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Audit Summary Card (If audit exists) */}
        {audit && (
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-xs font-semibold text-slate-200">Quick Page Audit</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {new Date(audit.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-[10px] text-slate-400">Headings</span>
                <div className="text-sm font-bold text-slate-200">{audit.headings.totalCount}</div>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-[10px] text-slate-400">Images</span>
                <div className="text-sm font-bold text-slate-200">{audit.images.totalCount}</div>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-[10px] text-slate-400">Links</span>
                <div className="text-sm font-bold text-slate-200">{audit.links.totalCount}</div>
              </div>
            </div>

            <div className="text-center pt-1">
              <button
                onClick={handleOpenSidePanel}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline-offset-2 hover:underline"
              >
                View full breakdown in side panel &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Empty State when no audit has been run */}
        {!audit && !isAuditing && tab?.isAuditable && (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center space-y-1 text-xs text-slate-400">
            <p className="font-medium text-slate-300">No audit run yet for this tab.</p>
            <p className="text-[11px] text-slate-500">
              Click &quot;Run Quick Page Audit&quot; to inspect title, metadata, headings, images, and links.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-4 py-2.5 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
        <span>Website Audit Agent v0.1.0</span>
        <span className="font-mono text-cyan-500/80">Phase 1 &bull; Task 1.2</span>
      </footer>
    </div>
  );
}