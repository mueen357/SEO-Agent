import React from 'react';
import type { QuickAuditResult } from '../../types/audit';
import { Badge } from '../common/Badge';

interface HeadingsSectionProps {
  audit: QuickAuditResult;
}

export const HeadingsSection: React.FC<HeadingsSectionProps> = ({ audit }) => {
  const { headings } = audit;

  const counts = [
    { tag: 'H1', count: headings.h1Count, variant: headings.h1Count === 1 ? 'success' : (headings.h1Count === 0 ? 'danger' : 'info') },
    { tag: 'H2', count: headings.h2Count, variant: 'primary' },
    { tag: 'H3', count: headings.h3Count, variant: 'neutral' },
    { tag: 'H4', count: headings.h4Count, variant: 'neutral' },
    { tag: 'H5', count: headings.h5Count, variant: 'neutral' },
    { tag: 'H6', count: headings.h6Count, variant: 'neutral' },
  ];

  return (
    <div className="space-y-4">
      {/* Counts Header */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Heading Hierarchy Counts</h3>
        <div className="flex flex-wrap gap-2">
          {counts.map((c) => (
            <div key={c.tag} className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <span className="font-bold text-slate-200">{c.tag}:</span>
              <span className={`font-mono ${c.count > 0 ? 'text-cyan-400 font-semibold' : 'text-slate-500'}`}>{c.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Headings DOM Order List */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-300">Headings in DOM Order ({headings.items.length})</h4>
        {headings.items.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-500">
            No headings found on this page.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {headings.items.map((h, i) => (
              <div
                key={i}
                className="flex items-start space-x-2.5 p-2 rounded-lg bg-slate-900/70 border border-slate-800/80 text-xs"
                style={{ marginLeft: `${Math.min((h.level - 1) * 12, 48)}px` }}
              >
                <Badge variant={h.level === 1 ? 'primary' : 'neutral'}>
                  H{h.level}
                </Badge>
                <span className="text-slate-200 font-normal leading-relaxed break-words flex-1">
                  {h.text || <span className="text-slate-500 italic">(Empty heading)</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};