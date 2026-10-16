import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  AlertCircle,
  Globe,
  SlidersHorizontal,
} from 'lucide-react';

import { Header } from '../../components/layout/Header';
import { BackendIndicator } from '../../components/common/BackendIndicator';
import { QuickAuditSummary } from '../../components/audit/QuickAuditSummary';
import { MetadataSection } from '../../components/audit/MetadataSection';
import { HeadingsSection } from '../../components/audit/HeadingsSection';
import { ImagesSection } from '../../components/audit/ImagesSection';
import { LinksSection } from '../../components/audit/LinksSection';
import { PlaceholderSection } from '../../components/audit/PlaceholderSection';
import { FullAuditOverview } from '../../components/audit/FullAuditOverview';
import { FullAuditPagesTable } from '../../components/audit/FullAuditPagesTable';
import { PageDetailsModal } from '../../components/audit/PageDetailsModal';
import { SeoFindingsView } from '../../components/audit/SeoFindingsView';
import { SiteWideIntelligenceView } from '../../components/audit/SiteWideIntelligenceView';
import { SeoHealthDashboard } from '../../components/audit/SeoHealthDashboard';
import { TechnologyDashboard } from '../../components/audit/TechnologyDashboard';

import { getActiveTab } from '../../services/tab';
import {
  checkBackendHealth,
  createAudit,
  startAudit,
  completeAuditAnalysis,
  getAudit,
  getAuditPages,
  cancelAudit,
} from '../../services/api';
import { runQuickAudit } from '../../services/auditRunner';
import {
  getAuditResultForUrl,
  saveActiveFullAuditId,
  getActiveFullAuditId,
  clearActiveFullAuditId,
} from '../../services/storage';
import type {
  ActiveTabInfo,
  QuickAuditResult,
  BackendHealthResponse,
  AuditRecord,
  CrawlPageItem,
} from '../../types/audit';

