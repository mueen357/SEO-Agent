import posixpath
import re
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, urlsplit, urlunsplit


P0_RULES = {
    "TECH_REDIRECT_LOOP",
    "TECH_HTTP_5XX",
    "TECH_CANONICAL_CONFLICT",
    "TECH_CANONICAL_TARGET_STATUS",
}

P1_RULES = {
    "ONPAGE_TITLE_PRESENT",
    "ONPAGE_H1_PRESENCE",
    "SITE_INTERNAL_LINK_TO_4XX",
    "SITE_INTERNAL_LINK_TO_5XX",
    "SITE_CONTENT_DUPLICATE_EXACT",
    "TECH_CANONICAL_MULTIPLE",
    "TECH_HTTP_4XX",
    "TECH_HTTPS_DOWNGRADE",
}

P2_RULES = {
    "ONPAGE_META_DESC_PRESENT",
    "ONPAGE_META_DESC_LENGTH",
    "ONPAGE_IMAGE_ALT_MISSING",
    "SITE_CONTENT_DUPLICATE_NEAR",
    "SITE_NO_OBSERVED_INTERNAL_INLINKS",
    "SITE_DEEP_CRAWL_PATH",
    "ONPAGE_CANONICAL_PRESENCE",
    "TECH_REDIRECT_CHAIN",
    "ONPAGE_H1_MULTIPLE",
    "ONPAGE_HEADING_HIERARCHY",
}


CONFIRMED_BLOCKER_RULES = {
    "TECH_REDIRECT_LOOP",
    "TECH_HTTP_5XX",
    "TECH_CANONICAL_CONFLICT",
    "TECH_CANONICAL_TARGET_STATUS",
}

INTENTIONAL_DIRECTIVE_RULES = {
    "TECH_META_ROBOTS_DIRECTIVES",
    "TECH_ROBOTS_DISALLOW",
    "TECH_X_ROBOTS_TAG",
}


def normalize_priority_url(url: Optional[str]) -> Optional[str]:
    """Deterministically normalize URL for identity comparison without slash heuristics.

    Handles: scheme (http/https), host, port, path, query sorting, fragment removal.
    """
    if not url or not isinstance(url, str):
        return None
    cleaned = url.strip()
    if not cleaned:
        return None
    try:
        parts = urlsplit(cleaned)
    except Exception:
        return None

    scheme = parts.scheme.lower()
    if scheme not in ("http", "https"):
        return None

    hostname = (parts.hostname or "").lower()
    if not hostname:
        return None

    port = parts.port
    if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
        netloc = hostname
    elif port:
        netloc = f"{hostname}:{port}"
    else:
        netloc = hostname

    raw_path = parts.path or "/"
    raw_path = re.sub(r"/+", "/", raw_path)
    normalized_path = posixpath.normpath(raw_path)
    if raw_path.endswith("/") and not normalized_path.endswith("/"):
        normalized_path += "/"
    if not normalized_path.startswith("/"):
        normalized_path = "/" + normalized_path

    # Deterministic query string
    query_params = parse_qsl(parts.query, keep_blank_values=True)
    normalized_query = ""
    if query_params:
        sorted_params = sorted(query_params, key=lambda kv: (kv[0], kv[1]))
        normalized_query = "&".join(f"{k}={v}" for k, v in sorted_params)

    return urlunsplit((scheme, netloc, normalized_path, normalized_query, ""))


