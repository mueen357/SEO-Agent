"""Unit tests for all 16 on-page SEO audit rules."""

import pytest
from app.audit_engine.context import PageAuditContext
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
from app.database.models import CrawlLink, CrawlPage, CrawlPageRender


def make_context(
    url="https://example.com",
    title=None,
    meta_description=None,
    canonical_url=None,
    meta_robots=None,
    html_lang=None,
    headings_json=None,
    image_count=0,
    missing_alt_count=0,
    empty_alt_count=0,
    internal_link_count=0,
    external_link_count=0,
    links=None,
    render=None,
):
    page = CrawlPage(
        requested_url=url,
        final_url=url,
        fetch_status="success",
        http_status=200,
        title=title,
        meta_description=meta_description,
        canonical_url=canonical_url,
        meta_robots=meta_robots,
        html_lang=html_lang,
        headings_json=headings_json or {},
        image_count=image_count,
        missing_alt_count=missing_alt_count,
        empty_alt_count=empty_alt_count,
        internal_link_count=internal_link_count,
        external_link_count=external_link_count,
    )
    return PageAuditContext(
        page=page,
        render=render,
        links=links or [],
        audit_target_url="https://example.com",
        audit_hostname="example.com",
    )


# --- Title Rules ---
def test_title_present_rule_missing():
    ctx = make_context(title=None)
    res = TitlePresentRule().evaluate(ctx)
    assert res.status == "fail"
    assert res.severity == "high"


def test_title_present_rule_empty():
    ctx = make_context(title="   ")
    res = TitlePresentRule().evaluate(ctx)
    assert res.status == "fail"
    assert res.severity == "high"


def test_title_present_rule_valid():
    ctx = make_context(title="ACME Widget Corporation")
    res = TitlePresentRule().evaluate(ctx)
    assert res.status == "pass"


def test_title_length_rule():
    ctx_short = make_context(title="Home")
    assert TitleLengthRule().evaluate(ctx_short).status == "warning"

    ctx_opt = make_context(title="ACME Widgets - High Quality Industrial Parts")
    assert TitleLengthRule().evaluate(ctx_opt).status == "pass"

    ctx_long = make_context(title="A" * 75)
    assert TitleLengthRule().evaluate(ctx_long).status == "warning"


def test_title_repetition_rule():
    ctx_repeat = make_context(title="Buy widgets widgets best widgets store widgets")
    assert TitleRepetitionRule().evaluate(ctx_repeat).status == "warning"

    ctx_clean = make_context(title="Buy Premium Tools at ToolStore")
    assert TitleRepetitionRule().evaluate(ctx_clean).status == "pass"


# --- Meta Description Rules ---
def test_meta_desc_present_rule():
    ctx_none = make_context(meta_description=None)
    assert MetaDescriptionPresentRule().evaluate(ctx_none).status == "fail"

    ctx_empty = make_context(meta_description="   ")
    assert MetaDescriptionPresentRule().evaluate(ctx_empty).status == "fail"

    ctx_ok = make_context(meta_description="A comprehensive inventory of industrial widget parts.")
    assert MetaDescriptionPresentRule().evaluate(ctx_ok).status == "pass"


def test_meta_desc_length_rule():
    ctx_short = make_context(meta_description="Short desc")
    assert MetaDescriptionLengthRule().evaluate(ctx_short).status == "warning"

    ctx_ok = make_context(meta_description="A" * 120)
    assert MetaDescriptionLengthRule().evaluate(ctx_ok).status == "pass"

    ctx_long = make_context(meta_description="B" * 175)
    assert MetaDescriptionLengthRule().evaluate(ctx_long).status == "warning"


# --- Heading Rules ---
def test_h1_presence_rule():
    ctx_zero = make_context(headings_json={"counts": {"h1": 0}})
    assert H1PresenceRule().evaluate(ctx_zero).status == "warning"

    ctx_one = make_context(headings_json={"counts": {"h1": 1}})
    assert H1PresenceRule().evaluate(ctx_one).status == "pass"


def test_h1_multiple_rule():
    ctx_multi = make_context(headings_json={"counts": {"h1": 3}})
    assert H1MultipleRule().evaluate(ctx_multi).status == "warning"

    ctx_single = make_context(headings_json={"counts": {"h1": 1}})
    assert H1MultipleRule().evaluate(ctx_single).status == "pass"


