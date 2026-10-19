/**
 * Bounded, In-Browser Internal Link Graph Construction and Topological Analysis.
 * 100% Client-Side MV3 Compatible. Parallels backend InternalLinkGraph semantics.
 */

import type {
  StandaloneCrawlPage,
  StandaloneLinkEdge,
  StandalonePageNodeMetrics,
  StandaloneLinkGraphSummary,
  ObservedUrlStatus,
} from '../types';

/**
 * Normalizes URL string for consistent node identity in the link graph.
 * Strips fragments, lowercases protocol and hostname, trims trailing slash (except root), preserves search query.
 */
export function normalizeGraphUrl(rawUrl: string, baseOrigin?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const u = baseOrigin ? new URL(rawUrl, baseOrigin) : new URL(rawUrl);
    // Strip credentials
    u.username = '';
    u.password = '';
    // Strip fragment/hash
    u.hash = '';
    const protocol = u.protocol.toLowerCase();
    const host = u.host.toLowerCase();
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '') || '/';
    }
    const search = u.search || '';
    return `${protocol}//${host}${pathname}${search}`;
  } catch {
    const raw = String(rawUrl || '').trim();
    const hashSplit = raw.split('#')[0] ?? '';
    return hashSplit.replace(/\/+$/, '').toLowerCase();
  }
}

export class StandaloneInternalLinkGraph {
  public readonly pages: StandaloneCrawlPage[];
  public readonly sitemapUrls: Set<string>;
  public readonly seedUrl: string;

  // Index pages by normalized URL
  public readonly urlToPage = new Map<string, StandaloneCrawlPage>();

  // Graph adjacency
  public readonly inboundSources = new Map<string, Set<string>>();
  public readonly outboundDestinations = new Map<string, Set<string>>();
  public readonly inboundEdges = new Map<string, StandaloneLinkEdge[]>();
  public readonly outboundEdges = new Map<string, StandaloneLinkEdge[]>();

  // Broken / redirect tracking
  public readonly broken4xxLinks: Array<{ sourcePage: StandaloneCrawlPage; edge: StandaloneLinkEdge; destPage?: StandaloneCrawlPage; observedStatus?: ObservedUrlStatus }> = [];
  public readonly broken5xxLinks: Array<{ sourcePage: StandaloneCrawlPage; edge: StandaloneLinkEdge; destPage?: StandaloneCrawlPage; observedStatus?: ObservedUrlStatus }> = [];
  public readonly redirectLinks: Array<{ sourcePage: StandaloneCrawlPage; edge: StandaloneLinkEdge; destPage?: StandaloneCrawlPage; observedStatus?: ObservedUrlStatus }> = [];

  constructor(
    pages: StandaloneCrawlPage[],
    sitemapUrls?: Iterable<string>,
    seedUrl?: string,
    observedUrlMap?: Map<string, ObservedUrlStatus>
  ) {
    this.pages = pages;
    this.sitemapUrls = new Set<string>();
    if (sitemapUrls) {
      for (const u of sitemapUrls) {
        if (u) this.sitemapUrls.add(normalizeGraphUrl(u));
      }
    }
    this.seedUrl = seedUrl ? normalizeGraphUrl(seedUrl) : '';

    // Index all crawled pages by normalized representations
    for (const p of pages) {
      if (p.url) {
        this.urlToPage.set(normalizeGraphUrl(p.url), p);
      }
      if (p.finalUrl) {
        this.urlToPage.set(normalizeGraphUrl(p.finalUrl), p);
      }
      if (p.requestedUrl) {
        this.urlToPage.set(normalizeGraphUrl(p.requestedUrl), p);
      }
    }

    this.buildGraph(observedUrlMap);
  }

