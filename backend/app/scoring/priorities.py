"""Priority classification (P0-P3) and remediation ordering engine."""

from typing import Any, Dict, List, Optional


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


def classify_priority_tier(
    rule_id: str,
    severity: str,
    affected_pages: int = 1,
    status: str = "fail",
    evidence: Optional[Dict[str, Any]] = None,
    total_pages: int = 1,
    is_entrance_page: bool = False,
) -> str:
    """Classify an issue group into P0, P1, P2, or P3 priority level with evidence awareness.

    Requirements:
    - P0 requires a confirmed, actionable serious blocker with documented technical consequences.
    - Isolated HTTP 500 on deep pages must not be P0 (demoted to P1).
    - Unknown or inconclusive findings must NEVER become confirmed P0 or P1 blockers.
    - Intentional indexing directives (noindex/disallow) must not become P0 or P1 blockers.
    - Critical severity alone with weak/unknown evidence must not become P0.
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

    # 3. Rule-specific evidence-aware evaluation for potential P0 blockers
    if rule_id == "TECH_HTTP_5XX":
        # Confirm valid 5xx response evidence
        http_status = ev.get("http_status")
        confirmed_5xx = True
        if http_status is not None:
            try:
                confirmed_5xx = 500 <= int(http_status) <= 599
            except (ValueError, TypeError):
                confirmed_5xx = False
        if not confirmed_5xx:
            return "P2"

        # Check scope: P0 requires widespread server failure or entrance/homepage outage
        is_root = is_entrance_page or ev.get("is_root_page", False)
        scope_ratio = affected_pages / max(1, total_pages)
        if is_root or affected_pages >= 3 or scope_ratio >= 0.20:
            return "P0"
        else:
            # Isolated single deep page HTTP 500
            return "P1"

    if rule_id == "TECH_REDIRECT_LOOP":
        # Confirmed redirect loop prevents all crawling and rendering
        return "P0" if status == "fail" else "P1"

    if rule_id in ("TECH_CANONICAL_CONFLICT", "TECH_CANONICAL_TARGET_STATUS"):
        if severity == "critical" or is_entrance_page or affected_pages >= 3:
            return "P0"
        return "P1"

    # 4. Critical severity evaluation
    if severity == "critical":
        # P0 requires confirmed blocker rule or widespread systemic outage
        has_concrete_evidence = bool(ev and not ev.get("weak_evidence"))
        if rule_id in CONFIRMED_BLOCKER_RULES and has_concrete_evidence:
            return "P0"
        elif has_concrete_evidence and (affected_pages >= 5 or (affected_pages / max(1, total_pages)) >= 0.25):
            return "P0"
        else:
            # Critical severity without confirmed blocker identity or widespread scope demotes to P1
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

        # Extract evidence samples and URLs to detect entrance page or weak evidence
        ev_samples = item.get("evidence_json", {}).get("samples", [])
        sample_ev = ev_samples[0] if ev_samples else item.get("evidence", {})
        urls = item.get("affected_urls_json", [])
        is_entrance = any(
            u.endswith((".com/", ".com", ".org/", ".org", ".io/", ".io", "/index.html")) or u.count("/") <= 3
            for u in urls
        )

        tier = classify_priority_tier(
            rule_id=rule_id,
            severity=sev,
            affected_pages=aff,
            status=status,
            evidence=sample_ev,
            total_pages=total_pages,
            is_entrance_page=is_entrance,
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
