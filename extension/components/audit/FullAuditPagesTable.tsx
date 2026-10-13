import React from 'react';
import { FileText, ArrowRight, Sparkles, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '../common/Badge';
import type { CrawlPageItem } from '../../types/audit';

interface FullAuditPagesTableProps {
  pages: CrawlPageItem[];
  total: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onSelectPage: (page: CrawlPageItem) => void;
  selectedPageId?: string;
}

export const FullAuditPagesTable: React.FC<FullAuditPagesTableProps> = ({
  pages,
  total,
  currentPage,
  pageSize,
  totalPages,
  onPageChange,
  onSelectPage,
  selectedPageId,
}) => {
  if (pages.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
        <FileText className="w-8 h-8 mx-auto text-slate-600 mb-2" />
        <p>No crawled pages available yet.</p>
        <p className="text-[11px] text-slate-500 mt-1">Start a full website audit to discover and crawl pages.</p>
      </div>
    );
  }

  const getRenderBadge = (page: CrawlPageItem) => {
    if (!page.render) return null;
    switch (page.render.render_status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
            <Sparkles className="w-2.5 h-2.5" />
            Rendered
          </span>
        );
      case 'skipped':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            HTTP-Only
          </span>
        );
      case 'unavailable':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            No Sandbox
          </span>
        );
      case 'failed':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
            Render Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>Crawled Pages ({total})</span>
        {totalPages > 1 && (
          <span className="text-[11px] text-slate-500">
            Page {currentPage} of {totalPages}
          </span>
        )}
      </div>

      {/* Pages List */}
      <div className="space-y-1.5">
        {pages.map((p) => {
          const isSelected = selectedPageId === p.id;
          return (
            <div
              key={p.id}
              onClick={() => onSelectPage(p)}
              className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                isSelected
                  ? 'bg-slate-800 border-cyan-500/50 shadow-sm'
                  : 'bg-slate-900 hover:bg-slate-800/80 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                        p.http_status === 200
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {p.http_status || 'ERR'}
                    </span>
                    <span className="text-xs font-medium text-slate-200 truncate block">
                      {p.title || p.requested_url}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 truncate">
                    {p.requested_url}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {getRenderBadge(p)}
                  <span className="text-[10px] font-mono text-slate-500">
                    {p.response_time_ms}ms · d:{p.depth}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 px-1">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="flex items-center gap-1 text-xs py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Previous
          </button>
          <span className="text-xs text-slate-400">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="flex items-center gap-1 text-xs py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
