"""Base class for all audit rules."""

from abc import ABC
from typing import Any, List, Optional, Union

from app.audit_engine.context import PageAuditContext, SiteAuditContext
from app.audit_engine.result import RuleAssessment


class BaseRule(ABC):
    """Abstract base class for all independent SEO audit rules."""

    rule_id: str
    category: str
    subcategory: str
    rule_version: str = "1.0.0"
    documentation_url: Optional[str] = None
    default_severity: str = "medium"
    is_site_level: bool = False
    is_sitewide: bool = False

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        """Evaluate page context and return a structured assessment."""
        raise NotImplementedError("Page-level evaluation not implemented for this rule.")

    def evaluate_site(self, ctx: Any) -> Union[RuleAssessment, List[RuleAssessment]]:
        """Evaluate site-level context. Override in site-level and site-wide rules."""
        raise NotImplementedError("Site-level evaluation not implemented for this rule.")
