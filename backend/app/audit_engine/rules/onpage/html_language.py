"""HTML language attribute audit rules complying with RFC 5646 (BCP 47)."""

import re

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

# Standards-aware BCP 47 pattern supporting 2-3 letter primary subtags, script, regional, variants, and extensions
BCP47_PATTERN = re.compile(
    r"^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4,8})"
    r"(?:-[a-z]{4})?"
    r"(?:-[a-z]{2}|-[0-9]{3})?"
    r"(?:-[a-z0-9]{5,8}|-[0-9][a-z0-9]{3})*"
    r"(?:-[a-wy-z0-9](?:-[a-z0-9]{2,8})+)*"
    r"(?:-x(?:-[a-z0-9]{1,8})+)?|"
    r"x(?:-[a-z0-9]{1,8})+)$",
    re.IGNORECASE,
)


class HtmlLanguageRule(BaseRule):
    rule_id = "ONPAGE_HTML_LANG"
    category = "on_page"
    subcategory = "language"
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        lang = ctx.page.html_lang

        if lang is None:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Missing HTML lang attribute",
                description="The root <html> element does not specify a lang attribute.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "html_lang": None, "source": ctx.source_type},
                recommendation="Add a valid BCP 47 lang attribute to the <html> tag (e.g. lang='en', lang='es-419') to assist screen readers and language processing.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        lang_str = lang.strip()
        if not lang_str:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Empty HTML lang attribute",
                description="The <html> element has a lang attribute, but its value is empty.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "html_lang": lang, "source": ctx.source_type},
                recommendation="Specify a valid BCP 47 language code in the <html> lang attribute.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        if not BCP47_PATTERN.match(lang_str):
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Invalid HTML lang format",
                description=f"The <html> lang attribute '{lang_str}' does not conform to standard BCP 47 format.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "html_lang": lang_str, "source": ctx.source_type},
                recommendation="Use a standard BCP 47 language tag (e.g., 'en', 'en-US', 'zh-Hans', 'es-419').",
                source_type=ctx.source_type,
                confidence=0.9,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="HTML lang attribute present",
            description=f"The root <html> tag declares language '{lang_str}'.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "html_lang": lang_str, "source": ctx.source_type},
            recommendation="Ensure the declared language matches the primary content of the page.",
            source_type=ctx.source_type,
            confidence=1.0,
        )
