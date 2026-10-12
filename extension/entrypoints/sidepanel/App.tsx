import React, { useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  Play,
  RefreshCw,
  FileText,
  Heading,
  Image as ImageIcon,
  Link2,
  Cpu,
  Layers,
  MapPin,
  KeyRound,
  Bot,
  FileCheck,
  AlertCircle
} from 'lucide-react';

import { Header } from '../../components/layout/Header';
import { BackendIndicator } from '../../components/common/BackendIndicator';
import { QuickAuditSummary } from '../../components/audit/QuickAuditSummary';
import { MetadataSection } from '../../components/audit/MetadataSection';
import { HeadingsSection } from '../../components/audit/HeadingsSection';
import { ImagesSection } from '../../components/audit/ImagesSection';
import { LinksSection } from '../../components/audit/LinksSection';
import { PlaceholderSection } from '../../components/audit/PlaceholderSection';

import { getActiveTab } from '../../services/tab';
import { checkBackendHealth } from '../../services/api';
import { runQuickAudit } from '../../services/auditRunner';
import { getAuditResultForUrl, getLatestAuditResult } from '../../services/storage';
import type { ActiveTabInfo, QuickAuditResult, BackendHealthResponse } from '../../types/audit';

type ActiveTabNav =
  | 'overview'
  | 'metadata'
  | 'headings'
  | 'images'
  | 'links'
  | 'technology'
  | 'technical_seo'
  | 'local_seo'
  | 'keywords'
  | 'ai_search'
  | 'reports';

