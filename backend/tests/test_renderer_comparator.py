"""Tests for Raw vs Rendered metadata comparator (Phase 1.4B)."""

from app.renderer.comparator import RawVsRenderedComparator


def test_comparator_detects_dynamic_content_differences():
    """Verify that title, headings, images, and links added by JavaScript are detected."""
    raw_data = {
        "title": "Loading...",
        "meta_description": "",
        "canonical_url": None,
        "headings_json": {"h1": [], "h2": []},
        "image_count": 0,
        "internal_link_count": 0,
        "external_link_count": 0,
    }

    rendered_data = {
        "title": "Dynamic Single Page Application",
        "meta_description": "Rendered meta description populated by React.",
        "canonical_url": "https://example.com/app",
        "headings_json": {"h1": ["Dynamic Main Heading"], "h2": ["Subheading 1", "Subheading 2"]},
        "image_count": 4,
        "internal_link_count": 5,
        "external_link_count": 2,
    }

    diff = RawVsRenderedComparator.compare(raw_data, rendered_data)
    assert diff["title_changed"] is True
    assert diff["raw_title"] == "Loading..."
    assert diff["rendered_title"] == "Dynamic Single Page Application"
    assert diff["meta_description_changed"] is True
    assert diff["canonical_changed"] is True
    assert diff["h1_changed"] is True
    assert diff["headings_added_count"] == 3
    assert diff["images_added_count"] == 4
    assert diff["links_added_count"] == 7
    assert diff["rendered_reveals_more_content"] is True
    assert "Dynamic rendering revealed changes" in diff["summary"]


def test_comparator_matches_identical_content():
    """When rendered DOM matches raw HTTP, reveals_more is False."""
    content = {
        "title": "Static Page",
        "meta_description": "Static description",
        "canonical_url": "https://example.com/page",
        "headings_json": {"h1": ["Heading 1"]},
        "image_count": 2,
        "internal_link_count": 3,
        "external_link_count": 1,
    }
    diff = RawVsRenderedComparator.compare(content, content)
    assert diff["title_changed"] is False
    assert diff["h1_changed"] is False
    assert diff["headings_added_count"] == 0
    assert diff["rendered_reveals_more_content"] is False
    assert "matches raw HTTP metadata" in diff["summary"]
