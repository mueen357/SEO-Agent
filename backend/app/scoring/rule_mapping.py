"""Authoritative mapping from SEO rule identities to scoring families.

Preserves the descriptive display category (e.g. 'images', 'links', 'content', 'canonical')
used by findings, UI, and APIs, while providing deterministic grouping into the three
canonical scoring families: 'on_page', 'technical', and 'sitewide'.
"""

from typing import Any, Dict, List, Optional, Set, Tuple

# Canonical scoring families
SCORING_FAMILIES: Tuple[str, ...] = ("on_page", "technical", "sitewide")
ALL_SCORING_FAMILIES = SCORING_FAMILIES

# Authoritative prefix-to-family mapping
PREFIX_FAMILY_MAP: Dict[str, str] = {
    "ONPAGE_": "on_page",
    "TECH_": "technical",
    "SITE_": "sitewide",
}
RULE_FAMILY_PREFIXES = PREFIX_FAMILY_MAP


def get_rule_scoring_family(rule_id: str) -> Optional[str]:
    """Resolve the authoritative scoring family for a given rule_id.

    Returns:
        'on_page', 'technical', 'sitewide', or None if unrecognized.
    """
    if not rule_id or not isinstance(rule_id, str):
        return None

    for prefix, family in PREFIX_FAMILY_MAP.items():
        if rule_id.startswith(prefix):
            return family

    return None


def get_all_registered_rule_families() -> Dict[str, Dict[str, Any]]:
    """Build an authoritative mapping of all rules in RuleRegistry to their families and categories.

    Sources truth directly from RuleRegistry without modifying any original rule definitions.
    """
    from app.audit_engine.registry import RuleRegistry

    reg = RuleRegistry()
    rules = reg.get_all_rules()

    result: Dict[str, Dict[str, Any]] = {}
    for r in rules:
        family = get_rule_scoring_family(r.rule_id)
        if not family:
            family = "unknown"
        result[r.rule_id] = {
            "rule_id": r.rule_id,
            "scoring_family": family,
            "display_category": r.category,
            "subcategory": getattr(r, "subcategory", ""),
            "rule_version": getattr(r, "rule_version", "1.0.0"),
            "is_sitewide": bool(getattr(r, "is_sitewide", False)),
        }
    return result


def validate_rule_families_integrity() -> Dict[str, Any]:
    """Validate that all registered rules uniquely map to exactly one valid scoring family.

    Returns diagnostic dictionary confirming counts and uniqueness.
    """
    from app.audit_engine.registry import RuleRegistry

    reg = RuleRegistry()
    all_rules = reg.get_all_rules()

    total_count = len(all_rules)
    by_family: Dict[str, List[str]] = {"on_page": [], "technical": [], "sitewide": [], "unknown": []}
    seen_ids: Set[str] = set()
    duplicated_ids: Set[str] = set()

    for r in all_rules:
        rid = r.rule_id
        if rid in seen_ids:
            duplicated_ids.add(rid)
        seen_ids.add(rid)

        fam = get_rule_scoring_family(rid)
        if fam in by_family:
            by_family[fam].append(rid)
        else:
            by_family["unknown"].append(rid)

    return {
        "total_rules": total_count,
        "on_page_count": len(by_family["on_page"]),
        "technical_count": len(by_family["technical"]),
        "sitewide_count": len(by_family["sitewide"]),
        "unknown_count": len(by_family["unknown"]),
        "is_valid": (
            total_count == 51
            and len(by_family["on_page"]) == 16
            and len(by_family["technical"]) == 22
            and len(by_family["sitewide"]) == 13
            and len(by_family["unknown"]) == 0
            and len(duplicated_ids) == 0
        ),
        "families": by_family,
        "duplicated_ids": list(duplicated_ids),
    }


def validate_rule_family_mapping(rules: Optional[List[Any]] = None) -> Dict[str, Any]:
    """Validate mapping for a provided list of rules or all registered rules."""
    from app.audit_engine.registry import RuleRegistry

    if rules is None:
        reg = RuleRegistry()
        rules = reg.get_all_rules()

    family_counts: Dict[str, int] = {fam: 0 for fam in SCORING_FAMILIES}
    unmapped: List[str] = []

    for r in rules:
        rid = getattr(r, "rule_id", str(r))
        fam = get_rule_scoring_family(rid)
        if fam in family_counts:
            family_counts[fam] += 1
        else:
            unmapped.append(rid)

    return {
        "total_rules": len(rules),
        "family_counts": family_counts,
        "unmapped_count": len(unmapped),
        "unmapped_rules": unmapped,
        "is_valid": len(unmapped) == 0,
    }


def get_rules_for_family(family: str) -> List[Any]:
    """Return all registered rules for a given scoring family."""
    from app.audit_engine.registry import RuleRegistry

    reg = RuleRegistry()
    return reg.get_rules_by_scoring_family(family)
