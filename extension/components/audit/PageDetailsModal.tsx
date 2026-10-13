import React from 'react';
import { X, Sparkles, Activity, FileText, Heading, Image as ImageIcon, Link2, ExternalLink } from 'lucide-react';
import type { CrawlPageItem } from '../../types/audit';

interface PageDetailsModalProps {
  page: CrawlPageItem | null;
  onClose: () => void;
}

export const PageDetailsModal: React.FC<PageDetailsModalProps> = ({ page, onClose }) => {
  if (!page) return null;

  const renderItem = page.render;
  const comp = renderItem?.comparison_json;
  const metrics = renderItem?.performance_metrics_json;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="min-w-0 pr-3">
            <h3 className="text-sm font-semibold text-slate-100 truncate">
              {page.title || 'Page Details'}
            </h3>
            <p className="text-[11px] font-mono text-cyan-400 truncate">
              {page.requested_url}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Status & Timing Bar */}
          <div className="grid grid-cols-4 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-center">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">HTTP</span>
              <span className="font-mono font-semibold text-slate-200">{page.http_status || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Response</span>
              <span className="font-mono text-slate-200">{page.response_time_ms}ms</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Depth</span>
              <span className="font-mono text-slate-200">{page.depth}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Render</span>
              <span className="font-mono text-slate-200">{renderItem?.render_status || 'N/A'}</span>
            </div>
          </div>

          {/* Dynamic Rendering vs Raw Comparison */}
          {renderItem && (
            <div className="bg-slate-950/40 border border-purple-500/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-300 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Dynamic Rendering Analysis
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Strategy: {renderItem.render_strategy}
                </span>
              </div>

              {renderItem.render_reason && (
                <p className="text-[11px] text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800">
                  {renderItem.render_reason}
                </p>
              )}

              {comp && comp.summary && (
                <div className="text-[11px] text-slate-300 bg-purple-950/20 border border-purple-900/40 p-2 rounded">
                  {comp.summary}
                </div>
              )}

              {comp && comp.rendered_reveals_more_content && (
                <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                  <div className="bg-slate-900 p-1.5 rounded">
                    <span className="text-[10px] text-slate-400 block">+Headings</span>
                    <span className="font-mono font-bold text-purple-300">+{comp.headings_added_count || 0}</span>
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded">
                    <span className="text-[10px] text-slate-400 block">+Images</span>
                    <span className="font-mono font-bold text-purple-300">+{comp.images_added_count || 0}</span>
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded">
                    <span className="text-[10px] text-slate-400 block">+Links</span>
                    <span className="font-mono font-bold text-purple-300">+{comp.links_added_count || 0}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Laboratory Performance Metrics */}
          {metrics && metrics.is_lab_measurement && (
            <div className="bg-slate-950/40 border border-cyan-500/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300 flex items-center gap-1.5 text-xs">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Laboratory Performance Timings
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Browser Execution</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="bg-slate-900 p-2 rounded">
                  <span className="text-[10px] text-slate-400 block">DOMContentLoaded</span>
                  <span className="font-mono text-cyan-400">{metrics.dom_content_loaded_ms ?? 'N/A'}ms</span>
                </div>
                <div className="bg-slate-900 p-2 rounded">
                  <span className="text-[10px] text-slate-400 block">Load Event</span>
                  <span className="font-mono text-cyan-400">{metrics.load_event_ms ?? 'N/A'}ms</span>
                </div>
                <div className="bg-slate-900 p-2 rounded">
                  <span className="text-[10px] text-slate-400 block">Resources</span>
                  <span className="font-mono text-slate-200">{metrics.resource_count ?? 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Metadata Section */}
          <div className="space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            <span className="font-semibold text-slate-200 block text-xs">Metadata</span>
            <div className="space-y-1.5 text-[11px]">
              <div>
                <span className="text-slate-500 block">Title:</span>
                <p className="text-slate-300 font-medium">{page.title || '(None)'}</p>
              </div>
              <div>
                <span className="text-slate-500 block">Meta Description:</span>
                <p className="text-slate-300">{page.meta_description || '(None)'}</p>
              </div>
              <div>
                <span className="text-slate-500 block">Canonical URL:</span>
                <p className="font-mono text-slate-400 truncate">{page.canonical_url || '(None)'}</p>
              </div>
              <div>
                <span className="text-slate-500 block">Meta Robots:</span>
                <p className="font-mono text-slate-400">{page.meta_robots || '(None)'}</p>
              </div>
            </div>
          </div>

          {/* Counts Overview */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg text-center">
              <span className="text-[10px] text-slate-500 uppercase block">Images</span>
              <span className="text-sm font-bold text-slate-200">{page.image_count}</span>
              <span className="text-[10px] text-amber-400/80 block mt-0.5">{page.missing_alt_count} missing alt</span>
            </div>
            <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg text-center">
              <span className="text-[10px] text-slate-500 uppercase block">Internal Links</span>
              <span className="text-sm font-bold text-slate-200">{page.internal_link_count}</span>
            </div>
            <div className="bg-slate-950/40 border border-slate-800 p-2 rounded-lg text-center">
              <span className="text-[10px] text-slate-500 uppercase block">External Links</span>
              <span className="text-sm font-bold text-slate-200">{page.external_link_count}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
