"""Registry exports for all 13 Site-Wide SEO and Topological rules."""

from typing import List
from app.audit_engine.rules.base import BaseRule
from app.audit_engine.rules.sitewide.canonical_groups import (
    ContentCanonicalConflictRule,
    DuplicateCanonicalReviewRule,
)
from app.audit_engine.rules.sitewide.duplicate_content import (
    DuplicateExactContentRule,
    DuplicateNearContentRule,
)
from app.audit_engine.rules.sitewide.duplicate_metadata import (
    DuplicateH1Rule,
    DuplicateMetaDescriptionRule,
    DuplicateTitleRule,
)
from app.audit_engine.rules.sitewide.internal_graph import (
    DeepCrawlPathRule,
    LowInternalInlinksRule,
    NoObservedInternalInlinksRule,
)
from app.audit_engine.rules.sitewide.link_health import (
    InternalLinkTo4xxRule,
    InternalLinkTo5xxRule,
    InternalLinkToRedirectRule,
)

ALL_SITEWIDE_RULES: List[BaseRule] = [
    DuplicateExactContentRule(),
    DuplicateNearContentRule(),
    DuplicateTitleRule(),
    DuplicateMetaDescriptionRule(),
    DuplicateH1Rule(),
    NoObservedInternalInlinksRule(),
    LowInternalInlinksRule(),
    DeepCrawlPathRule(),
    InternalLinkTo4xxRule(),
    InternalLinkTo5xxRule(),
    InternalLinkToRedirectRule(),
    DuplicateCanonicalReviewRule(),
    ContentCanonicalConflictRule(),
]

__all__ = [
    "ALL_SITEWIDE_RULES",
    "DuplicateExactContentRule",
    "DuplicateNearContentRule",
    "DuplicateTitleRule",
    "DuplicateMetaDescriptionRule",
    "DuplicateH1Rule",
    "NoObservedInternalInlinksRule",
    "LowInternalInlinksRule",
    "DeepCrawlPathRule",
    "InternalLinkTo4xxRule",
    "InternalLinkTo5xxRule",
    "InternalLinkToRedirectRule",
    "DuplicateCanonicalReviewRule",
    "ContentCanonicalConflictRule",
]
