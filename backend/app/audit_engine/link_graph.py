"""Deterministic internal link graph construction and topological analysis."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

from app.database.models import CrawlLink, CrawlPage


def normalize_graph_url(url: str) -> str:
    """Normalize URL string for consistent node identity in the link graph."""
    if not url:
        return ""
    parsed = urlparse(url.strip())
    # Strip fragment and lowercase scheme/host
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/") if parsed.path != "/" else "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{parsed.scheme.lower()}://{netloc}{path}{query}"


@dataclass
class LinkEdge:
    """Observed directed hyperlink between two URLs."""

    source_url: str
    destination_url: str
    link_text: str = ""
    source_page_id: str = ""


@dataclass
class PageNodeMetrics:
    """Topological metrics for an individual page node in the crawl graph."""

    url: str
    page_id: str
    depth: int
    http_status: Optional[int]
    inbound_unique_pages: int
    outbound_unique_pages: int
    total_inbound_links: int
    is_sitemap_only: bool
    is_seed: bool = False
    broken_outlinks_count: int = 0
    redirect_outlinks_count: int = 0

    @property
    def inbound_internal_count(self) -> int:
        return self.inbound_unique_pages

    @property
    def outbound_internal_count(self) -> int:
        return self.outbound_unique_pages

    @property
    def crawl_depth(self) -> int:
        return self.depth


class InternalLinkGraph:
    """Deterministic directed graph of observed internal hyperlinks."""

    def __init__(
        self,
        pages: List[CrawlPage],
        links: List[CrawlLink],
        sitemap_urls: Optional[Set[str]] = None,
        seed_url: Optional[str] = None,
    ) -> None:
        self.pages = pages
        self.links = links
        self.sitemap_urls = {normalize_graph_url(u) for u in (sitemap_urls or set()) if u}
        self.seed_url = normalize_graph_url(seed_url) if seed_url else ""

        # Index pages by normalized URL
        self.url_to_page: Dict[str, CrawlPage] = {}
        for p in pages:
            if p.final_url:
                self.url_to_page[normalize_graph_url(p.final_url)] = p
            if p.requested_url:
                self.url_to_page[normalize_graph_url(p.requested_url)] = p

        # Graph adjacency:
        self.inbound_sources: Dict[str, Set[str]] = {}
        self.outbound_destinations: Dict[str, Set[str]] = {}
        self.inbound_edges: Dict[str, List[LinkEdge]] = {}
        self.outbound_edges: Dict[str, List[LinkEdge]] = {}

        # Broken / redirect tracking
        self.broken_4xx_links: List[Tuple[CrawlPage, LinkEdge, CrawlPage]] = []
        self.broken_5xx_links: List[Tuple[CrawlPage, LinkEdge, CrawlPage]] = []
        self.redirect_links: List[Tuple[CrawlPage, LinkEdge, CrawlPage]] = []

        self._build_graph()

    @classmethod
    def from_crawl(
        cls,
        pages: List[CrawlPage],
        links: List[CrawlLink],
        sitemap_urls: Optional[Set[str]] = None,
        seed_url: Optional[str] = None,
    ) -> "InternalLinkGraph":
        """Factory constructor for creating graph from crawl records."""
        return cls(pages=pages, links=links, sitemap_urls=sitemap_urls, seed_url=seed_url)

    def _build_graph(self) -> None:
        # Initialize nodes for all crawled pages
        for p in self.pages:
            norm = normalize_graph_url(p.final_url or p.requested_url)
            self.inbound_sources.setdefault(norm, set())
            self.outbound_destinations.setdefault(norm, set())
            self.inbound_edges.setdefault(norm, [])
            self.outbound_edges.setdefault(norm, [])

        # Process observed links
        for link in self.links:
            if not getattr(link, "internal", True):
                continue

            # Look up source page either by source_page_id or source_url
            src_page = None
            if getattr(link, "source_page_id", None):
                src_page = next((p for p in self.pages if str(p.id) == str(link.source_page_id)), None)
            if not src_page and getattr(link, "source_url", None):
                src_page = self.url_to_page.get(normalize_graph_url(link.source_url))

            if not src_page:
                continue

            src_norm = normalize_graph_url(src_page.final_url or src_page.requested_url)
            dest_raw = getattr(link, "destination_url", None) or getattr(link, "target_url", None)
            dest_norm = normalize_graph_url(dest_raw) if dest_raw else ""

            if not src_norm or not dest_norm:
                continue

            edge = LinkEdge(
                source_url=src_norm,
                destination_url=dest_norm,
                link_text=getattr(link, "link_text", "") or "",
                source_page_id=str(src_page.id),
            )

            # Record adjacency
            self.outbound_destinations.setdefault(src_norm, set()).add(dest_norm)
            self.outbound_edges.setdefault(src_norm, []).append(edge)

            self.inbound_sources.setdefault(dest_norm, set()).add(src_norm)
            self.inbound_edges.setdefault(dest_norm, []).append(edge)

            # Check destination HTTP status if visited during crawl
            dest_page = self.url_to_page.get(dest_norm)
            if dest_page and dest_page.http_status:
                if 400 <= dest_page.http_status < 500:
                    self.broken_4xx_links.append((src_page, edge, dest_page))
                elif 500 <= dest_page.http_status < 600:
                    self.broken_5xx_links.append((src_page, edge, dest_page))
                elif 300 <= dest_page.http_status < 400:
                    self.redirect_links.append((src_page, edge, dest_page))

    def get_metrics(self, url: str) -> PageNodeMetrics:
        """Get topological metrics for a page URL."""
        norm = normalize_graph_url(url)
        page = self.url_to_page.get(norm)
        page_id = str(page.id) if page else ""
        depth = page.depth if page else 0
        http_status = page.http_status if page else None

        inbound_srcs = self.inbound_sources.get(norm, set())
        outbound_dests = self.outbound_destinations.get(norm, set())
        total_in = len(self.inbound_edges.get(norm, []))

        is_seed = (norm == self.seed_url) or (depth == 0)

        # Sitemap-only candidate: present in sitemap, but 0 observed inlinks and not the seed
        is_sitemap_only = norm in self.sitemap_urls and len(inbound_srcs) == 0 and not is_seed

        broken_out = sum(
            1 for (sp, e, dp) in (self.broken_4xx_links + self.broken_5xx_links)
            if normalize_graph_url(sp.final_url or sp.requested_url) == norm
        )
        redirect_out = sum(
            1 for (sp, e, dp) in self.redirect_links
            if normalize_graph_url(sp.final_url or sp.requested_url) == norm
        )

        return PageNodeMetrics(
            url=norm,
            page_id=page_id,
            depth=depth,
            http_status=http_status,
            inbound_unique_pages=len(inbound_srcs),
            outbound_unique_pages=len(outbound_dests),
            total_inbound_links=total_in,
            is_sitemap_only=is_sitemap_only,
            is_seed=is_seed,
            broken_outlinks_count=broken_out,
            redirect_outlinks_count=redirect_out,
        )

    def get_node(self, url: str) -> Optional[PageNodeMetrics]:
        """Lookup node metrics by URL."""
        return self.get_metrics(url)

    @property
    def nodes(self) -> Dict[str, PageNodeMetrics]:
        """Dictionary of all graph nodes indexed by normalized URL."""
        return {
            normalize_graph_url(p.final_url or p.requested_url): self.get_metrics(p.final_url or p.requested_url)
            for p in self.pages
        }

    def get_summary(self) -> Dict[str, Any]:
        """Summary metrics across the internal link topology."""
        total_nodes = len(self.pages)
        total_internal_edges = sum(len(edges) for edges in self.outbound_edges.values())
        unique_internal_destinations = len(self.inbound_sources)

        orphan_candidates = [
            p for p in self.pages
            if (p.depth > 0 or normalize_graph_url(p.final_url or p.requested_url) != self.seed_url)
            and len(self.inbound_sources.get(normalize_graph_url(p.final_url or p.requested_url), set())) == 0
        ]

        low_inlink_candidates = [
            p for p in self.pages
            if (p.depth > 0 or normalize_graph_url(p.final_url or p.requested_url) != self.seed_url)
            and len(self.inbound_sources.get(normalize_graph_url(p.final_url or p.requested_url), set())) == 1
        ]

        max_depth = max((p.depth for p in self.pages), default=0)
        sitemap_only_cnt = sum(1 for n in self.nodes.values() if n.is_sitemap_only)

        return {
            "total_nodes": total_nodes,
            "total_pages": total_nodes,
            "total_internal_edges": total_internal_edges,
            "total_internal_links": total_internal_edges,
            "unique_destinations": unique_internal_destinations,
            "orphan_count": len(orphan_candidates),
            "orphan_candidates_count": len(orphan_candidates),
            "low_inlink_count": len(low_inlink_candidates),
            "low_inlink_candidates_count": len(low_inlink_candidates),
            "broken_link_destinations": len(self.broken_4xx_links) + len(self.broken_5xx_links),
            "broken_4xx_links_count": len(self.broken_4xx_links),
            "broken_5xx_links_count": len(self.broken_5xx_links),
            "redirect_destinations": len(self.redirect_links),
            "redirect_links_count": len(self.redirect_links),
            "max_crawl_depth": max_depth,
            "sitemap_only_count": sitemap_only_cnt,
            "crawl_completeness_caveat": "Observed crawl graph is sampled; pages not discovered during crawl may have links not captured here.",
        }
