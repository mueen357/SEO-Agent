"""Destination-validating local HTTP/CONNECT forward proxy.

Inspects all outbound browser network requests at the TCP/socket level,
enforcing DNS pinning, public IP validation, and strict port restrictions
to prevent SSRF, DNS rebinding, and unauthorized network egress.
"""

import asyncio
import ipaddress
import logging
import socket
from typing import List, Optional, Set, Tuple
from urllib.parse import urlparse

from app.crawler.secure_transport import is_public_ip

logger = logging.getLogger("egress_proxy")


class ValidatingEgressProxy:
    """Async local HTTP/CONNECT proxy enforcing strict outbound destination rules."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 0,
        allowed_ports: Optional[Set[int]] = None,
        allow_local_fixtures: bool = False,
        allowed_fixture_hosts: Optional[Set[str]] = None,
    ) -> None:
        self.host = host
        self.requested_port = port
        self.port: int = 0
        self.allowed_ports = allowed_ports or {80, 443}
        self.allow_local_fixtures = allow_local_fixtures
        self.allowed_fixture_hosts = allowed_fixture_hosts or {"127.0.0.1", "localhost"}
        self.server: Optional[asyncio.Server] = None
        self.is_running = False

    async def start(self) -> int:
        """Start the egress proxy server and return the bound port."""
        self.server = await asyncio.start_server(
            self._handle_client,
            host=self.host,
            port=self.requested_port,
        )
        # Extract bound port
        sockets = self.server.sockets
        if sockets:
            self.port = sockets[0].getsockname()[1]
        self.is_running = True
        logger.info(f"ValidatingEgressProxy listening on {self.host}:{self.port}")
        return self.port

    async def stop(self) -> None:
        """Stop the egress proxy server."""
        self.is_running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("ValidatingEgressProxy stopped.")

    @property
    def proxy_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    async def _handle_client(
        self,
        client_reader: asyncio.StreamReader,
        client_writer: asyncio.StreamWriter,
    ) -> None:
        try:
            line = await client_reader.readline()
            if not line:
                client_writer.close()
                await client_writer.wait_closed()
                return

            request_line = line.decode("latin1", errors="replace").strip()
            parts = request_line.split(" ")
            if len(parts) < 3:
                client_writer.close()
                await client_writer.wait_closed()
                return

            method, target, version = parts[0].upper(), parts[1], parts[2]

            # Read remaining headers
            headers = []
            while True:
                h_line = await client_reader.readline()
                if not h_line or h_line == b"\r\n" or h_line == b"\n":
                    break
                headers.append(h_line)

            if method == "CONNECT":
                await self._handle_connect(target, client_reader, client_writer)
            else:
                await self._handle_http(method, target, version, headers, client_reader, client_writer)

        except Exception as e:
            logger.debug(f"Proxy client handling exception: {e}")
            try:
                client_writer.close()
                await client_writer.wait_closed()
            except Exception:
                pass

    async def _validate_destination(self, host: str, port: int) -> Tuple[bool, Optional[str], Optional[str]]:
        """Validate destination host and port against SSRF / egress restrictions."""
        # 1. Port restriction
        if port not in self.allowed_ports:
            # Special case for local test fixtures
            if self.allow_local_fixtures and host in self.allowed_fixture_hosts:
                pass
            else:
                return False, None, f"Port {port} is not in permitted ports {self.allowed_ports}"

        # 2. Local test fixture override
        if self.allow_local_fixtures and host in self.allowed_fixture_hosts:
            return True, "127.0.0.1", None

        # 3. DNS resolution & IP pinning
        try:
            addr_info = await asyncio.get_event_loop().getaddrinfo(
                host,
                port,
                family=socket.AF_UNSPEC,
                type=socket.SOCK_STREAM,
            )
        except Exception as e:
            return False, None, f"DNS resolution failed for '{host}': {e}"

        if not addr_info:
            return False, None, f"No DNS addresses found for '{host}'"

        # Validate EVERY candidate IP address
        valid_ip: Optional[str] = None
        for family, _, _, _, sockaddr in addr_info:
            candidate_ip_str = sockaddr[0]
            try:
                ip_obj = ipaddress.ip_address(candidate_ip_str)
            except ValueError:
                return False, None, f"Invalid IP address representation: '{candidate_ip_str}'"

            if not is_public_ip(ip_obj):
                return False, None, f"Destination resolved to restricted IP: {candidate_ip_str}"

            if not valid_ip:
                valid_ip = candidate_ip_str

        return True, valid_ip, None

    async def _handle_connect(
        self,
        target: str,
        client_reader: asyncio.StreamReader,
        client_writer: asyncio.StreamWriter,
    ) -> None:
        """Handle HTTPS CONNECT tunneling with strict destination checks."""
        host, port_str = target.split(":") if ":" in target else (target, "443")
        try:
            port = int(port_str)
        except ValueError:
            client_writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\n")
            await client_writer.drain()
            client_writer.close()
            return

        is_valid, target_ip, err = await self._validate_destination(host, port)
        if not is_valid or not target_ip:
            logger.warning(f"Blocked CONNECT tunnel to {target}: {err}")
            client_writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nSSRF Blocked: " + (err or "").encode() + b"\r\n")
            await client_writer.drain()
            client_writer.close()
            return

        # Connect directly to the validated IP address
        try:
            remote_reader, remote_writer = await asyncio.open_connection(
                host=target_ip,
                port=port,
                server_hostname=host if target_ip != host else None,
            )
        except Exception as e:
            logger.debug(f"Failed to connect to validated upstream {target_ip}:{port}: {e}")
            client_writer.write(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
            await client_writer.drain()
            client_writer.close()
            return

        client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        await client_writer.drain()

        # Tunnel bidirectionally
        await self._pipe_streams(client_reader, client_writer, remote_reader, remote_writer)

    async def _handle_http(
        self,
        method: str,
        target: str,
        version: str,
        headers: List[bytes],
        client_reader: asyncio.StreamReader,
        client_writer: asyncio.StreamWriter,
    ) -> None:
        """Handle plain HTTP proxy requests."""
        parsed = urlparse(target)
        host = parsed.hostname or ""
        port = parsed.port or (443 if parsed.scheme == "https" else 80)

        is_valid, target_ip, err = await self._validate_destination(host, port)
        if not is_valid or not target_ip:
            logger.warning(f"Blocked HTTP request to {target}: {err}")
            client_writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nSSRF Blocked: " + (err or "").encode() + b"\r\n")
            await client_writer.drain()
            client_writer.close()
            return

        try:
            remote_reader, remote_writer = await asyncio.open_connection(
                host=target_ip,
                port=port,
            )
        except Exception as e:
            client_writer.write(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
            await client_writer.drain()
            client_writer.close()
            return

        # Forward request
        path = parsed.path or "/"
        if parsed.query:
            path += f"?{parsed.query}"
        req_line = f"{method} {path} {version}\r\n".encode()
        remote_writer.write(req_line)
        for h in headers:
            remote_writer.write(h)
        remote_writer.write(b"\r\n")
        await remote_writer.drain()

        # Pipe response back
        await self._pipe_streams(client_reader, client_writer, remote_reader, remote_writer)

    async def _pipe_streams(
        self,
        c_reader: asyncio.StreamReader,
        c_writer: asyncio.StreamWriter,
        r_reader: asyncio.StreamReader,
        r_writer: asyncio.StreamWriter,
    ) -> None:
        async def forward(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
            try:
                while True:
                    data = await reader.read(16384)
                    if not data:
                        break
                    writer.write(data)
                    await writer.drain()
            except Exception:
                pass
            finally:
                try:
                    writer.close()
                except Exception:
                    pass

        try:
            await asyncio.gather(
                forward(c_reader, r_writer),
                forward(r_reader, c_writer),
                return_exceptions=True,
            )
        finally:
            try:
                c_writer.close()
                r_writer.close()
            except Exception:
                pass