  private buildGraph(observedUrlMap?: Map<string, ObservedUrlStatus>): void {
    // 1. Initialize node entries for all crawled pages
    for (const p of this.pages) {
      const norm = normalizeGraphUrl(p.finalUrl || p.requestedUrl || p.url);
      if (!this.inboundSources.has(norm)) this.inboundSources.set(norm, new Set());
      if (!this.outboundDestinations.has(norm)) this.outboundDestinations.set(norm, new Set());
      if (!this.inboundEdges.has(norm)) this.inboundEdges.set(norm, []);
      if (!this.outboundEdges.has(norm)) this.outboundEdges.set(norm, []);
    }

    // 2. Process observed outbound hyperlinks from each crawled page
    for (const srcPage of this.pages) {
      const srcNorm = normalizeGraphUrl(srcPage.finalUrl || srcPage.requestedUrl || srcPage.url);
      if (!srcNorm) continue;

      // Extract links from parsed evidence if available, falling back to page.links
      const rawLinksDetailed = srcPage.evidence?.linksDetailed;
      const rawLinks = srcPage.links || [];

      const candidateLinks: Array<{ href: string; text?: string }> = [];

      if (rawLinksDetailed && rawLinksDetailed.length > 0) {
        for (const item of rawLinksDetailed) {
          if (item && item.href && (item.isInternal ?? true)) {
            candidateLinks.push({ href: item.href, text: item.text });
          }
        }
      } else if (rawLinks.length > 0) {
        for (const href of rawLinks) {
          if (href) {
            candidateLinks.push({ href });
          }
        }
      }

      // Track destinations seen on THIS source page to deduplicate repeated links from same page
      const seenOnThisPage = new Set<string>();

      for (const link of candidateLinks) {
        const destNorm = normalizeGraphUrl(link.href, srcPage.url);
        if (!destNorm) continue;

        // Skip self-links for inlink/outlink topology
        if (destNorm === srcNorm) continue;

        // Security / Scope filter: internal graph only connects within current seed origin scope
        try {
          const destOrigin = new URL(destNorm).origin;
          const srcOrigin = new URL(srcNorm).origin;
          if (destOrigin !== srcOrigin) continue;
        } catch {
          continue;
        }

        const edge: StandaloneLinkEdge = {
          sourceUrl: srcNorm,
          destinationUrl: destNorm,
          linkText: (link.text || '').trim(),
          sourcePageId: srcPage.id,
        };

        // Record adjacency
        if (!this.outboundDestinations.has(srcNorm)) this.outboundDestinations.set(srcNorm, new Set());
        this.outboundDestinations.get(srcNorm)!.add(destNorm);

        if (!this.outboundEdges.has(srcNorm)) this.outboundEdges.set(srcNorm, []);
        this.outboundEdges.get(srcNorm)!.push(edge);

        if (!this.inboundSources.has(destNorm)) this.inboundSources.set(destNorm, new Set());
        this.inboundSources.get(destNorm)!.add(srcNorm);

        if (!this.inboundEdges.has(destNorm)) this.inboundEdges.set(destNorm, []);
        this.inboundEdges.get(destNorm)!.push(edge);

        // Check destination status if visited or observed during crawl
        // Avoid duplicate anomaly records if this page repeats the same link
        if (!seenOnThisPage.has(destNorm)) {
          seenOnThisPage.add(destNorm);

          const destPage = this.urlToPage.get(destNorm);
          const observedStatus = observedUrlMap?.get(destNorm);

          // Check for redirect: either from observed redirect hop status or from destPage 3xx status
          const isRedirect =
            observedStatus?.isRedirect ||
            (observedStatus?.redirectStatus && observedStatus.redirectStatus >= 300 && observedStatus.redirectStatus < 400) ||
            (destPage?.httpStatus && destPage.httpStatus >= 300 && destPage.httpStatus < 400);

          if (isRedirect) {
            this.redirectLinks.push({
              sourcePage: srcPage,
              edge,
              destPage,
              observedStatus,
            });
          } else if (
            (destPage?.httpStatus && destPage.httpStatus >= 400 && destPage.httpStatus < 500) ||
            (observedStatus?.httpStatus && observedStatus.httpStatus >= 400 && observedStatus.httpStatus < 500)
          ) {
            this.broken4xxLinks.push({
              sourcePage: srcPage,
              edge,
              destPage,
              observedStatus,
            });
          } else if (
            (destPage?.httpStatus && destPage.httpStatus >= 500 && destPage.httpStatus < 600) ||
            (observedStatus?.httpStatus && observedStatus.httpStatus >= 500 && observedStatus.httpStatus < 600)
          ) {
            this.broken5xxLinks.push({
              sourcePage: srcPage,
              edge,
              destPage,
              observedStatus,
            });
          }
        }
      }
    }
  }

