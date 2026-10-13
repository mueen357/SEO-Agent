"""Safe XML Sitemap discovery and parsing engine using defusedxml."""

from dataclasses import dataclass
import gzip
import logging
from typing import Any
from urllib.parse import urlsplit
import defusedxml.ElementTree as ET

from app.crawler.fetcher import SecureHTTPFetcher
from app.crawler.normalizer import normalize_url
from app.crawler.policies import CrawlConfig
from app.crawler.scope import CrawlScope

logger = logging.getLogger(__name__)


@dataclass
class SitemapResult:
    """Discovered sitemap metadata and URLs."""

    sitemap_url: str
    status: str  # success, fetch_error, parse_error
    url_count: int
    error_message: str | None = None
    discovered_urls: list[str] = None

    def __post_init__(self):
        if self.discovered_urls is None:
            self.discovered_urls = []


class SitemapParser:
    """Parses XML sitemaps and sitemap indexes safely."""

    def __init__(
        self,
        fetcher: SecureHTTPFetcher,
        scope: CrawlScope,
        config: CrawlConfig,
    ) -> None:
        self._fetcher = fetcher
        self._scope = scope
        self._config = config

    async def discover_sitemaps(
        self, robots_sitemaps: list[str]
    ) -> tuple[list[str], list[SitemapResult]]:
        """Discover and parse sitemaps from robots.txt and standard locations."""
        if not self._config.parse_sitemaps:
            return [], []

        candidates = list(robots_sitemaps)
        # Add conventional sitemap locations
        default_xml = f"{self._scope.scheme}://{self._scope.target_host}/sitemap.xml"
        default_index = f"{self._scope.scheme}://{self._scope.target_host}/sitemap_index.xml"
        for loc in (default_xml, default_index):
            if loc not in candidates:
                candidates.append(loc)

        all_urls: list[str] = []
        sitemap_records: list[SitemapResult] = []
        visited_sitemaps: set[str] = set()

        for sitemap_url in candidates:
            if len(visited_sitemaps) >= self._config.max_sitemaps:
                break
            await self._crawl_sitemap_recursive(
                sitemap_url,
                depth=0,
                visited_sitemaps=visited_sitemaps,
                all_urls=all_urls,
                sitemap_records=sitemap_records,
            )

        # Deduplicate discovered URLs while preserving order
        unique_urls = list(dict.fromkeys(all_urls))[: self._config.max_sitemap_urls]
        return unique_urls, sitemap_records

    async def _crawl_sitemap_recursive(
        self,
        sitemap_url: str,
        depth: int,
        visited_sitemaps: set[str],
        all_urls: list[str],
        sitemap_records: list[SitemapResult],
    ) -> None:
        if depth > 3 or sitemap_url in visited_sitemaps:
            return
        if len(visited_sitemaps) >= self._config.max_sitemaps:
            return

        visited_sitemaps.add(sitemap_url)

        # Enforce scope check on sitemap URL itself
        if not self._scope.is_in_scope(sitemap_url):
            sitemap_records.append(
                SitemapResult(
                    sitemap_url=sitemap_url,
                    status="fetch_error",
                    url_count=0,
                    error_message="Sitemap URL is outside crawl scope",
                )
            )
            return

        res = await self._fetcher.fetch(sitemap_url, self._scope, self._config)
        if res.fetch_status != "success" or not res.body:
            sitemap_records.append(
                SitemapResult(
                    sitemap_url=sitemap_url,
                    status="fetch_error",
                    url_count=0,
                    error_message=res.error_message or f"HTTP {res.http_status}",
                )
            )
            return

        content = res.body
        # Handle gzip compressed sitemaps (.xml.gz)
        if sitemap_url.endswith(".gz") or content.startswith(b"\x1f\x8b"):
            try:
                content = gzip.decompress(content)
            except Exception as e:
                sitemap_records.append(
                    SitemapResult(
                        sitemap_url=sitemap_url,
                        status="parse_error",
                        url_count=0,
                        error_message=f"Gzip decompression failed: {e}",
                    )
                )
                return

        try:
            # Safe XML parsing with defusedxml (immune to XML bomb / XXE)
            root = ET.fromstring(content)
        except Exception as e:
            sitemap_records.append(
                SitemapResult(
                    sitemap_url=sitemap_url,
                    status="parse_error",
                    url_count=0,
                    error_message=f"XML parsing failed: {e}",
                )
            )
            return

        tag_name = root.tag.split("}")[-1].lower() if "}" in root.tag else root.tag.lower()

        # Case 1: Sitemap Index (<sitemapindex><sitemap><loc>...</loc></sitemap></sitemapindex>)
        if tag_name == "sitemapindex":
            nested_sitemaps: list[str] = []
            for elem in root:
                elem_tag = elem.tag.split("}")[-1].lower() if "}" in elem.tag else elem.tag.lower()
                if elem_tag == "sitemap":
                    for child in elem:
                        child_tag = child.tag.split("}")[-1].lower() if "}" in child.tag else child.tag.lower()
                        if child_tag == "loc" and child.text:
                            loc = child.text.strip()
                            if loc and self._scope.is_in_scope(loc):
                                nested_sitemaps.append(loc)

            sitemap_records.append(
                SitemapResult(
                    sitemap_url=sitemap_url,
                    status="success",
                    url_count=len(nested_sitemaps),
                )
            )

            for nested_url in nested_sitemaps:
                if len(visited_sitemaps) >= self._config.max_sitemaps:
                    break
                await self._crawl_sitemap_recursive(
                    nested_url,
                    depth + 1,
                    visited_sitemaps,
                    all_urls,
                    sitemap_records,
                )

        # Case 2: URL Set (<urlset><url><loc>...</loc></url></urlset>)
        elif tag_name == "urlset":
            extracted_urls: list[str] = []
            for elem in root:
                elem_tag = elem.tag.split("}")[-1].lower() if "}" in elem.tag else elem.tag.lower()
                if elem_tag == "url":
                    for child in elem:
                        child_tag = child.tag.split("}")[-1].lower() if "}" in child.tag else child.tag.lower()
                        if child_tag == "loc" and child.text:
                            raw_url = child.text.strip()
                            norm = normalize_url(raw_url)
                            if norm and self._scope.is_in_scope(norm):
                                extracted_urls.append(norm)

            all_urls.extend(extracted_urls)
            sitemap_records.append(
                SitemapResult(
                    sitemap_url=sitemap_url,
                    status="success",
                    url_count=len(extracted_urls),
                    discovered_urls=extracted_urls,
                )
            )
        else:
            sitemap_records.append(
                SitemapResult(
                    sitemap_url=sitemap_url,
                    status="parse_error",
                    url_count=0,
                    error_message=f"Unknown XML root element '{tag_name}'",
                )
            )
