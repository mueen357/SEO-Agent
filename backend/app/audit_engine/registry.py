"""Rule registry for discovering and instantiating audit rules."""

from typing import Dict, List, Optional, Type

from app.audit_engine.rules.base import BaseRule
from app.audit_engine.rules.onpage import ALL_ONPAGE_RULES
from app.audit_engine.rules.technical import ALL_TECHNICAL_RULES
from app.audit_engine.rules.sitewide import ALL_SITEWIDE_RULES


class RuleRegistry:
    """Central registry of supported SEO audit rules."""

    def __init__(self) -> None:
        self._rules: Dict[str, BaseRule] = {}
        self._register_default_rules()

    def _register_default_rules(self) -> None:
        # 16 on-page rules (classes)
        for rule_cls in ALL_ONPAGE_RULES:
            instance = rule_cls()
            self.register(instance)
        # 22 technical rules (instances)
        for rule in ALL_TECHNICAL_RULES:
            self.register(rule)
        # 13 site-wide rules (instances)
        for rule in ALL_SITEWIDE_RULES:
            self.register(rule)

    def register(self, rule: BaseRule) -> None:
        self._rules[rule.rule_id] = rule

    def get_rule(self, rule_id: str) -> BaseRule:
        return self._rules[rule_id]

    def get_all_rules(self) -> List[BaseRule]:
        return list(self._rules.values())

    def get_onpage_rules(self) -> List[BaseRule]:
        return [r for r in self._rules.values() if r.rule_id.startswith("ONPAGE_")]

    def get_technical_rules(self) -> List[BaseRule]:
        return [r for r in self._rules.values() if r.rule_id.startswith("TECH_")]

    def get_sitewide_rules(self) -> List[BaseRule]:
        return [r for r in self._rules.values() if r.rule_id.startswith("SITE_") or r.is_sitewide]

    def get_rule_scoring_family(self, rule_id: str) -> Optional[str]:
        """Return the canonical scoring family for a rule ID."""
        if rule_id.startswith("ONPAGE_"):
            return "on_page"
        if rule_id.startswith("TECH_"):
            return "technical"
        if rule_id.startswith("SITE_"):
            return "sitewide"
        rule = self._rules.get(rule_id)
        if rule and getattr(rule, "is_sitewide", False):
            return "sitewide"
        return None

    def get_rules_by_scoring_family(self, family: str) -> List[BaseRule]:
        """Return all rules assigned to a canonical scoring family."""
        if family == "on_page":
            return self.get_onpage_rules()
        if family == "technical":
            return self.get_technical_rules()
        if family == "sitewide":
            return self.get_sitewide_rules()
        return []

    def get_rules_by_category(self, category: str) -> List[BaseRule]:
        if category == "on_page":
            return [r for r in self._rules.values() if r.category in ("on_page", "links", "images") and not r.is_sitewide]
        if category == "sitewide":
            return self.get_sitewide_rules()
        return [r for r in self._rules.values() if r.category == category]


default_registry = RuleRegistry()
