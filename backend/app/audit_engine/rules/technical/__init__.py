"""Technical SEO audit rules collection."""

from typing import List
from app.audit_engine.rules.base import BaseRule

from app.audit_engine.rules.technical.http_status import (
    HttpStatus4xxRule,
    HttpStatus5xxRule,
    HttpStatus429Rule,
    HttpUnsupportedContentRule,
)
from app.audit_engine.rules.technical.robots_directives import (
    MetaRobotsDirectivesRule,
)
from app.audit_engine.rules.technical.indexability import (
    XRobotsTagRule,
)
from app.audit_engine.rules.technical.robots_txt import (
    RobotsFetchStatusRule,
    RobotsDisallowRule,
    RobotsSitemapDeclarationRule,
)
from app.audit_engine.rules.technical.sitemap import (
    SitemapAvailabilityRule,
    SitemapParseErrorRule,
    SitemapUrlStatusRule,
    SitemapNoindexConflictRule,
    SitemapCanonicalConflictRule,
)
from app.audit_engine.rules.technical.redirects import (
    RedirectChainRule,
    RedirectLoopRule,
    RedirectFailureRule,
)
from app.audit_engine.rules.technical.canonical import (
    CanonicalTargetStatusRule,
    CanonicalConflictRule,
    CanonicalMultipleRule,
)
from app.audit_engine.rules.technical.https import (
    HttpsUsageRule,
    HttpsDowngradeRule,
)

ALL_TECHNICAL_RULES: List[BaseRule] = [
    # HTTP Status
    HttpStatus4xxRule(),
    HttpStatus5xxRule(),
    HttpStatus429Rule(),
    HttpUnsupportedContentRule(),
    # Robots Meta Directives
    MetaRobotsDirectivesRule(),
    # X-Robots-Tag
    XRobotsTagRule(),
    # Robots.txt
    RobotsFetchStatusRule(),
    RobotsDisallowRule(),
    RobotsSitemapDeclarationRule(),
    # XML Sitemaps
    SitemapAvailabilityRule(),
    SitemapParseErrorRule(),
    SitemapUrlStatusRule(),
    SitemapNoindexConflictRule(),
    SitemapCanonicalConflictRule(),
    # Redirects
    RedirectChainRule(),
    RedirectLoopRule(),
    RedirectFailureRule(),
    # Canonical Cross-Signal
    CanonicalTargetStatusRule(),
    CanonicalConflictRule(),
    CanonicalMultipleRule(),
    # HTTPS
    HttpsUsageRule(),
    HttpsDowngradeRule(),
]
