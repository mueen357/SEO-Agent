"""Intelligent grouping and deduplication for SEO remediation items."""

import hashlib
from typing import Any, Dict, List, Optional


def create_group_fingerprint(rule_id: str, key: str) -> str:
    """Generate deterministic 64-character SHA-256 fingerprint for deduplication."""
    data = f"{rule_id}:{key}".encode("utf-8")
    return hashlib.sha256(data).hexdigest()[:64]


def group_findings_by_rule_and_cause(
    issues: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Group individual page-level and site-level findings into consolidated remediation items."""
    grouped: Dict[str, Dict[str, Any]] = {}

    for issue in issues:
        rule_id = issue.get("rule_id", "UNKNOWN_RULE")
        status = issue.get("status", "unknown")
        # Exclude passes, not_applicable, and inconclusive unknown assessments from confirmed blockers
        if status in ("pass", "not_applicable", "unknown"):
            continue

        category = issue.get("category", "on_page")
        severity = issue.get("severity", "medium")
        title = issue.get("title", "")
        recommendation = issue.get("recommendation", "")
        evidence = issue.get("evidence", {}) or {}

        # Collect all affected URLs from direct issue fields and evidence collections
        issue_urls: List[str] = []
        for direct_field in ("page_url", "requested_url", "final_url", "url"):
            val = issue.get(direct_field)
            if val and isinstance(val, str) and val not in issue_urls:
                issue_urls.append(val)
        if evidence.get("page_url") and evidence["page_url"] not in issue_urls:
            issue_urls.append(evidence["page_url"])

        for collection_field in ("all_urls", "affected_urls", "urls", "sample_urls"):
            val = evidence.get(collection_field)
            if isinstance(val, list):
                for u in val:
                    if isinstance(u, str) and u and u not in issue_urls:
                        issue_urls.append(u)

        reported_page_count = 0
        for count_field in ("page_count", "orphan_count", "deep_pages_count", "low_inlink_count"):
            val = evidence.get(count_field)
            if isinstance(val, int) and val > reported_page_count:
                reported_page_count = val

        # Determine grouping key
        # If site-wide finding has group_id, use that
        if evidence.get("group_id"):
            group_key = evidence["group_id"]
        elif rule_id in ("TECH_HTTP_4XX", "TECH_HTTP_5XX"):
            code = evidence.get("http_status") or "error"
            group_key = f"http_{code}"
            title = f"Pages returning HTTP {code} server responses"
        elif rule_id in ("SITE_INTERNAL_LINK_TO_4XX", "SITE_INTERNAL_LINK_TO_5XX"):
            target = evidence.get("target_url") or "broken_link"
            group_key = f"broken_target_{target}"
            title = f"Internal links targeting broken URL: {target}"
        elif rule_id == "TECH_REDIRECT_LOOP":
            target = evidence.get("target_url") or "loop"
            group_key = f"redirect_loop_{target}"
        else:
            # Default to grouping all pages failing the same rule
            group_key = f"rule_{rule_id}_{status}"

        fp = create_group_fingerprint(rule_id, group_key)

        if fp not in grouped:
            grouped[fp] = {
                "group_fingerprint": fp,
                "rule_id": rule_id,
                "rule_ids": [rule_id],
                "category": category,
                "severity": severity,
                "status": status,
                "title": title,
                "recommendation": recommendation,
                "affected_urls": list(issue_urls),
                "evidence_samples": [evidence] if evidence else [],
                "count": 1,
                "reported_page_count": reported_page_count,
            }
        else:
            item = grouped[fp]
            item["count"] += 1
            for u in issue_urls:
                if u not in item["affected_urls"]:
                    item["affected_urls"].append(u)
            if reported_page_count > item.get("reported_page_count", 0):
                item["reported_page_count"] = reported_page_count
            if evidence and len(item["evidence_samples"]) < 5:
                item["evidence_samples"].append(evidence)

    # Convert to list of structured dicts
    result = []
    for fp, data in grouped.items():
        # Clean title if empty
        title = data["title"]
        if not title:
            title = f"Remediate {data['rule_id']} across affected pages"

        actual_page_count = max(len(data["affected_urls"]), data.get("reported_page_count", 0), data["count"])

        result.append({
            "group_fingerprint": fp,
            "rule_id": data["rule_id"],
            "rule_ids_json": data["rule_ids"],
            "category": data["category"],
            "severity": data["severity"],
            "title": title,
            "description": f"Observed on {actual_page_count} page(s).",
            "recommendation": data["recommendation"],
            "affected_page_count": actual_page_count,
            "affected_urls_json": data["affected_urls"][:50],  # cap list for DB storage
            "evidence_json": {
                "sample_count": len(data["evidence_samples"]),
                "samples": data["evidence_samples"][:5],
            },
        })

    return result
