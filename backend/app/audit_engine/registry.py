"""Rule registry for discovering and instantiating audit rules."""

from typing import Dict, List, Type

from app.audit_engine.rules.base import BaseRule
from app.audit_engine.rules.onpage import ALL_ONPAGE_RULES


class RuleRegistry:
    """Central registry of supported SEO audit rules."""

    def __init__(self) -> None:
        self._rules: Dict[str, BaseRule] = {}
        self._register_default_rules()

    def _register_default_rules(self) -> None:
        for rule_cls in ALL_ONPAGE_RULES:
            instance = rule_cls()
            self.register(instance)

    def register(self, rule: BaseRule) -> None:
        self._rules[rule.rule_id] = rule

    def get_rule(self, rule_id: str) -> BaseRule:
        return self._rules[rule_id]

    def get_all_rules(self) -> List[BaseRule]:
        return list(self._rules.values())

    def get_rules_by_category(self, category: str) -> List[BaseRule]:
        return [r for r in self._rules.values() if r.category == category]


default_registry = RuleRegistry()