  public getMetrics(url: string): StandalonePageNodeMetrics {
    const norm = normalizeGraphUrl(url);
    const page = this.urlToPage.get(norm);
    const pageId = page?.id || '';
    const depth = page?.depth ?? 0;
    const httpStatus = page?.httpStatus;

    const inboundSrcs = this.inboundSources.get(norm) || new Set<string>();
    const outboundDests = this.outboundDestinations.get(norm) || new Set<string>();
    const totalIn = (this.inboundEdges.get(norm) || []).length;

    const isSeed = (norm === this.seedUrl) || (norm === normalizeGraphUrl(this.seedUrl)) || (page && page === this.pages[0]);
    const isSitemapOnly = this.sitemapUrls.has(norm) && inboundSrcs.size === 0 && !isSeed;

    const brokenOut = (this.broken4xxLinks.length + this.broken5xxLinks.length > 0)
      ? [...this.broken4xxLinks, ...this.broken5xxLinks].filter(
          (item) => normalizeGraphUrl(item.sourcePage.finalUrl || item.sourcePage.requestedUrl || item.sourcePage.url) === norm
        ).length
      : 0;

    const redirectOut = (this.redirectLinks.length > 0)
      ? this.redirectLinks.filter(
          (item) => normalizeGraphUrl(item.sourcePage.finalUrl || item.sourcePage.requestedUrl || item.sourcePage.url) === norm
        ).length
      : 0;

    return {
      url: norm,
      pageId,
      depth,
      httpStatus,
      inboundUniquePages: inboundSrcs.size,
      outboundUniquePages: outboundDests.size,
      totalInboundLinks: totalIn,
      isSitemapOnly,
      isSeed: Boolean(isSeed),
      brokenOutlinksCount: brokenOut,
      redirectOutlinksCount: redirectOut,
    };
  }

  public getSummary(auditId: string = ''): StandaloneLinkGraphSummary {
    const totalNodes = this.pages.length;
    let totalInternalEdges = 0;
    for (const edges of this.outboundEdges.values()) {
      totalInternalEdges += edges.length;
    }

    const uniqueDestinations = this.inboundSources.size;

    const orphanCandidates = this.pages.filter((p) => {
      const norm = normalizeGraphUrl(p.finalUrl || p.requestedUrl || p.url);
      const isSeed = (norm === this.seedUrl) || (norm === normalizeGraphUrl(this.seedUrl)) || (p === this.pages[0]);
      return !isSeed && (this.inboundSources.get(norm)?.size ?? 0) === 0;
    });

    const lowInlinkCandidates = this.pages.filter((p) => {
      const norm = normalizeGraphUrl(p.finalUrl || p.requestedUrl || p.url);
      const isSeed = (norm === this.seedUrl) || (norm === normalizeGraphUrl(this.seedUrl)) || (p === this.pages[0]);
      return !isSeed && (this.inboundSources.get(norm)?.size ?? 0) === 1;
    });

    const maxCrawlDepth = this.pages.reduce((max, p) => Math.max(max, p.depth ?? 0), 0);

    const nodesList = this.pages.map((p) => this.getMetrics(p.finalUrl || p.requestedUrl || p.url));
    const sitemapOnlyCount = nodesList.filter((n) => n.isSitemapOnly).length;

    const orphanUrls = orphanCandidates.map((p) => p.finalUrl || p.requestedUrl || p.url);
    const lowInlinkUrls = lowInlinkCandidates.map((p) => p.finalUrl || p.requestedUrl || p.url);
    const deepCrawlUrls = this.pages
      .filter((p) => (p.depth ?? 0) >= 4)
      .map((p) => p.finalUrl || p.requestedUrl || p.url);

    return {
      auditId,
      totalNodes,
      totalInternalEdges,
      totalInternalPages: totalNodes,
      totalInternalLinks: totalInternalEdges,
      uniqueDestinations,
      orphanCount: orphanCandidates.length,
      lowInlinkCount: lowInlinkCandidates.length,
      brokenLinkDestinations: this.broken4xxLinks.length + this.broken5xxLinks.length,
      redirectDestinations: this.redirectLinks.length,
      maxCrawlDepth,
      sitemapOnlyCount,
      crawlCompletenessCaveat: 'Observed crawl graph is sampled; pages not discovered during crawl may have links not captured here.',
      nodes: nodesList,
      orphanPages: orphanUrls,
      lowInlinkPages: lowInlinkUrls,
      deepCrawlPages: deepCrawlUrls,
      redirectLinks: this.redirectLinks.map((r) => r.edge),
    };
  }
}
