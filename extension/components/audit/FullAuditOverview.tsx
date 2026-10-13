import React from 'react';
import { Play, Square, RefreshCw, CheckCircle2, Clock, AlertTriangle, XCircle, Globe, Shield, Copy, Check } from 'lucide-react';
import { Badge } from '../common/Badge';
import type { AuditRecord } from '../../types/audit';

interface FullAuditOverviewProps {
  audit: AuditRecord | null;
  isRunning: boolean;
  onStartAudit: () => void;
  onCancelAudit: () => void;
  onRefresh: () => void;
  targetUrl?: string;
  isBackendOnline: boolean;
}

export const FullAuditOverview: React.FC<FullAuditOverviewProps> = ({
  audit,
  isRunning,
  onStartAudit,
  onCancelAudit,
  onRefresh,
  targetUrl,
  isBackendOnline,
}) => {
  const [copied, setCopied] = React.useState(false);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'partially_completed':
        return <Badge variant="warning">Partially Completed</Badge>;
      case 'crawling':
        return <Badge variant="info">Crawling</Badge>;
      case 'queued':
        return <Badge variant="neutral">Queued</Badge>;
      case 'cancelled':
        return <Badge variant="neutral">Cancelled</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Target URL & Launch Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <Globe className="w-5 h-5 text-cyan-400 shrink-0" />
            <span className="text-sm font-medium text-slate-200 truncate">
              {audit ? audit.target_url : (targetUrl || 'No active tab')}
            </span>
          </div>
          {audit && getStatusBadge(audit.status)}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
          {!isRunning ? (
            <button
              onClick={onStartAudit}
              disabled={!isBackendOnline}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold transition-all ${
                isBackendOnline
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20 active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Full Audit (Max 50 Pages)
            </button>
          ) : (
            <button
              onClick={onCancelAudit}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-all active:scale-[0.98]"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Cancel Audit
            </button>
          )}

          {audit && (
            <button
              onClick={onRefresh}
              title="Refresh status"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {!isBackendOnline && (
          <p className="text-[11px] text-amber-400/90 mt-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Backend API offline (127.0.0.1:8000 required for Full Website Audit).
          </p>
        )}
      </div>

      {/* Progress & Metrics Card */}
      {audit && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Audit ID:</span>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
              <span>{audit.id.slice(0, 8)}...{audit.id.slice(-4)}</span>
              <button
                onClick={() => copyId(audit.id)}
                className="hover:text-cyan-400 transition-colors p-0.5"
                title="Copy Full UUID"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {isRunning && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Crawl Progress</span>
                <span className="font-mono text-cyan-400">
                  {audit.pages_crawled} / {audit.max_pages} pages
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(5, (audit.pages_crawled / (audit.max_pages || 50)) * 100))}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Crawled</span>
              <span className="text-base font-bold text-slate-100">{audit.pages_crawled}</span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Discovered</span>
              <span className="text-base font-bold text-cyan-400">{audit.pages_discovered}</span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Max Pages</span>
              <span className="text-base font-bold text-slate-300">{audit.max_pages}</span>
            </div>
          </div>

          {/* Timestamps */}
          <div className="text-[10px] text-slate-500 space-y-0.5 pt-1">
            {audit.started_at && (
              <div>Started: {new Date(audit.started_at).toLocaleTimeString()}</div>
            )}
            {audit.completed_at && (
              <div>Completed: {new Date(audit.completed_at).toLocaleTimeString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
