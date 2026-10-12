import React from 'react';
import type { QuickAuditResult } from '../../types/audit';
import { Badge } from '../common/Badge';

interface MetadataSectionProps {
  audit: QuickAuditResult;
}

export const MetadataSection: React.FC<MetadataSectionProps> = ({ audit }) => {
  // Check if canonical URL is truly self-referencing by comparing normalized URLs
  const canonicalCheck = React.useMemo(() => {
    if (!audit.canonicalUrl) {
      return {
        status: 'info' as const,
        meta: 'Missing <link rel="canonical">'
      };
    }
    try {
      const uCur = new URL(audit.url);
      const uCan = new URL(audit.canonicalUrl);
      const pCur = uCur.pathname.replace(/\/+$/, '') || '/';
      const pCan = uCan.pathname.replace(/\/+$/, '') || '/';
      const isSelf = uCur.origin.toLowerCase() === uCan.origin.toLowerCase() &&
                     pCur.toLowerCase() === pCan.toLowerCase() &&
                     uCur.search === uCan.search;
      if (isSelf) {
        return {
          status: 'optimal' as const,
          meta: 'Self-referencing canonical tag (matches page URL)'
        };
      } else {
        return {
          status: 'warning' as const,
          meta: `Points to different URL (${uCan.hostname}${uCan.pathname})`
        };
      }
    } catch {
      const isSelf = audit.canonicalUrl.trim().toLowerCase() === audit.url.trim().toLowerCase();
      return {
        status: isSelf ? ('optimal' as const) : ('warning' as const),
        meta: isSelf ? 'Self-referencing canonical tag' : 'Points to a different URL'
      };
    }
  }, [audit.canonicalUrl, audit.url]);

  const metaRows = [
    {
      label: 'Document Title',
      value: audit.documentTitle,
      status: audit.documentTitle ? (audit.documentTitle.length >= 15 && audit.documentTitle.length <= 65 ? 'optimal' : 'warning') : 'missing',
      meta: audit.documentTitle ? `${audit.documentTitle.length} characters (ideal: 30-60)` : 'Not defined'
    },
    {
      label: 'Meta Description (SEO)',
      value: audit.metaDescription,
      status: audit.metaDescription ? (audit.metaDescription.length >= 50 && audit.metaDescription.length <= 160 ? 'optimal' : 'warning') : 'missing',
      meta: audit.metaDescription ? `${audit.metaDescription.length} characters (ideal: 120-160)` : 'Missing <meta name="description">'
    },
    {
      label: 'Canonical URL',
      value: audit.canonicalUrl,
      status: canonicalCheck.status,
      meta: canonicalCheck.meta
    },
    {
      label: 'Meta Robots Directive',
      value: audit.metaRobots,
      status: audit.metaRobots ? 'info' : 'neutral',
      meta: audit.metaRobots ? 'Directive explicitly set' : 'Defaults to index, follow'
    },
    {
      label: 'HTML Language (lang)',
      value: audit.htmlLang,
      status: audit.htmlLang ? 'optimal' : 'warning',
      meta: audit.htmlLang ? `Declared as "${audit.htmlLang}"` : 'Missing lang attribute on <html>'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
        {metaRows.map((row) => (
          <div key={row.label} className="p-3.5 space-y-1.5 hover:bg-slate-800/30 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">{row.label}</span>
              <Badge
                variant={
                  row.status === 'optimal' ? 'success' :
                  row.status === 'warning' ? 'warning' :
                  row.status === 'missing' ? 'danger' : 'info'
                }
              >
                {row.status}
              </Badge>
            </div>
            <div className="text-xs font-mono text-slate-200 break-all bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
              {row.value || <span className="text-slate-500 italic">Not detected on page</span>}
            </div>
            <div className="text-[11px] text-slate-400">
              {row.meta}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
