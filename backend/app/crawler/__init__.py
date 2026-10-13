"""Secure HTTP Crawling Engine package.

Provides SSRF-protected outbound fetching, DNS pinning, robots.txt compliance,
safe XML sitemap discovery, HTML metadata extraction, and crawl execution.
"""

from app.crawler.policies import CrawlConfig, FetchResult
from app.crawler.scope import CrawlScope
from app.crawler.normalizer import normalize_url
from app.crawler.secure_transport import ValidatedDNSResolver, SSRFSecurityError, create_secure_connector, is_public_ip
from app.crawler.fetcher import SecureHTTPFetcher
from app.crawler.robots import RobotsChecker
from app.crawler.sitemap import SitemapParser
from app.crawler.parser import HTMLPageParser, ParsedPageData
from app.crawler.discovery import CrawlQueue, QueueItem
from app.crawler.engine import CrawlEngine

__all__ = [
    "CrawlConfig",
    "FetchResult",
    "CrawlScope",
    "normalize_url",
    "ValidatedDNSResolver",
    "SSRFSecurityError",
    "create_secure_connector",
    "is_public_ip",
    "SecureHTTPFetcher",
    "RobotsChecker",
    "SitemapParser",
    "HTMLPageParser",
    "ParsedPageData",
    "CrawlQueue",
    "QueueItem",
    "CrawlEngine",
]
