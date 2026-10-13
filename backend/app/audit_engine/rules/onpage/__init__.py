from app.audit_engine.rules.onpage.title import (
    TitlePresentRule,
    TitleLengthRule,
    TitleRepetitionRule,
)
from app.audit_engine.rules.onpage.meta_description import (
    MetaDescriptionPresentRule,
    MetaDescriptionLengthRule,
)
from app.audit_engine.rules.onpage.headings import (
    H1PresenceRule,
    H1MultipleRule,
    H1EmptyRule,
    HeadingHierarchyRule,
)
from app.audit_engine.rules.onpage.canonical import (
    CanonicalPresenceRule,
    CanonicalValidRule,
)
from app.audit_engine.rules.onpage.images import (
    ImageAltMissingRule,
    ImageAltEmptyRule,
)
from app.audit_engine.rules.onpage.links import (
    InternalOutlinksRule,
    EmptyAnchorTextRule,
)
from app.audit_engine.rules.onpage.html_language import (
    HtmlLanguageRule,
)

ALL_ONPAGE_RULES = [
    TitlePresentRule,
    TitleLengthRule,
    TitleRepetitionRule,
    MetaDescriptionPresentRule,
    MetaDescriptionLengthRule,
    H1PresenceRule,
    H1MultipleRule,
    H1EmptyRule,
    HeadingHierarchyRule,
    CanonicalPresenceRule,
    CanonicalValidRule,
    ImageAltMissingRule,
    ImageAltEmptyRule,
    InternalOutlinksRule,
    EmptyAnchorTextRule,
    HtmlLanguageRule,
]
