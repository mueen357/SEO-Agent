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
    fingerprint_key: Optional[str] = None

    def compute_fingerprint(self, audit_id: uuid.UUID, crawl_page_id: Optional[uuid.UUID]) -> str:
        """Deterministic fingerprint for deduplication and idempotent upserts."""
        if crawl_page_id:
            scope_part = str(crawl_page_id)
        else:
            group_key = (
                self.fingerprint_key
                or self.evidence.get("group_id")
                or self.evidence.get("group_fingerprint")
                or "site"
            )
            scope_part = f"site:{group_key}"
        key = f"{audit_id}:{scope_part}:{self.rule_id}:{self.source_type}:{self.rule_version}"
        return hashlib.sha256(key.encode("utf-8")).hexdigest()
