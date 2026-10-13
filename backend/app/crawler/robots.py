"""Robots.txt discovery and RFC 9309 standards-compliant compliance engine."""

import logging
from typing import List, Tuple
from urllib.parse import urlsplit

from app.crawler.policies import CrawlConfig, FetchResult
from app.crawler.scope import CrawlScope
from app.crawler.fetcher import SecureHTTPFetcher

logger = logging.getLogger(__name__)


class RobotsRule:
    """Represents a single Allow or Disallow directive."""

    def __init__(self, path: str, allow: bool) -> None:
        self.path = path.strip()
        self.allow = allow
        self.length = len(self.path)

    def matches(self, test_path: str) -> bool:
        if not self.path:
            return False
        if self.path.endswith("$"):
            prefix = self.path[:-1]
            return test_path == prefix
        return test_path.startswith(self.path)


class UserAgentGroup:
    """Group of Allow/Disallow rules applying to a user-agent pattern."""

    def __init__(self, user_agents: List[str]) -> None:
        self.user_agents = [ua.lower().strip() for ua in user_agents]
        self.rules: List[RobotsRule] = []
        self.crawl_delay: float | None = None

    def matches_user_agent(self, agent: str) -> bool:
        agent_lower = agent.lower()
        for ua in self.user_agents:
            if ua == "*" or ua in agent_lower:
                return True
        return False

    def is_allowed(self, test_path: str) -> bool | None:
        """Evaluate matching rules. Longest rule wins (RFC 9309). If tie, Allow wins."""
        matching_rules = [r for r in self.rules if r.matches(test_path)]
        if not matching_rules:
            return None

        # Sort by length descending. If equal length, allow (True) precedes disallow (False)
        matching_rules.sort(key=lambda r: (r.length, r.allow), reverse=True)
        return matching_rules[0].allow


class RobotsChecker:
    """Standards-compliant RFC 9309 Robots.txt checker."""

    def __init__(
        self,
        fetcher: SecureHTTPFetcher,
        scope: CrawlScope,
        config: CrawlConfig,
    ) -> None:
        self._fetcher = fetcher
        self._scope = scope
        self._config = config
        self._groups: List[UserAgentGroup] = []
        self.sitemap_urls: List[str] = []
        self.crawl_delay: float | None = None
        self.loaded: bool = False
        self.disallow_all: bool = False

    async def load(self) -> None:
        """Fetch and parse target robots.txt."""
        robots_url = f"{self._scope.scheme}://{self._scope.target_host}/robots.txt"
        result = await self._fetcher.fetch(robots_url, self._scope, self._config)

        if result.fetch_status == "success" and result.body:
            try:
                text = result.body.decode("utf-8", errors="replace")
                self._parse(text)
                self.loaded = True
            except Exception as e:
                logger.warning(f"Error parsing robots.txt: {e}")
                self.loaded = True
        elif result.http_status in (401, 403):
            # Access forbidden: conservative stance, block all
            self.loaded = True
            self.disallow_all = True
        elif result.http_status == 404:
            # Not found: standard behavior is unrestricted access
            self.loaded = True
            self.disallow_all = False
        else:
            # Temporary 5xx failure: conservative handling
            self.loaded = True
            self.disallow_all = False

    def _parse(self, text: str) -> None:
        current_uas: List[str] = []
        current_group: UserAgentGroup | None = None

        for line in text.splitlines():
            # Strip comments
            line = line.split("#", 1)[0].strip()
            if not line:
                continue

            if ":" not in line:
                continue

            key, value = line.split(":", 1)
            key = key.strip().lower()
            val = value.strip()

            if key == "user-agent":
                if current_group is not None and current_group.rules:
                    self._groups.append(current_group)
                    current_group = None
                    current_uas = []

                current_uas.append(val)
                if current_group is None:
                    current_group = UserAgentGroup(current_uas)
                else:
                    current_group.user_agents.append(val.lower())

            elif key == "allow" and current_group is not None:
                current_group.rules.append(RobotsRule(path=val, allow=True))

            elif key == "disallow" and current_group is not None:
                if val:  # Empty disallow means allow all
                    current_group.rules.append(RobotsRule(path=val, allow=False))
                else:
                    current_group.rules.append(RobotsRule(path="/", allow=True))

            elif key == "crawl-delay" and current_group is not None:
                try:
                    current_group.crawl_delay = float(val)
                except ValueError:
                    pass

            elif key == "sitemap":
                if val and val not in self.sitemap_urls:
                    self.sitemap_urls.append(val)

        if current_group is not None:
            self._groups.append(current_group)

        # Set crawl delay if present
        for grp in self._groups:
            if grp.matches_user_agent(self._config.user_agent) and grp.crawl_delay is not None:
                self.crawl_delay = grp.crawl_delay
                break

    def can_fetch(self, url: str) -> bool:
        """Check whether URL is permitted under robots.txt rules."""
        if not self._config.respect_robots_txt:
            return True
        if self.disallow_all:
            return False
        if not self.loaded or not self._groups:
            return True

        path = urlsplit(url).path or "/"

        # 1. First look for specific user-agent group (excluding wildcard *)
        specific_group = next(
            (g for g in self._groups if "*" not in g.user_agents and g.matches_user_agent(self._config.user_agent)),
            None
        )
        if specific_group is not None:
            allowed = specific_group.is_allowed(path)
            if allowed is not None:
                return allowed

        # 2. Fall back to wildcard * group
        wildcard_group = next(
            (g for g in self._groups if "*" in g.user_agents),
            None
        )
        if wildcard_group is not None:
            allowed = wildcard_group.is_allowed(path)
            if allowed is not None:
                return allowed

        return True