def test_h1_empty_rule():
    ctx_empty_text = make_context(headings_json={"counts": {"h1": 1}, "h1": ["   "]})
    assert H1EmptyRule().evaluate(ctx_empty_text).status == "fail"

    ctx_has_text = make_context(headings_json={"counts": {"h1": 1}, "h1": ["Welcome to ACME"]})
    assert H1EmptyRule().evaluate(ctx_has_text).status == "pass"


def test_heading_hierarchy_rule():
    # Large jump: H2 exists, H3 is 0, H4 > 0
    ctx_jump = make_context(headings_json={"counts": {"h1": 1, "h2": 2, "h3": 0, "h4": 1, "h5": 0, "h6": 0}})
    assert HeadingHierarchyRule().evaluate(ctx_jump).status == "warning"

    ctx_ordered = make_context(headings_json={"counts": {"h1": 1, "h2": 2, "h3": 3, "h4": 1, "h5": 0, "h6": 0}})
    assert HeadingHierarchyRule().evaluate(ctx_ordered).status == "pass"


# --- Canonical Rules ---
def test_canonical_presence_rule():
    ctx_missing = make_context(canonical_url=None)
    assert CanonicalPresenceRule().evaluate(ctx_missing).status == "warning"

    ctx_present = make_context(canonical_url="https://example.com")
    assert CanonicalPresenceRule().evaluate(ctx_present).status == "pass"


def test_canonical_valid_rule():
    ctx_malformed = make_context(canonical_url="not-a-url")
    assert CanonicalValidRule().evaluate(ctx_malformed).status == "fail"

    ctx_self = make_context(url="https://example.com/item", canonical_url="https://example.com/item")
    assert CanonicalValidRule().evaluate(ctx_self).status == "pass"

    ctx_cross_domain = make_context(url="https://example.com/item", canonical_url="https://external.com/item")
    assert CanonicalValidRule().evaluate(ctx_cross_domain).status == "warning"


# --- Image Rules ---
def test_image_alt_rules():
    ctx_no_images = make_context(image_count=0)
    assert ImageAltMissingRule().evaluate(ctx_no_images).status == "not_applicable"

    ctx_missing = make_context(image_count=5, missing_alt_count=2)
    assert ImageAltMissingRule().evaluate(ctx_missing).status == "fail"

    ctx_decorative_empty = make_context(image_count=5, missing_alt_count=0, empty_alt_count=2)
    assert ImageAltEmptyRule().evaluate(ctx_decorative_empty).status == "warning"

    ctx_clean = make_context(image_count=5, missing_alt_count=0, empty_alt_count=0)
    assert ImageAltMissingRule().evaluate(ctx_clean).status == "pass"
    assert ImageAltEmptyRule().evaluate(ctx_clean).status == "pass"


# --- Link Rules ---
def test_link_rules():
    ctx_orphan = make_context(internal_link_count=0)
    assert InternalOutlinksRule().evaluate(ctx_orphan).status == "warning"

    ctx_links = make_context(internal_link_count=5)
    assert InternalOutlinksRule().evaluate(ctx_links).status == "pass"

    # Empty anchor check
    l1 = CrawlLink(destination_url="https://example.com/a", link_text="Product Page")
    l2 = CrawlLink(destination_url="https://example.com/b", link_text="   ")
    ctx_empty_anchor = make_context(links=[l1, l2])
    assert EmptyAnchorTextRule().evaluate(ctx_empty_anchor).status == "warning"


# --- HTML Lang Rules ---
def test_html_lang_rule():
    ctx_missing = make_context(html_lang=None)
    assert HtmlLanguageRule().evaluate(ctx_missing).status == "warning"

    ctx_empty = make_context(html_lang="")
    assert HtmlLanguageRule().evaluate(ctx_empty).status == "warning"

    ctx_valid = make_context(html_lang="en-US")
    assert HtmlLanguageRule().evaluate(ctx_valid).status == "pass"

    ctx_invalid = make_context(html_lang="invalid_123_lang")
    assert HtmlLanguageRule().evaluate(ctx_invalid).status == "warning"
