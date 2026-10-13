"""Configuration policies and data structures for dynamic JavaScript rendering."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional, Set, Tuple


class RenderStrategy(str, Enum):
    HTTP_ONLY = "HTTP_ONLY"
    RENDER_RECOMMENDED = "RENDER_RECOMMENDED"
    RENDER_REQUIRED = "RENDER_REQUIRED"
    RENDER_UNAVAILABLE = "RENDER_UNAVAILABLE"


class RenderMode(str, Enum):
    never = "never"
    auto = "auto"
    always = "always"


@dataclass
class RenderPolicy:
    render_mode: RenderMode = RenderMode.auto
    navigation_timeout: float = 20.0
    render_timeout: float = 25.0
    hydration_wait: float = 1.5
    max_dom_size_bytes: int = 5 * 1024 * 1024  # 5 MB
    max_concurrent_contexts: int = 2
    enable_screenshots: bool = False
    screenshot_dimensions_desktop: Tuple[int, int] = (1280, 800)
    screenshot_dimensions_mobile: Tuple[int, int] = (375, 667)
    allow_public_rendering: bool = False  # Disabled by default on unisolated host
    allowed_schemes: Set[str] = field(default_factory=lambda: {"http", "https"})
    allowed_ports: Set[int] = field(default_factory=lambda: {80, 443})


@dataclass
class RenderDecision:
    strategy: RenderStrategy
    reason: str
    evidence: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RenderResult:
    status: str  # "success", "failed", "skipped", "unavailable"
    decision: RenderDecision
    rendered_html: Optional[str] = None
    rendered_url: Optional[str] = None
    response_time_ms: Optional[int] = None
    performance_metrics: Optional[Dict[str, Any]] = None
    screenshot_desktop_path: Optional[str] = None
    screenshot_mobile_path: Optional[str] = None
    error_message: Optional[str] = None
