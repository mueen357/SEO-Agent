"""URL normalization and canonicalization utilities."""

import posixpath
import re
from urllib.parse import parse_qsl, unquote, urlencode, urljoin, urlsplit, urlunsplit


def normalize_url(url: str, base_url: str | None = None) -> str | None:
    """Normalize a URL to standard form or resolve against base_url."""
    if not url or not isinstance(url, str):
        return None

    cleaned = url.strip()
    if not cleaned:
        return None

    # Resolve relative URL against base if provided
    if base_url:
        try:
            cleaned = urljoin(base_url, cleaned)
        except Exception:
            return None

    try:
        parts = urlsplit(cleaned)
    except Exception:
        return None

    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        return None

    # Rejection of userinfo credentials
    if parts.username or parts.password:
        return None

    hostname = (parts.hostname or "").lower()
    if not hostname:
        return None

    # Normalize port (strip default ports)
    port = parts.port
    if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
        netloc = hostname
    elif port:
        netloc = f"{hostname}:{port}"
    else:
        netloc = hostname

    # Path normalization
    raw_path = parts.path or "/"
    # Decode percent-encoded unreserved chars if needed, collapse redundant slashes
    raw_path = re.sub(r"/+", "/", raw_path)
    # Posix path normalization
    normalized_path = posixpath.normpath(raw_path)
    if raw_path.endswith("/") and not normalized_path.endswith("/"):
        normalized_path += "/"
    if not normalized_path.startswith("/"):
        normalized_path = "/" + normalized_path

    # Query string normalization
    query_params = parse_qsl(parts.query, keep_blank_values=True)
    if query_params:
        # Sort query params deterministically
        sorted_params = sorted(query_params, key=lambda kv: (kv[0], kv[1]))
        normalized_query = urlencode(sorted_params)
    else:
        normalized_query = ""

    # Fragment removal (strip fragments entirely)
    return urlunsplit((scheme, netloc, normalized_path, normalized_query, ""))
