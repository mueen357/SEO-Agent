import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, FileText, Image as ImageIcon, Link as LinkIcon, Heading } from 'lucide-react';
import type { QuickAuditResult } from '../../types/audit';
import { Badge } from '../common/Badge';

interface QuickAuditSummaryProps {
  audit: QuickAuditResult;
  onNavigateTab?: (tab: string) => void;
}

export const QuickAuditSummary: React.FC<QuickAuditSummaryProps> = ({ audit, onNavigateTab }) => {
  const criticalCount = audit.findings.filter(f => f.severity === 'critical').length;
  const warningCount = audit.findings.filter(f => f.severity === 'warning').length;
  const goodCount = audit.findings.filter(f => f.severity === 'good').length;

  const getSeverityIcon = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'good':
        return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  const getSeverityVariant = (sev: string): 'danger' | 'warning' | 'success' | 'info' => {
    switch (sev) {
      case 'critical': return 'danger';
      case 'warning': return 'warning';
      case 'good': return 'success';
      default: return 'info';
    }
  };

  return (
    <div className="space-y-5">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => onNavigateTab?.('metadata')}
          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Metadata</span>
            <FileText className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-bold text-slate-100">
            {audit.documentTitle ? 'Defined' : 'Missing'}
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {audit.documentTitle ? `${audit.documentTitle.length} chars` : 'No title'}
          </p>
        </div>

        <div
          onClick={() => onNavigateTab?.('headings')}
          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Headings</span>
            <Heading className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-slate-100">
            {audit.headings.totalCount}
          </div>
          <p className="text-[11px] text-slate-400">
            {audit.headings.h1Count} H1 &bull; {audit.headings.h2Count} H2
          </p>
        </div>

        <div
          onClick={() => onNavigateTab?.('images')}
          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Images</span>
            <ImageIcon className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-slate-100">
            {audit.images.totalCount}
          </div>
          <p className="text-[11px] text-slate-400">
            {audit.images.missingAltCount > 0 ? (
              <span className="text-amber-400">{audit.images.missingAltCount} missing alt</span>
            ) : (
              'All have alt'
            )}
          </p>
        </div>

        <div
          onClick={() => onNavigateTab?.('links')}
          className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Hyperlinks</span>
            <LinkIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-slate-100">
            {audit.links.totalCount}
          </div>
          <p className="text-[11px] text-slate-400">
            {audit.links.internalCount} int &bull; {audit.links.externalCount} ext
          </p>
        </div>
      </div>

      {/* Findings Summary Header */}
      <div className="flex items-center justify-between pt-1">
        <h3 className="text-sm font-semibold text-slate-200">Preliminary Findings</h3>
        <div className="flex items-center space-x-2">
          {criticalCount > 0 && <Badge variant="danger">{criticalCount} Critical</Badge>}
          {warningCount > 0 && <Badge variant="warning">{warningCount} Warnings</Badge>}
          <Badge variant="success">{goodCount} Passed</Badge>
        </div>
      </div>

      {/* Findings List */}
      <div className="space-y-2.5">
        {audit.findings.map((finding) => (
          <div
            key={finding.id}
            className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 hover:border-slate-700 transition-colors space-y-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center space-x-2">
                {getSeverityIcon(finding.severity)}
                <span className="text-xs font-semibold text-slate-100">{finding.title}</span>
              </div>
              <Badge variant={getSeverityVariant(finding.severity)}>
                {finding.severity.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-6">
              {finding.description}
            </p>
            {finding.recommendation && (
              <p className="text-[11px] text-cyan-300/90 pl-6 pt-0.5">
                <span className="font-semibold text-cyan-400">Action: </span>
                {finding.recommendation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};