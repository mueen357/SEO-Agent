"""Secure outbound HTTP fetcher with manual redirect validation and response byte caps."""

import asyncio
import time
from urllib.parse import urlsplit
import aiohttp

from app.crawler.normalizer import normalize_url
from app.crawler.policies import CrawlConfig, FetchResult
from app.crawler.scope import CrawlScope
from app.crawler.secure_transport import (
    SSRFSecurityError,
    create_secure_connector,
)


class SecureHTTPFetcher:
    """SSRF-safe, bounded HTTP fetcher."""

    def __init__(
        self,
        connector: aiohttp.TCPConnector | None = None,
        session: aiohttp.ClientSession | None = None,
    ) -> None:
        self._connector = connector
        self._session = session
        self._owns_session = session is None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            connector = self._connector or create_secure_connector()
            self._session = aiohttp.ClientSession(
                connector=connector,
                trust_env=False,  # No proxy inheritance
            )
            self._owns_session = True
        return self._session

    async def fetch(
        self,
        url: str,
        scope: CrawlScope,
        config: CrawlConfig,
    ) -> FetchResult:
        """Fetch a single URL with manual redirect following, scope checking, and byte limits."""
        start_time = time.monotonic()
        redirect_chain: list[dict[str, Any]] = []
        visited_urls: set[str] = set()

        current_url = url
        redirect_count = 0

        while True:
            # 1. Scope and URL security check
            if not scope.is_in_scope(current_url):
                return FetchResult(
                    requested_url=url,
                    final_url=current_url,
                    fetch_status="scope_blocked",
                    error_message=f"URL '{current_url}' is outside authorized crawl scope",
                    redirect_chain=redirect_chain,
                    response_time_ms=int((time.monotonic() - start_time) * 1000),
                )

            visited_urls.add(current_url)

            session = await self._get_session()
            headers = {
                "User-Agent": config.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate",
            }

            try:
                timeout = aiohttp.ClientTimeout(total=config.request_timeout)
                async with session.get(
                    current_url,
                    headers=headers,
                    allow_redirects=False,  # Mandatory manual redirect following
                    timeout=timeout,
                ) as resp:
                    elapsed_ms = int((time.monotonic() - start_time) * 1000)

                    # Check for redirects (301, 302, 303, 307, 308)
                    if resp.status in (301, 302, 303, 307, 308):
                        location = resp.headers.get("Location")
                        if not location:
                            return FetchResult(
                                requested_url=url,
                                final_url=current_url,
                                fetch_status="http_error",
                                http_status=resp.status,
                                error_message="Redirect missing Location header",
                                redirect_chain=redirect_chain,
                                response_time_ms=elapsed_ms,
                            )

                        target_url = normalize_url(location, base_url=current_url)
                        if not target_url:
                            return FetchResult(
                                requested_url=url,
                                final_url=current_url,
                                fetch_status="network_error",
                                http_status=resp.status,
                                error_message=f"Invalid redirect target: '{location}'",
                                redirect_chain=redirect_chain,
                                response_time_ms=elapsed_ms,
                            )

                        redirect_chain.append({
                            "status": resp.status,
                            "from_url": current_url,
                            "to_url": target_url,
                        })

                        if target_url in visited_urls:
                            return FetchResult(
                                requested_url=url,
                                final_url=target_url,
                                fetch_status="network_error",
                                http_status=resp.status,
                                error_message="Redirect loop detected",
                                redirect_chain=redirect_chain,
                                response_time_ms=elapsed_ms,
                            )

                        redirect_count += 1
                        if redirect_count > config.max_redirects:
                            return FetchResult(
                                requested_url=url,
                                final_url=target_url,
                                fetch_status="network_error",
                                http_status=resp.status,
                                error_message=f"Exceeded maximum redirects ({config.max_redirects})",
                                redirect_chain=redirect_chain,
                                response_time_ms=elapsed_ms,
                            )

                        current_url = target_url
                        continue

                    # Non-redirect response: enforce size limit
                    content_length = resp.headers.get("Content-Length")
                    if content_length and content_length.isdigit():
                        if int(content_length) > config.max_response_bytes:
                            return FetchResult(
                                requested_url=url,
                                final_url=current_url,
                                fetch_status="size_exceeded",
                                http_status=resp.status,
                                content_type=resp.content_type,
                                error_message=f"Content-Length exceeds {config.max_response_bytes} bytes",
                                redirect_chain=redirect_chain,
                                response_time_ms=elapsed_ms,
                            )

                    # Stream body chunks with cumulative byte limit
                    body_chunks: list[bytes] = []
                    total_bytes = 0
                    chunk_size = 64 * 1024

                    while True:
                        chunk = await resp.content.read(chunk_size)
                        if not chunk:
                            break
                        total_bytes += len(chunk)
                        if total_bytes > config.max_response_bytes:
                            return FetchResult(
                                requested_url=url,
                                final_url=current_url,
                                fetch_status="size_exceeded",
                                http_status=resp.status,
                                content_type=resp.content_type,
                                error_message=f"Response body exceeded {config.max_response_bytes} bytes limit",
                                redirect_chain=redirect_chain,
                                response_time_ms=elapsed_ms,
                            )
                        body_chunks.append(chunk)

                    body = b"".join(body_chunks)
                    status_kind = "success" if resp.status < 400 else "http_error"

                    return FetchResult(
                        requested_url=url,
                        final_url=current_url,
                        fetch_status=status_kind,
                        http_status=resp.status,
                        content_type=resp.content_type,
                        response_time_ms=elapsed_ms,
                        redirect_chain=redirect_chain,
                        body=body,
                        headers=dict(resp.headers),
                    )

            except asyncio.TimeoutError:
                return FetchResult(
                    requested_url=url,
                    final_url=current_url,
                    fetch_status="timeout",
                    error_message=f"Request timed out after {config.request_timeout}s",
                    redirect_chain=redirect_chain,
                    response_time_ms=int((time.monotonic() - start_time) * 1000),
                )
            except SSRFSecurityError as e:
                return FetchResult(
                    requested_url=url,
                    final_url=current_url,
                    fetch_status="ssrf_blocked",
                    error_message=str(e),
                    redirect_chain=redirect_chain,
                    response_time_ms=int((time.monotonic() - start_time) * 1000),
                )
            except aiohttp.ClientSSLError as e:
                return FetchResult(
                    requested_url=url,
                    final_url=current_url,
                    fetch_status="network_error",
                    error_message=f"TLS/SSL certificate error: {e}",
                    redirect_chain=redirect_chain,
                    response_time_ms=int((time.monotonic() - start_time) * 1000),
                )
            except aiohttp.ClientError as e:
                return FetchResult(
                    requested_url=url,
                    final_url=current_url,
                    fetch_status="network_error",
                    error_message=f"Client connection error: {e}",
                    redirect_chain=redirect_chain,
                    response_time_ms=int((time.monotonic() - start_time) * 1000),
                )
            except Exception as e:
                return FetchResult(
                    requested_url=url,
                    final_url=current_url,
                    fetch_status="network_error",
                    error_message=f"Unexpected fetch error: {e}",
                    redirect_chain=redirect_chain,
                    response_time_ms=int((time.monotonic() - start_time) * 1000),
                )

    async def close(self) -> None:
        """Close managed session and connector."""
        if self._owns_session and self._session and not self._session.closed:
            await self._session.close()
            # small delay to allow underlying SSL transports to close cleanly
            await asyncio.sleep(0.05)
