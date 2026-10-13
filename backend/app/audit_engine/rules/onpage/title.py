"""Title tag audit rules grounded in Google Search Central documentation."""

import re
from typing import Any, Dict

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_TITLE_DOCS = "https://developers.google.com/search/docs/appearance/title-link"


class TitlePresentRule(BaseRule):
    rule_id = "ONPAGE_TITLE_PRESENT"
    category = "on_page"
    subcategory = "title"
    documentation_url = GOOGLE_TITLE_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        raw_title = ctx.effective_title

        if raw_title is None:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Missing page title",
                description="The page HTML contains no <title> tag in the document <head>.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "document_title": None, "source": ctx.source_type},
                recommendation="Add a descriptive, concise <title> element inside the <head> tag.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if not raw_title.strip():
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Empty page title",
                description="The <title> tag is present but contains only whitespace.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "document_title": raw_title, "source": ctx.source_type},
                recommendation="Provide concise, topic-specific text inside the <title> tag.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Title tag present",
            description=f"A non-empty title tag is present: \"{raw_title}\"",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "document_title": raw_title, "character_count": len(raw_title), "source": ctx.source_type},
            recommendation="Maintain clear, descriptive title text relevant to page content.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class TitleLengthRule(BaseRule):
    rule_id = "ONPAGE_TITLE_LENGTH"
    category = "on_page"
    subcategory = "title"
    documentation_url = GOOGLE_TITLE_DOCS
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        title = ctx.effective_title
        if not title:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Title length evaluation skipped",
                description="Cannot evaluate title length because no title text was found.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url, "document_title": None},
                recommendation="Ensure a title is present before optimizing its length.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        length = len(title)
        if length < 15:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Short page title",
                description=f"Title is only {length} characters long and may lack sufficient context for searchers.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "document_title": title, "character_count": length, "source": ctx.source_type},
                recommendation="Consider expanding the title to clearly identify the specific subject of the page.",
                source_type=ctx.source_type,
                confidence=0.9,
                documentation_url=self.documentation_url,
            )

        if length > 70:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Long page title",
                description=f"Title is {length} characters long and may be truncated in search results display.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "document_title": title, "character_count": length, "source": ctx.source_type},
                recommendation="Consider keeping the primary topic and brand within ~60-70 characters to avoid display truncation.",
                source_type=ctx.source_type,
                confidence=0.85,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Optimal title length",
            description=f"Title length ({length} characters) falls within standard editorial guidelines.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "document_title": title, "character_count": length, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class TitleRepetitionRule(BaseRule):
    rule_id = "ONPAGE_TITLE_REPETITIVE"
    category = "on_page"
    subcategory = "title"
    documentation_url = GOOGLE_TITLE_DOCS
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        title = ctx.effective_title
        if not title:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Title repetition check skipped",
                description="No title present to check for repetitive words.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="Add a title tag.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        words = [w.lower() for w in re.findall(r"\b[a-zA-Z]{3,}\b", title)]
        freq: Dict[str, int] = {}
        for w in words:
            freq[w] = freq.get(w, 0) + 1

        repeated = [w for w, count in freq.items() if count >= 3]
        if repeated:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Repetitive words in title",
                description=f"Title contains words repeated 3 or more times: {', '.join(repeated)}.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "document_title": title, "repeated_words": repeated, "source": ctx.source_type},
                recommendation="Avoid keyword stuffing or repetitive boilerplate phrases in title tags.",
                source_type=ctx.source_type,
                confidence=0.9,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No repetitive phrasing in title",
            description="Title does not display repetitive keyword patterns.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "document_title": title, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
