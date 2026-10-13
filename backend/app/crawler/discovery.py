"""Crawl queue management and URL discovery deduplication."""

from collections import deque
from dataclasses import dataclass
from typing import Any

from app.crawler.policies import CrawlConfig
from app.crawler.scope import CrawlScope


@dataclass
class QueueItem:
    """An item queued for crawling."""

    url: str
    depth: int
    source_url: str | None = None


class CrawlQueue:
    """FIFO queue managing URL discovery, depth tracking, and deduplication."""

    def __init__(self, scope: CrawlScope, config: CrawlConfig) -> None:
        self._scope = scope
        self._config = config
        self._queue: deque[QueueItem] = deque()
        self._seen_urls: set[str] = set()
        self.discovered_count: int = 0
        self.skipped_count: int = 0
        self.skipped_reasons: dict[str, int] = {
            "duplicate": 0,
            "out_of_scope": 0,
            "depth_limit": 0,
            "robots_blocked": 0,
            "page_limit_reached": 0,
        }

    def push(
        self,
        url: str,
        depth: int,
        source_url: str | None = None,
    ) -> bool:
        """Push a URL into the crawl queue if eligible. Returns True if queued."""
        self.discovered_count += 1

        if url in self._seen_urls:
            self.skipped_count += 1
            self.skipped_reasons["duplicate"] += 1
            return False

        if not self._scope.is_in_scope(url):
            self.skipped_count += 1
            self.skipped_reasons["out_of_scope"] += 1
            return False

        if depth > self._config.max_depth:
            self.skipped_count += 1
            self.skipped_reasons["depth_limit"] += 1
            return False

        self._seen_urls.add(url)
        self._queue.append(QueueItem(url=url, depth=depth, source_url=source_url))
        return True

    def pop(self) -> QueueItem | None:
        """Pop the next item from the queue."""
        if not self._queue:
            return None
        return self._queue.popleft()

    def __len__(self) -> int:
        return len(self._queue)

    def is_empty(self) -> bool:
        return len(self._queue) == 0

    @property
    def seen_count(self) -> int:
        return len(self._seen_urls)
