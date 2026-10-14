"""Priority classification (P0-P3) and remediation ordering engine."""

from typing import Any, Dict, List


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


def classify_priority_tier(rule_id: str, severity: str, affected_pages: int = 1) -> str:
    """Classify an issue group into P0, P1, P2, or P3 priority level."""
    if rule_id in P0_RULES:
        return "P0"
    if rule_id in P1_RULES:
        return "P1"
    if rule_id in P2_RULES:
        return "P2"

    # Fallback to severity-based classification
    if severity == "critical":
        return "P0"
    if severity == "high":
        return "P1"
    if severity == "medium":
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
        tier = classify_priority_tier(rule_id, sev, aff)

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
    items.sort(
        key=lambda x: (
            tier_order.get(x["priority_tier"], 99),
            -x["score_impact"],
            -x["affected_page_count"],
            x["title"],
        )
    )

    # Assign sequential ranks (1-indexed)
    for rank, it in enumerate(items, start=1):
        it["priority_rank"] = rank

    return items
