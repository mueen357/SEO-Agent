"""Base class for all audit rules."""

from abc import ABC, abstractmethod
from typing import Optional

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment


class BaseRule(ABC):
    """Abstract base class for all independent SEO audit rules."""

    rule_id: str
    category: str
    subcategory: str
    rule_version: str = "1.0.0"
    documentation_url: Optional[str] = None
    default_severity: str = "medium"

    @abstractmethod
    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        """Evaluate page context and return a structured assessment."""
        pass
