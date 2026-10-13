"""Compares raw HTTP metadata with browser-rendered DOM metadata."""

from typing import Any, Dict, Optional


class RawVsRenderedComparator:
    """Produces structured diffs between raw HTTP extraction and rendered browser extraction."""

    @staticmethod
    def compare(
        raw_data: Dict[str, Any],
        rendered_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Compute structured differences and human-readable explanation."""
        if hasattr(raw_data, "__dataclass_fields__"):
            from dataclasses import asdict
            raw_data = asdict(raw_data)
        elif not isinstance(raw_data, dict):
            raw_data = {}

        if hasattr(rendered_data, "__dataclass_fields__"):
            from dataclasses import asdict
            rendered_data = asdict(rendered_data)
        elif not isinstance(rendered_data, dict):
            rendered_data = {}

        raw_title = (raw_data.get("title") or "").strip()
        rendered_title = (rendered_data.get("title") or "").strip()
        title_changed = bool(raw_title != rendered_title)

        raw_desc = (raw_data.get("meta_description") or "").strip()
        rendered_desc = (rendered_data.get("meta_description") or "").strip()
        desc_changed = bool(raw_desc != rendered_desc)

        raw_canon = (raw_data.get("canonical_url") or "").strip()
        rendered_canon = (rendered_data.get("canonical_url") or "").strip()
        canon_changed = bool(raw_canon != rendered_canon)

        raw_headings = raw_data.get("headings_json") or {}
        rendered_headings = rendered_data.get("headings_json") or {}

        raw_h1 = raw_headings.get("h1", [])
        rendered_h1 = rendered_headings.get("h1", [])
        h1_changed = bool(raw_h1 != rendered_h1)

        raw_total_headings = sum(len(raw_headings.get(f"h{i}", [])) for i in range(1, 7))
        rendered_total_headings = sum(len(rendered_headings.get(f"h{i}", [])) for i in range(1, 7))
        headings_added = max(0, rendered_total_headings - raw_total_headings)

        raw_images = raw_data.get("image_count", 0)
        rendered_images = rendered_data.get("image_count", 0)
        images_added = max(0, rendered_images - raw_images)

        raw_links = (raw_data.get("internal_link_count", 0) + raw_data.get("external_link_count", 0))
        rendered_links = (rendered_data.get("internal_link_count", 0) + rendered_data.get("external_link_count", 0))
        links_added = max(0, rendered_links - raw_links)

        # Build summary statement
        observations = []
        if title_changed:
            observations.append(f"title updated from '{raw_title}' to '{rendered_title}'")
        if h1_changed:
            observations.append(f"H1 heading modified (rendered {len(rendered_h1)} vs raw {len(raw_h1)})")
        if headings_added > 0:
            observations.append(f"{headings_added} headings revealed by JavaScript")
        if images_added > 0:
            observations.append(f"{images_added} dynamic images added")
        if links_added > 0:
            observations.append(f"{links_added} additional links discovered")

        if observations:
            summary = "Dynamic rendering revealed changes: " + ", ".join(observations) + "."
            reveals_more = True
        else:
            summary = "Browser-rendered DOM matches raw HTTP metadata; no additional dynamic elements found."
            reveals_more = False

        return {
            "title_changed": title_changed,
            "raw_title": raw_title,
            "rendered_title": rendered_title,
            "meta_description_changed": desc_changed,
            "raw_meta_description": raw_desc,
            "rendered_meta_description": rendered_desc,
            "canonical_changed": canon_changed,
            "raw_canonical_url": raw_canon,
            "rendered_canonical_url": rendered_canon,
            "h1_changed": h1_changed,
            "headings_added_count": headings_added,
            "images_added_count": images_added,
            "links_added_count": links_added,
            "rendered_reveals_more_content": reveals_more,
            "summary": summary,
        }