def resolve_page_importance(
    url: Optional[str],
    seed_url: Optional[str] = None,
    seed_final_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Deterministically resolve page importance without URL length or slash-counting heuristics.

    Distinguishes:
    - Root domain homepage: URL path is '/' (or empty) and query is empty.
    - Crawl seed URL: matches original requested target or verified redirected final URL.
    - Deep seed: a seed that is not the root homepage (e.g. /contact).
    - Unknown/Unverified: when seed identity cannot be proven and URL is not root homepage.
    """
    norm_url = normalize_priority_url(url)
    if not norm_url:
        return {
            "is_valid": False,
            "is_root_homepage": False,
            "is_seed_page": False,
            "is_entrance_page": False,
            "importance_label": "unknown",
        }

    parts = urlsplit(norm_url)
    # A root homepage has path == '/' and no query params
    is_root_homepage = (parts.path in ("", "/")) and not parts.query

    # Seed matching
    norm_seed = normalize_priority_url(seed_url) if seed_url else None
    norm_seed_final = normalize_priority_url(seed_final_url) if seed_final_url else None

    is_seed_page = False
    if norm_seed and norm_url == norm_seed:
        is_seed_page = True
    elif norm_seed_final and norm_url == norm_seed_final:
        is_seed_page = True

    is_entrance_page = is_root_homepage or is_seed_page

    if is_root_homepage and is_seed_page:
        label = "root_homepage_and_seed"
    elif is_root_homepage:
        label = "root_homepage"
    elif is_seed_page:
        label = "deep_seed_page"
    elif norm_seed or norm_seed_final:
        label = "internal_deep_page"
    else:
        label = "unknown"

    return {
        "is_valid": True,
        "normalized_url": norm_url,
        "is_root_homepage": is_root_homepage,
        "is_seed_page": is_seed_page,
        "is_entrance_page": is_entrance_page,
        "importance_label": label,
    }


def classify_priority_tier(
    rule_id: str,
    severity: str,
    affected_pages: int = 1,
    status: str = "fail",
    evidence: Optional[Dict[str, Any]] = None,
    total_pages: int = 1,
    is_entrance_page: bool = False,
    is_root_homepage: bool = False,
    is_seed_page: bool = False,
) -> str:
    """Classify an issue group into P0, P1, P2, or P3 priority level with evidence awareness.

    Requirements:
    - P0 requires a confirmed, actionable serious blocker with documented technical consequences.
    - Confirmed HTTP 5xx requires valid 500-599 evidence. Missing/200 evidence must NOT become 500.
    - Isolated HTTP 500 on deep pages must NOT be P0 (demoted to P1).
    - P0 5xx requires verified entrance/homepage/seed impact OR substantial scope (>= 3 pages or >= 20%).
    - Unknown or inconclusive findings must NEVER become confirmed P0 or P1 blockers.
    - Intentional indexing directives (noindex/disallow) must not become P0 or P1 blockers.
    - Canonical conflicts are not automatically treated as P0 emergencies without critical severity and important page impact.
    - Critical severity alone without concrete evidence or widespread scope demotes to P1.
    """
    ev = evidence or {}

    # 1. Unknown or inconclusive findings: strictly barred from P0 and P1
    if status == "unknown" or ev.get("is_inconclusive") or ev.get("weak_evidence"):
        return "P2" if severity in ("critical", "high", "medium") else "P3"

    # 2. Intentional configuration directives (noindex, disallow)
    if rule_id in INTENTIONAL_DIRECTIVE_RULES:
        is_intentional = ev.get("is_intentional", True)
        if is_intentional:
            return "P2" if severity in ("critical", "high", "medium") else "P3"

    # Effective entrance importance
    is_important_page = (
        is_entrance_page
        or is_root_homepage
        or is_seed_page
        or ev.get("is_root_page", False)
        or ev.get("is_seed_page", False)
    )

    # 3. Rule-specific evidence-aware evaluation for potential P0 blockers
    if rule_id == "TECH_HTTP_5XX":
        # Confirm valid 5xx response evidence from real HTTP status
        http_status = ev.get("http_status")
        confirmed_5xx = False
        if http_status is not None:
            try:
                status_int = int(http_status)
                confirmed_5xx = (500 <= status_int <= 599)
            except (ValueError, TypeError):
                confirmed_5xx = False

        if not confirmed_5xx:
            # Missing HTTP evidence, or 200 incorrectly labeled as 500 -> strictly barred from P0/P1
            return "P2" if severity in ("critical", "high", "medium") else "P3"

        # Check scope and page importance for confirmed 5xx
        scope_ratio = affected_pages / max(1, total_pages)
        is_substantial_scope = (affected_pages >= 3) or (scope_ratio >= 0.20)

        if is_important_page or is_substantial_scope:
            return "P0"
        else:
            # Isolated single deep page HTTP 500
            return "P1"

    if rule_id == "TECH_REDIRECT_LOOP":
        # Confirmed redirect loop prevents all crawling and rendering
        return "P0" if status == "fail" else "P1"

    if rule_id in ("TECH_CANONICAL_CONFLICT", "TECH_CANONICAL_TARGET_STATUS"):
        # Avoid automatically treating all canonical conflicts as emergencies
        if (is_important_page or affected_pages >= 3) and severity == "critical":
            return "P0"
        elif severity in ("critical", "high"):
            return "P1"
        else:
            return "P2"

    # 4. Critical severity evaluation
    if severity == "critical":
        has_concrete_evidence = bool(ev and not ev.get("weak_evidence"))
        if not has_concrete_evidence:
            return "P1"

        if rule_id in CONFIRMED_BLOCKER_RULES and is_important_page:
            return "P0"
        elif affected_pages >= 5 or (affected_pages / max(1, total_pages)) >= 0.25:
            return "P0"
        else:
            return "P1"

    # 5. High severity or standard P1 rules
    if severity == "high" or rule_id in P1_RULES:
        return "P1"

    # 6. Medium severity or standard P2 rules
    if severity == "medium" or rule_id in P2_RULES:
        return "P2"

    return "P3"


def compute_priority_items(
    grouped_items: List[Dict[str, Any]],
    total_pages: int = 1,
    seed_url: Optional[str] = None,
    seed_final_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Assign priority tiers, compute score impacts, sort, and rank items deterministically."""
    items = []
    tier_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    sev_multipliers = {"critical": 15.0, "high": 10.0, "medium": 5.0, "low": 2.0, "info": 0.5}

    for item in grouped_items:
        rule_id = item["rule_id"]
        sev = item["severity"]
        aff = item["affected_page_count"]
        status = item.get("status", "fail")

        # Extract evidence samples and URLs to resolve page importance authoritatively
        ev_samples = item.get("evidence_json", {}).get("samples", [])
        sample_ev = ev_samples[0] if ev_samples else item.get("evidence", {})
        urls = item.get("affected_urls_json", [])

        has_root_homepage = False
        has_seed_page = False
        has_entrance_page = False

        for u in urls:
            imp = resolve_page_importance(u, seed_url=seed_url, seed_final_url=seed_final_url)
            if imp["is_root_homepage"]:
                has_root_homepage = True
            if imp["is_seed_page"]:
                has_seed_page = True
            if imp["is_entrance_page"]:
                has_entrance_page = True

        sample_url = sample_ev.get("page_url") or sample_ev.get("url")
        if sample_url:
            imp = resolve_page_importance(sample_url, seed_url=seed_url, seed_final_url=seed_final_url)
            if imp["is_root_homepage"]:
                has_root_homepage = True
            if imp["is_seed_page"]:
                has_seed_page = True
            if imp["is_entrance_page"]:
                has_entrance_page = True

        tier = classify_priority_tier(
            rule_id=rule_id,
            severity=sev,
            affected_pages=aff,
            status=status,
            evidence=sample_ev,
            total_pages=total_pages,
            is_entrance_page=has_entrance_page,
            is_root_homepage=has_root_homepage,
            is_seed_page=has_seed_page,
        )

        # Estimate score impact: severity weight * affected page ratio
        ratio = min(1.0, aff / max(1, total_pages))
        impact = round(sev_multipliers.get(sev, 5.0) * ratio, 2)

        item_copy = dict(item)
        item_copy["priority_tier"] = tier
        item_copy["score_impact"] = impact
        items.append(item_copy)

    # Sort deterministically:
    # 1. Tier order (P0 -> P1 -> P2 -> P3)
    # 2. Score impact descending
    # 3. Affected page count descending
    # 4. Title alphabetically
    # 5. Rule ID alphabetically
    # 6. Group fingerprint alphabetically (stable unique tie-breaking)
    items.sort(
        key=lambda x: (
            tier_order.get(x["priority_tier"], 99),
            -x["score_impact"],
            -x["affected_page_count"],
            x["title"],
            x["rule_id"],
            x.get("group_fingerprint", ""),
        )
    )

    # Assign sequential ranks (1-indexed)
    for rank, it in enumerate(items, start=1):
        it["priority_rank"] = rank

    return items

