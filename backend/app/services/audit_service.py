"""Audit service managing business logic, URL validation, idempotency, lifecycle, and crawl queries."""

import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import ConflictError, NotFoundError
from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage, CrawlSitemap
from app.repositories.audit_repository import AuditRepository, compute_request_hash
from app.repositories.crawl_repository import CrawlRepository
from app.schemas.audit import AuditCreateRequest
from app.services.crawl_service import CrawlService
from app.services.url_validation import validate_and_normalize_url

TERMINAL_STATUSES = {
    AuditStatus.completed.value,
    AuditStatus.partially_completed.value,
    AuditStatus.failed.value,
    AuditStatus.cancelled.value,
}


class AuditService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = AuditRepository(session)
        self.crawl_repo = CrawlRepository(session)
        self.crawl_service = CrawlService(session)
        self.settings = get_settings()

    async def create_audit(
        self,
        request: AuditCreateRequest,
        idempotency_key: Optional[str] = None
    ) -> Tuple[Audit, bool]:
        """Validate URL and idempotency, then create an audit in 'created' status."""
        validated_url = validate_and_normalize_url(request.target_url)
        normalized_url = validated_url.normalized_url
        hostname = validated_url.hostname

        max_pages = request.max_pages
        if max_pages is None:
            max_pages = 1 if request.mode == AuditMode.quick else self.settings.default_max_pages_full

        current_request_hash = compute_request_hash(
            normalized_url=normalized_url,
            mode=request.mode.value,
            max_pages=max_pages,
            config=request.configuration,
        )

        if idempotency_key:
            record = await self.repo.get_idempotency_record(idempotency_key)
            if record:
                if record.request_hash != current_request_hash:
                    raise ConflictError(
                        f"Idempotency key '{idempotency_key}' was previously used with different request parameters."
                    )
                existing_audit = await self.repo.get_audit_by_id(record.audit_id)
                if existing_audit:
                    return existing_audit, True

        audit = Audit(
            target_url=request.target_url,
            normalized_url=normalized_url,
            hostname=hostname,
            mode=request.mode.value,
            status=AuditStatus.created.value,
            max_pages=max_pages,
            configuration_json=request.configuration,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        saved_audit = await self.repo.create_audit(audit)

        if idempotency_key:
            await self.repo.create_idempotency_record(
                key=idempotency_key,
                audit_id=saved_audit.id,
                request_hash=current_request_hash
            )

        return saved_audit, False

    async def get_audit(self, audit_id: uuid.UUID) -> Audit:
        audit = await self.repo.get_audit_by_id(audit_id)
        if not audit:
            raise NotFoundError(f"Audit '{audit_id}' was not found.")
        return audit

    async def list_audits(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        hostname: Optional[str] = None
    ) -> Tuple[List[Audit], int]:
        return await self.repo.list_audits(
            page=page,
            page_size=page_size,
            status=status,
            hostname=hostname
        )

    async def cancel_audit(self, audit_id: uuid.UUID) -> Audit:
        audit = await self.get_audit(audit_id)

        if audit.status in TERMINAL_STATUSES:
            raise ConflictError(
                f"Audit '{audit_id}' cannot be cancelled because it is already in terminal state '{audit.status}'."
            )

        audit.status = AuditStatus.cancelled.value
        audit.completed_at = datetime.now(timezone.utc)
        return await self.repo.update_audit(audit)

    async def start_audit(self, audit_id: uuid.UUID) -> Audit:
        """Start an audit by transitioning to 'queued' for background worker pickup."""
        return await self.crawl_service.start_audit(audit_id)

    async def get_audit_pages(
        self,
        audit_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[CrawlPage], int]:
        """Retrieve paginated crawled page records."""
        # Ensure audit exists
        await self.get_audit(audit_id)
        return await self.crawl_repo.get_pages(audit_id=audit_id, page=page, page_size=page_size)

    async def get_audit_sitemaps(
        self,
        audit_id: uuid.UUID
    ) -> List[CrawlSitemap]:
        """Retrieve discovered sitemaps for the audit."""
        # Ensure audit exists
        await self.get_audit(audit_id)
        return await self.crawl_repo.get_sitemaps(audit_id=audit_id)
