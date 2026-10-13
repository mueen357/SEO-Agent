"""HTML language attribute structural audit rules.

Validates the syntactic format of language tags based on the BCP 47 (RFC 5646)
grammar specification. Note: This validator performs structural format verification
(subtag lengths, delimiters, ordering) and does not verify membership against the
live IANA Language Subtag Registry.
"""

import re

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

# Structural BCP 47 pattern supporting 2-3 letter primary subtags, script, regional, variants, and extensions.
# Note: Performs structural syntactic validation; does not query live IANA registry tables.
BCP47_SYNTAX_PATTERN = re.compile(
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
                recommendation="Add a standard BCP 47 lang attribute to the <html> tag (e.g. lang='en', lang='es-419') to assist screen readers and language processing.",
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
                recommendation="Specify a valid language code conforming to BCP 47 syntax in the <html> lang attribute.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        if not BCP47_SYNTAX_PATTERN.match(lang_str):
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Invalid HTML lang format",
                description=f"The <html> lang attribute '{lang_str}' does not conform to the structural BCP 47 syntax (RFC 5646).",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "html_lang": lang_str, "validation_scope": "structural_syntax", "source": ctx.source_type},
                recommendation="Use a language tag following standard BCP 47 syntactic format (e.g., 'en', 'en-US', 'zh-Hans', 'es-419').",
                source_type=ctx.source_type,
                confidence=0.9,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="HTML lang attribute present",
            description=f"The root <html> tag declares language '{lang_str}' matching BCP 47 syntax.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "html_lang": lang_str, "validation_scope": "structural_syntax", "source": ctx.source_type},
            recommendation="Ensure the declared language matches the primary content of the page.",
            source_type=ctx.source_type,
            confidence=1.0,
        )
