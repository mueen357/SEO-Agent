import React from 'react';
import type { QuickAuditResult } from '../../types/audit';
import { Badge } from '../common/Badge';
import { ExternalLink, Link2, Info } from 'lucide-react';

interface LinksSectionProps {
  audit: QuickAuditResult;
}

export const LinksSection: React.FC<LinksSectionProps> = ({ audit }) => {
  const { links } = audit;

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400">Total Links</span>
          <div className="text-lg font-bold text-slate-100">{links.totalCount}</div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400">Internal Links</span>
          <div className="text-lg font-bold text-cyan-400">{links.internalCount}</div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400">External Links</span>
          <div className="text-lg font-bold text-purple-400">{links.externalCount}</div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
        <div className="flex items-center space-x-1.5 text-slate-300 font-semibold">
          <Info className="w-3.5 h-3.5 text-cyan-400" />
          <span>Domain Classification Methodology</span>
        </div>
        <p className="leading-relaxed">
          Links matching <code>{audit.hostname}</code> or any of its subdomains are classified as <strong>Internal</strong>. Cross-domain destinations are classified as <strong>External</strong>. Non-HTTP protocols (e.g. mailto, tel) are logged separately ({links.otherProtocolsCount}).
        </p>
      </div>

      {/* Sample Links List */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-300">
          Sample Extracted Hyperlinks ({links.samples.length})
        </h4>

        {links.samples.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-500">
            No hyperlinks found on this page.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
            {links.samples.map((link, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-200 font-medium truncate max-w-[220px]">
                    {link.text}
                  </span>
                  <Badge variant={link.isInternal ? 'primary' : 'neutral'}>
                    {link.isInternal ? 'INTERNAL' : 'EXTERNAL'}
                  </Badge>
                </div>
                <div className="flex items-center space-x-1 text-[11px] font-mono text-slate-400 truncate">
                  {link.isInternal ? <Link2 className="w-3 h-3 text-cyan-400 shrink-0" /> : <ExternalLink className="w-3 h-3 text-purple-400 shrink-0" />}
                  <span className="truncate">{link.href}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};