"""Resource policy for filtering non-essential browser subresources."""

from typing import Set


class ResourcePolicy:
    """Configures rules for blocking media or non-essential assets to optimize rendering."""

    BLOCKED_RESOURCE_TYPES_FAST: Set[str] = {"media", "font"}

    @classmethod
    def should_block_resource(cls, resource_type: str, enable_screenshots: bool = False) -> bool:
        """Determine if a subresource request should be blocked based on rendering mode."""
        if not enable_screenshots and resource_type in {"image", "media", "font"}:
            return True
        if enable_screenshots and resource_type in cls.BLOCKED_RESOURCE_TYPES_FAST:
            return True
        return False
