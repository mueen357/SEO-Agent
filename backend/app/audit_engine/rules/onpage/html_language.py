"""HTML language attribute audit rules."""

import re

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

BCP47_PATTERN = re.compile(r"^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$")


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
                recommendation="Add a valid lang attribute to the <html> tag (e.g. lang='en' or lang='es') to aid accessibility and translation.",
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
                recommendation="Specify a valid language code in the <html> lang attribute.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        if not BCP47_PATTERN.match(lang_str):
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Invalid HTML lang format",
                description=f"The <html> lang attribute '{lang_str}' does not conform to standard BCP 47 language format.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "html_lang": lang_str, "source": ctx.source_type},
                recommendation="Use a standard BCP 47 language code (e.g., 'en', 'en-US', 'fr', 'de').",
                source_type=ctx.source_type,
                confidence=0.85,
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
