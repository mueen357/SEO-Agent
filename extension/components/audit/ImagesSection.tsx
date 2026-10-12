import React from 'react';
import type { QuickAuditResult } from '../../types/audit';
import { Badge } from '../common/Badge';
import { AlertCircle, Image as ImageIcon } from 'lucide-react';

interface ImagesSectionProps {
  audit: QuickAuditResult;
}

export const ImagesSection: React.FC<ImagesSectionProps> = ({ audit }) => {
  const { images } = audit;

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400">Total Images</span>
          <div className="text-lg font-bold text-slate-100">{images.totalCount}</div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400">Missing Alt</span>
          <div className={`text-lg font-bold ${images.missingAltCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {images.missingAltCount}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400">Empty Alt</span>
          <div className="text-lg font-bold text-amber-400">{images.emptyAltCount}</div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
        <strong className="text-slate-300">Accessibility Note: </strong>
        Images missing the <code>alt</code> attribute are flagged as accessibility issues. Images with <code>alt=&quot;&quot;</code> are valid if the graphic is purely decorative.
      </div>

      {/* Issues List */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-300">
          Detected Image Issues ({images.issues.length})
        </h4>

        {images.issues.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-emerald-400">
            All images on this page contain valid alt attributes!
          </div>
        ) : (
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {images.issues.map((issue, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-slate-300">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold truncate max-w-[200px]">{issue.src.split('/').pop() || 'image'}</span>
                  </div>
                  <Badge variant={issue.issueType === 'missing_alt' ? 'danger' : 'warning'}>
                    {issue.issueType === 'missing_alt' ? 'MISSING ALT' : 'EMPTY ALT'}
                  </Badge>
                </div>
                <div className="p-1.5 rounded bg-slate-950 text-[11px] font-mono text-slate-400 truncate">
                  {issue.src}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};