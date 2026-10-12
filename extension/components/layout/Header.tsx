import React from 'react';
import { Globe, ShieldAlert, PanelRightClose, Sparkles } from 'lucide-react';
import type { ActiveTabInfo } from '../../types/audit';

interface HeaderProps {
  tab: ActiveTabInfo | null;
  onOpenSidePanel?: () => void;
  showSidePanelButton?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  tab,
  onOpenSidePanel,
  showSidePanelButton = false
}) => {
  return (
    <header className="p-4 bg-slate-950 border-b border-slate-800 space-y-3">
      {/* Top Brand Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-md shadow-cyan-500/10">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 tracking-tight leading-none">
              Website Audit Agent
            </h1>
            <p className="text-[10px] text-cyan-400 font-medium tracking-wide uppercase mt-0.5">
              AI SEO Intelligence
            </p>
          </div>
        </div>

        {showSidePanelButton && onOpenSidePanel && (
          <button
            onClick={onOpenSidePanel}
            title="Open Full Side Panel Dashboard"
            className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors"
          >
            <PanelRightClose className="w-3.5 h-3.5 text-cyan-400" />
            <span>Side Panel</span>
          </button>
        )}
      </div>

      {/* Current Site Card */}
      <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            {tab?.favIconUrl ? (
              <img src={tab.favIconUrl} alt="" className="w-3.5 h-3.5 rounded shrink-0" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
            ) : (
              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
            <span className="font-semibold text-slate-200 truncate">
              {tab?.hostname || (tab?.isAuditable === false ? 'Restricted Page' : 'Detecting Website...')}
            </span>
          </div>

          {tab && !tab.isAuditable && (
            <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
              Restricted
            </span>
          )}
        </div>

        {tab?.url && (
          <div className="text-[11px] font-mono text-slate-400 truncate pl-5">
            {tab.url}
          </div>
        )}

        {tab && !tab.isAuditable && tab.unsupportedReason && (
          <div className="flex items-start space-x-1.5 text-[11px] text-amber-300/90 pt-1 border-t border-slate-800/60 mt-1">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{tab.unsupportedReason}</span>
          </div>
        )}
      </div>
    </header>
  );
};