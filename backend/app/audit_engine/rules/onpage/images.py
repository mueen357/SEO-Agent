"""Image alt attribute audit rules grounded in Google Image Best Practices."""

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_IMAGES_DOCS = "https://developers.google.com/search/docs/appearance/google-images"


class ImageAltMissingRule(BaseRule):
    rule_id = "ONPAGE_IMAGE_ALT_MISSING"
    category = "images"
    subcategory = "images"
    documentation_url = GOOGLE_IMAGES_DOCS
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        total = ctx.page.image_count or 0
        missing = ctx.page.missing_alt_count or 0

        if total == 0:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="No images on page",
                description="The page contains no <img> elements.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url, "image_count": 0},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if missing > 0:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Images missing alt attribute",
                description=f"{missing} of {total} images on the page lack an alt attribute completely.",
                severity="medium",
                status="fail",
                evidence={"page_url": ctx.url, "image_count": total, "missing_alt_count": missing, "source": ctx.source_type},
                recommendation="Add descriptive alt attributes to all informational images to aid accessibility and image search indexing.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="All images have alt attributes",
            description=f"All {total} images on the page have an alt attribute present.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "image_count": total, "missing_alt_count": 0, "source": ctx.source_type},
            recommendation="Maintain descriptive alt attributes for meaningful images.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class ImageAltEmptyRule(BaseRule):
    rule_id = "ONPAGE_IMAGE_ALT_EMPTY"
    category = "images"
    subcategory = "images"
    documentation_url = GOOGLE_IMAGES_DOCS
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        total = ctx.page.image_count or 0
        empty = ctx.page.empty_alt_count or 0

        if total == 0:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="No images on page",
                description="The page contains no <img> elements.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url, "image_count": 0},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if empty > 0:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Images with empty alt attribute",
                description=f"{empty} images have empty alt attributes (alt=''). This is valid for purely decorative images, but ensure non-decorative images have descriptive text.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "image_count": total, "empty_alt_count": empty, "source": ctx.source_type},
                recommendation="Verify that empty alt attributes (alt='') are used exclusively for decorative presentation images.",
                source_type=ctx.source_type,
                confidence=0.85,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No empty alt attributes detected",
            description=f"None of the {total} images on the page have an empty alt attribute.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "image_count": total, "empty_alt_count": 0, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