export default function App() {
  const [tab, setTab] = useState<ActiveTabInfo | null>(null);
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [audit, setAudit] = useState<QuickAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<ActiveTabNav>('overview');

  const refreshTab = useCallback(async () => {
    setError(null);
    const activeTab = await getActiveTab();
    setTab(activeTab);

    if (activeTab.url && activeTab.isAuditable) {
      const stored = await getAuditResultForUrl(activeTab.url);
      setAudit(stored);
    } else {
      const latest = await getLatestAuditResult();
      setAudit(latest);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    const res = await checkBackendHealth();
    setHealth(res);
    setHealthLoading(false);
  }, []);

  useEffect(() => {
    refreshTab();
    refreshHealth();

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const handleActivated = () => refreshTab();
      const handleUpdated = (_id: number, info: { status?: string; url?: string }) => {
        if (info.status === 'complete' || info.url) {
          refreshTab();
        }
      };

      chrome.tabs.onActivated.addListener(handleActivated);
      chrome.tabs.onUpdated.addListener(handleUpdated);

      return () => {
        chrome.tabs.onActivated.removeListener(handleActivated);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
      };
    }
  }, [refreshTab, refreshHealth]);

  const handleQuickAudit = async () => {
    if (!tab?.id || !tab?.url || !tab.isAuditable) return;
    setIsAuditing(true);
    setError(null);

    try {
      const result = await runQuickAudit(tab.id, tab.url);
      setAudit(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAuditing(false);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Sparkles },
    { id: 'metadata', label: 'Metadata', icon: FileText },
    { id: 'headings', label: 'Headings', icon: Heading },
    { id: 'images', label: 'Images', icon: ImageIcon },
    { id: 'links', label: 'Links', icon: Link2 },
    { id: 'technology', label: 'Technology', icon: Cpu, isPlaceholder: true },
    { id: 'technical_seo', label: 'Technical SEO', icon: Layers, isPlaceholder: true },
    { id: 'local_seo', label: 'Local SEO', icon: MapPin, isPlaceholder: true },
    { id: 'keywords', label: 'Keywords', icon: KeyRound, isPlaceholder: true },
    { id: 'ai_search', label: 'AI Readiness', icon: Bot, isPlaceholder: true },
    { id: 'reports', label: 'Reports', icon: FileCheck, isPlaceholder: true },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 antialiased font-sans">
      {/* Top Header */}
      <Header tab={tab} showSidePanelButton={false} />

      {/* Control Bar: Run Audit & Backend Health */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleQuickAudit}
            disabled={!tab?.isAuditable || isAuditing}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center space-x-2 font-semibold text-xs shadow-md transition-all ${
              !tab?.isAuditable
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                : isAuditing
                ? 'bg-cyan-600/80 text-white cursor-wait animate-pulse'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/10'
            }`}
          >
            {isAuditing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Quick Audit...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Run Quick Page Audit</span>
              </>
            )}
          </button>
        </div>

        <BackendIndicator
          health={health}
          loading={healthLoading}
          onRefresh={refreshHealth}
        />
      </div>

      {/* Navigation Pills Bar */}
      <nav className="flex items-center space-x-1 p-2 bg-slate-950 border-b border-slate-800 overflow-x-auto text-xs no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id as ActiveTabNav)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>{item.label}</span>
              {item.isPlaceholder && (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" title="Planned feature"></span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main Content Viewport */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 flex items-start space-x-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: Overview */}
        {activeNav === 'overview' && (
          <div>
            {audit ? (
              <QuickAuditSummary audit={audit} onNavigateTab={(t) => setActiveNav(t as ActiveTabNav)} />
            ) : (
              <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
                <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 text-cyan-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">No Audit Run for this Tab</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Click &quot;Run Quick Page Audit&quot; above to inspect document title, meta tags, heading hierarchy, images, and links on the active page.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Metadata */}
        {activeNav === 'metadata' && (
          <div>
            {audit ? (
              <MetadataSection audit={audit} />
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">Run an audit first to inspect page metadata.</div>
            )}
          </div>
        )}

        {/* Tab 3: Headings */}
        {activeNav === 'headings' && (
          <div>
            {audit ? (
              <HeadingsSection audit={audit} />
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">Run an audit first to inspect headings.</div>
            )}
          </div>
        )}

        {/* Tab 4: Images */}
        {activeNav === 'images' && (
          <div>
            {audit ? (
              <ImagesSection audit={audit} />
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">Run an audit first to inspect images.</div>
            )}
          </div>
        )}

        {/* Tab 5: Links */}
        {activeNav === 'links' && (
          <div>
            {audit ? (
              <LinksSection audit={audit} />
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">Run an audit first to inspect links.</div>
            )}
          </div>
        )}

        {/* Placeholders for Future Phases */}
        {activeNav === 'technology' && (
          <PlaceholderSection
            title="Technology & CMS Detection"
            phase="Phase 3"
            description="Automatic detection of CMS platforms (WordPress, Shopify, Webflow), JavaScript frameworks, server technology, and third-party tracking scripts."
            icon={Cpu}
            features={[
              'CMS and Theme Fingerprinting',
              'Active Plugins and Version Detection',
              'Analytics and Tag Manager Auditing',
              'Server Header and CDN Inspection'
            ]}
          />
        )}

        {activeNav === 'technical_seo' && (
          <PlaceholderSection
            title="Comprehensive Technical SEO"
            phase="Phase 2"
            description="Deep technical analysis including crawlability, robots.txt verification, XML sitemap validation, HTTP response headers, and Core Web Vitals assessment."
            icon={Layers}
            features={[
              'Robots.txt & XML Sitemap Auditing',
              'HTTP Status Code & Redirect Chain Tracing',
              'Core Web Vitals & PageSpeed Integration',
              'Schema.org Structured Data Validator'
            ]}
          />
        )}

        {activeNav === 'local_seo' && (
          <PlaceholderSection
            title="Local SEO & NAP Footprint"
            phase="Phase 2 / Phase 3"
            description="Specialized local optimization audit designed for service-area and storefront businesses."
            icon={MapPin}
            features={[
              'NAP (Name, Address, Phone) Consistency Check',
              'LocalBusiness Schema.org Validation',
              'Google Business Profile Linkage',
              'Geographic Radius & Area Coverage Analysis'
            ]}
          />
        )}

        {activeNav === 'keywords' && (
          <PlaceholderSection
            title="Keyword Research & Content Gaps"
            phase="Phase 4"
            description="On-page keyword density modeling, semantic search coverage, and competitive gap discovery powered by AI."
            icon={KeyRound}
            features={[
              'Primary & Secondary Keyword Extraction',
              'Search Intent Classification',
              'Topic Density & TF-IDF Scoring',
              'Competitor Keyword Gap Identification'
            ]}
          />
        )}

        {activeNav === 'ai_search' && (
          <PlaceholderSection
            title="AI Search Readiness (GEO / AEO / AIO)"
            phase="Phase 4"
            description="Assess your website visibility and answer readiness across Generative Engine Optimization (ChatGPT, Perplexity, Google AI Overviews)."
            icon={Bot}
            features={[
              'Direct Answer Extraction Score',
              'LLM Crawler (GPTBot, PerplexityBot) Access Check',
              'Information Gain & Entity Richness Audit',
              'FAQ & Structured Q&A Optimization'
            ]}
          />
        )}

        {activeNav === 'reports' && (
          <PlaceholderSection
            title="Executive Audit Reports"
            phase="Phase 5"
            description="Export white-label PDF reports, client presentations, and programmatic JSON audit payloads."
            icon={FileCheck}
            features={[
              'Client-Ready White-Label PDF Export',
              'Developer Issue Tracking & Task Lists',
              'Audit Comparison & History Logging',
              'Custom Branding & Color Customization'
            ]}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
        <span>Website Audit Agent &bull; v0.1.0</span>
        <span className="font-mono text-cyan-400">Phase 1 &bull; Task 1.2</span>
      </footer>
    </div>
  );
}