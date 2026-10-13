"""Data structures for rule assessments and issue persistence."""

import hashlib
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class RuleAssessment:
    """Structured evaluation result emitted by an audit rule."""

    rule_id: str
    category: str
    subcategory: str
    title: str
    description: str
    severity: str
    status: str
    evidence: Dict[str, Any] = field(default_factory=dict)
    recommendation: str = ""
    source_type: str = "raw_http"
    confidence: float = 1.0
    documentation_url: Optional[str] = None
    rule_version: str = "1.0.0"

    def compute_fingerprint(self, audit_id: uuid.UUID, crawl_page_id: Optional[uuid.UUID]) -> str:
        """Deterministic fingerprint for deduplication and idempotent upserts."""
        key = f"{audit_id}:{crawl_page_id or 'site'}:{self.rule_id}:{self.source_type}:{self.rule_version}"
        return hashlib.sha256(key.encode("utf-8")).hexdigest()