type AuditModeSelection = 'quick' | 'full';

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
  const [auditMode, setAuditMode] = useState<AuditModeSelection>('quick');
  const [tab, setTab] = useState<ActiveTabInfo | null>(null);
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick Audit State (Local DOM)
  const [quickAudit, setQuickAudit] = useState<QuickAuditResult | null>(null);
  const [isQuickAuditing, setIsQuickAuditing] = useState(false);
  const [activeNav, setActiveNav] = useState<ActiveTabNav>('overview');

  // Full Website Audit State (FastAPI Backend)
  const [fullAudit, setFullAudit] = useState<AuditRecord | null>(null);
  const [pages, setPages] = useState<CrawlPageItem[]>([]);
  const [pagesTotal, setPagesTotal] = useState(0);
  const [pagesCurrentPage, setPagesCurrentPage] = useState(1);
  const [pagesTotalPages, setPagesTotalPages] = useState(0);
  const [selectedPage, setSelectedPage] = useState<CrawlPageItem | null>(null);
  const [fullAuditSubView, setFullAuditSubView] = useState<'health' | 'pages' | 'findings' | 'sitewide' | 'technologies'>('health');
  const [isFullAuditing, setIsFullAuditing] = useState(false);
  const [auditUpdateKey, setAuditUpdateKey] = useState(0);

  const pollingRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);
  const activeAuditIdRef = useRef<string | null>(null);

  // Load Tab & Health
  const refreshTab = useCallback(async () => {
    setError(null);
    const activeTab = await getActiveTab();
    setTab(activeTab);

    if (activeTab.url && activeTab.isAuditable) {
      const existing = await getAuditResultForUrl(activeTab.url);
      setQuickAudit(existing);
    } else {
      setQuickAudit(null);
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

    // Check for saved active full audit and resume polling if still active
    getActiveFullAuditId().then((savedId) => {
      if (savedId) {
        fetchFullAuditState(savedId);
      }
    });

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, [refreshTab, refreshHealth]);

  // Execute Quick Audit (Local)
  const handleRunQuickAudit = async () => {
    if (!tab?.id || !tab.url || !tab.isAuditable) {
      setError(tab?.unsupportedReason || 'Active tab cannot be audited.');
      return;
    }

    setIsQuickAuditing(true);
    setError(null);
    try {
      const res = await runQuickAudit(tab.id, tab.url);
      setQuickAudit(res);
    } catch (err: any) {
      setError(err?.message || 'Quick audit failed.');
    } finally {
      setIsQuickAuditing(false);
    }
  };

  // Full Audit Fetch & Polling
  const fetchFullAuditState = async (auditId: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    activeAuditIdRef.current = auditId;

    try {
      const auditRec = await getAudit(auditId);
      // Discard response if active audit ID changed in between
      if (activeAuditIdRef.current !== auditId) return;

      setFullAudit(auditRec);

      const isRunning = [
        'queued',
        'crawling',
        'analyzing',
        'enriching',
        'generating_recommendations',
      ].includes(auditRec.status);

      setIsFullAuditing(isRunning);

      // Fetch pages
      const pagesRes = await getAuditPages(auditId, pagesCurrentPage, 20);
      if (activeAuditIdRef.current === auditId) {
        setPages(pagesRes.pages || []);
        setPagesTotal(pagesRes.total || 0);
        setPagesTotalPages(pagesRes.total_pages || 0);
      }

      // If active and not yet polling, resume polling
      if (isRunning && !pollingRef.current) {
        startPolling(auditId);
      } else if (!isRunning && pollingRef.current) {
        // Stop polling on terminal state and trigger view refresh
        stopPolling();
        setAuditUpdateKey((prev) => prev + 1);
      }
    } catch (err: any) {
      console.warn('Failed to fetch full audit state:', err);
    } finally {
      isFetchingRef.current = false;
    }
  };

  const startPolling = (auditId: string) => {
    stopPolling();
    activeAuditIdRef.current = auditId;
    pollingRef.current = window.setInterval(() => {
      fetchFullAuditState(auditId);
    }, 2000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleStartFullAudit = async () => {
    if (!tab?.url || !tab.isAuditable) {
      setError('Active tab cannot be audited.');
      return;
    }
    if (health?.status !== 'ok') {
      setError('FastAPI backend service is offline. Please start backend at 127.0.0.1:8000.');
      return;
    }

    setError(null);
    setIsFullAuditing(true);

    try {
      // 1. Create audit record
      const created = await createAudit({
        target_url: tab.url,
        mode: 'full',
        configuration: {
          max_pages: 50,
          render_javascript: 'auto',
        },
      });

      // 2. Start audit job
      await startAudit(created.id);
      await saveActiveFullAuditId(created.id);

      setFullAudit(created);
      startPolling(created.id);
      await fetchFullAuditState(created.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to start full website audit.');
      setIsFullAuditing(false);
    }
  };

  const handleCompleteMissingAnalysis = async () => {
    if (!fullAudit?.id) return;
    setError(null);
    setIsFullAuditing(true);
    try {
      await completeAuditAnalysis(fullAudit.id);
      startPolling(fullAudit.id);
      await fetchFullAuditState(fullAudit.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to complete audit analysis.');
      setIsFullAuditing(false);
    }
  };

  const handleCancelFullAudit = async () => {
    if (!fullAudit) return;
    try {
      await cancelAudit(fullAudit.id);
      await fetchFullAuditState(fullAudit.id);
      stopPolling();
      setIsFullAuditing(false);
      setAuditUpdateKey((prev) => prev + 1);
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel audit.');
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (!fullAudit) return;
    setPagesCurrentPage(newPage);
    try {
      const pagesRes = await getAuditPages(fullAudit.id, newPage, 20);
      setPages(pagesRes.pages || []);
      setPagesTotal(pagesRes.total || 0);
      setPagesTotalPages(pagesRes.total_pages || 0);
    } catch (err) {
      console.warn('Failed to load page:', err);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'metadata', label: 'Metadata', icon: FileText },
    { id: 'headings', label: 'Headings', icon: Heading },
    { id: 'images', label: 'Images', icon: ImageIcon },
    { id: 'links', label: 'Links', icon: Link2 },
    { id: 'technology', label: 'Technology', icon: Cpu, isPlaceholder: true },
    { id: 'technical_seo', label: 'Technical SEO', icon: Layers, isPlaceholder: true },
    { id: 'local_seo', label: 'Local SEO', icon: MapPin, isPlaceholder: true },
    { id: 'keywords', label: 'Keywords', icon: KeyRound, isPlaceholder: true },
    { id: 'ai_search', label: 'AI Search', icon: Bot, isPlaceholder: true },
    { id: 'reports', label: 'Reports', icon: FileCheck, isPlaceholder: true },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Header */}
      <Header tab={tab} />

      {/* Mode Selector Bar: Quick Page Audit vs Full Website Audit */}
      <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setAuditMode('quick')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              auditMode === 'quick'
                ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Quick Page Audit
          </button>
          <button
            onClick={() => setAuditMode('full')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              auditMode === 'full'
                ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Full Website Audit
          </button>
        </div>

        <BackendIndicator
          health={health}
          loading={healthLoading}
          onRefresh={refreshHealth}
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 flex items-start space-x-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* VIEW A: FULL WEBSITE AUDIT */}
      {auditMode === 'full' ? (
        <main className="flex-1 p-4 max-w-4xl mx-auto w-full space-y-4">
          <FullAuditOverview
            audit={fullAudit}
            isRunning={isFullAuditing}
            onStartAudit={handleStartFullAudit}
            onCancelAudit={handleCancelFullAudit}
            onRefresh={() => fullAudit && fetchFullAuditState(fullAudit.id)}
            onCompleteMissingAnalysis={handleCompleteMissingAnalysis}
            targetUrl={tab?.url}
            isBackendOnline={health?.status === 'ok'}
          />

          {/* Sub-view switcher between Health, Pages, SEO Findings, and Sitewide */}
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
            <button
              onClick={() => setFullAuditSubView('health')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                fullAuditSubView === 'health'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              SEO Health & Score
            </button>
            <button
              onClick={() => setFullAuditSubView('pages')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                fullAuditSubView === 'pages'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Crawled Pages ({pagesTotal})
            </button>
            <button
              onClick={() => setFullAuditSubView('findings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                fullAuditSubView === 'findings'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              SEO Rule Findings
            </button>
            <button
              onClick={() => setFullAuditSubView('sitewide')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                fullAuditSubView === 'sitewide'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Site-Wide Intelligence
            </button>
            <button
              onClick={() => setFullAuditSubView('technologies')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                fullAuditSubView === 'technologies'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Technology & CMS
            </button>
          </div>

          {fullAuditSubView === 'health' ? (
            <SeoHealthDashboard
              key={`${fullAudit?.id || 'none'}-${auditUpdateKey}`}
              auditId={fullAudit?.id || null}
              isBackendOnline={health?.status === 'ok'}
              isAuditRunning={isFullAuditing}
              onNavigateToFindings={() => setFullAuditSubView('findings')}
              onNavigateToPages={() => setFullAuditSubView('pages')}
            />
          ) : fullAuditSubView === 'pages' ? (
            <FullAuditPagesTable
              pages={pages}
              total={pagesTotal}
              currentPage={pagesCurrentPage}
              pageSize={20}
              totalPages={pagesTotalPages}
              onPageChange={handlePageChange}
              onSelectPage={(p) => setSelectedPage(p)}
              selectedPageId={selectedPage?.id}
            />
          ) : fullAuditSubView === 'findings' ? (
            <SeoFindingsView
              key={`${fullAudit?.id || 'none'}-${auditUpdateKey}`}
              auditId={fullAudit?.id || null}
              isBackendOnline={health?.status === 'ok'}
              isAuditRunning={isFullAuditing}
            />
          ) : fullAuditSubView === 'sitewide' ? (
            <SiteWideIntelligenceView
              key={`${fullAudit?.id || 'none'}-${auditUpdateKey}`}
              auditId={fullAudit?.id || null}
              isBackendOnline={health?.status === 'ok'}
              isAuditRunning={isFullAuditing}
            />
          ) : (
            <TechnologyDashboard
              key={`${fullAudit?.id || 'none'}-${auditUpdateKey}`}
              auditId={fullAudit?.id || null}
              isBackendOnline={health?.status === 'ok'}
              isAuditRunning={isFullAuditing}
              onSwitchToFullAudit={() => {
                setAuditMode('full');
                setFullAuditSubView('technologies');
              }}
            />
          )}
        </main>
      ) : (
        /* VIEW B: QUICK PAGE AUDIT (Preserved 100%) */
        <>
          {/* Quick Audit Action Bar */}
          <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {quickAudit
                ? `Last local audit: ${new Date(quickAudit.timestamp).toLocaleTimeString()}`
                : 'No local page audit executed yet'}
            </span>

            <button
              onClick={handleRunQuickAudit}
              disabled={isQuickAuditing || !tab?.isAuditable}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                !tab?.isAuditable
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : isQuickAuditing
                  ? 'bg-cyan-500/50 text-slate-950 cursor-wait'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-95'
              }`}
            >
              {isQuickAuditing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Auditing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Quick Audit</span>
                </>
              )}
            </button>
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
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600" title="Planned feature" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Main Content Viewport */}
          <main className="flex-1 p-4 max-w-4xl mx-auto w-full space-y-4">
            {activeNav === 'overview' && (
              <div>
                {quickAudit ? (
                  <QuickAuditSummary audit={quickAudit} onNavigateTab={(t) => setActiveNav(t as ActiveTabNav)} />
                ) : (
                  <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
                    <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 text-cyan-400">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-200">No Audit Run for this Tab</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Click &quot;Run Quick Audit&quot; above to inspect document title, meta tags, heading hierarchy, images, and links on the active page.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeNav === 'metadata' && (
              <div>
                {quickAudit ? (
                  <MetadataSection audit={quickAudit} />
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500">Run an audit first to inspect page metadata.</div>
                )}
              </div>
            )}

            {activeNav === 'headings' && (
              <div>
                {quickAudit ? (
                  <HeadingsSection audit={quickAudit} />
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500">Run an audit first to inspect headings.</div>
                )}
              </div>
            )}

            {activeNav === 'images' && (
              <div>
                {quickAudit ? (
                  <ImagesSection audit={quickAudit} />
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500">Run an audit first to inspect images.</div>
                )}
              </div>
            )}

            {activeNav === 'links' && (
              <div>
                {quickAudit ? (
                  <LinksSection audit={quickAudit} />
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500">Run an audit first to inspect links.</div>
                )}
              </div>
            )}

            {/* Quick Mode Technology Navigation: Prompts Full Website Audit */}
            {activeNav === 'technology' && (
              <div className="p-4 space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
                  <div className="w-12 h-12 bg-cyan-950/60 border border-cyan-800/60 rounded-xl flex items-center justify-center mx-auto mb-3 text-cyan-400">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-100">Technology & CMS Detection</h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                    Technology fingerprinting analyzes multi-page crawl headers, DOM signatures, WordPress themes, plugins, and frontend/backend frameworks across your entire site.
                  </p>
                  <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col items-center">
                    <p className="text-xs text-slate-400 mb-3">
                      To run technology detection with full evidence, switch to a <strong className="text-slate-200">Full Website Audit</strong>.
                    </p>
                    <button
                      onClick={() => {
                        setAuditMode('full');
                        setFullAuditSubView('technologies');
                      }}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      <span>Switch to Full Website Audit</span>
                    </button>
                  </div>
                </div>
              </div>
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
        </>
      )}

      {/* Page Details Modal */}
      {selectedPage && (
        <PageDetailsModal
          page={selectedPage}
          onClose={() => setSelectedPage(null)}
        />
      )}

      {/* Footer */}
      <footer className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
        <span>Website Audit Agent &bull; v2.3.0</span>
        <span className="font-mono text-cyan-400">Automated Audit Engine</span>
      </footer>
    </div>
  );
}
