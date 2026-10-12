import React from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import type { BackendHealthResponse } from '../../types/audit';

interface BackendIndicatorProps {
  health: BackendHealthResponse | null;
  loading: boolean;
  onRefresh: () => void;
}

export const BackendIndicator: React.FC<BackendIndicatorProps> = ({ health, loading, onRefresh }) => {
  const isOnline = health?.status === 'ok';

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 rounded-lg border border-slate-800/80 text-xs">
      <div className="flex items-center space-x-2">
        <span className="relative flex h-2 w-2">
          {isOnline && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
        </span>
        <span className="text-slate-300 font-medium">FastAPI Backend</span>
        <span className="text-slate-500 text-[11px] font-mono">
          {isOnline ? `(online${health?.latencyMs ? ` · ${health.latencyMs}ms` : ''})` : '(offline)'}
        </span>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        title="Check Backend Health"
        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};