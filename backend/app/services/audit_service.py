"""Audit service managing business logic, URL validation, idempotency, and lifecycle."""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import ConflictError, NotFoundError
from app.database.models import Audit, AuditMode, AuditStatus
from app.repositories.audit_repository import AuditRepository, compute_request_hash
from app.schemas.audit import AuditCreateRequest
from app.services.url_validation import validate_and_normalize_url

TERMINAL_STATUSES = {
    AuditStatus.completed.value,
    AuditStatus.partially_completed.value,
    AuditStatus.failed.value,
    AuditStatus.cancelled.value,
}


class AuditService:
    def __init__(self, session: AsyncSession):
        self.repo = AuditRepository(session)
        self.settings = get_settings()

    async def create_audit(
        self,
        request: AuditCreateRequest,
        idempotency_key: Optional[str] = None,
        check_dns: bool = True
    ) -> Tuple[Audit, bool]:
        """Validate, normalize, check idempotency, and create a persistent audit record.

        Returns:
            Tuple[Audit, bool]: (audit_record, is_replay)
        """
        # 1. URL validation & normalization (SSRF protection)
        validated = validate_and_normalize_url(request.target_url, check_dns=check_dns)

        # 2. Page limits based on mode
        if request.max_pages is not None:
            max_pages = min(request.max_pages, self.settings.max_allowed_pages)
        else:
            if request.mode == AuditMode.quick:
                max_pages = self.settings.default_max_pages_quick
            else:
                max_pages = self.settings.default_max_pages_full

        # 3. Idempotency handling
        request_hash = compute_request_hash(
            normalized_url=validated.normalized_url,
            mode=request.mode.value,
            max_pages=max_pages,
            config=request.configuration
        )

        if idempotency_key:
            existing_record = await self.repo.get_idempotency_record(idempotency_key)
            if existing_record:
                if existing_record.request_hash == request_hash:
                    # Idempotent replay: return previously created audit
                    existing_audit = await self.repo.get_audit_by_id(existing_record.audit_id)
                    if existing_audit:
                        return existing_audit, True
                else:
                    # Key reuse with conflicting payload
                    raise ConflictError(
                        f"Idempotency key '{idempotency_key}' was previously used with different request parameters."
                    )

        # 4. Construct persistent Audit model
        audit = Audit(
            target_url=validated.target_url,
            normalized_url=validated.normalized_url,
            hostname=validated.hostname,
            mode=request.mode.value,
            status=AuditStatus.created.value,
            max_pages=max_pages,
            pages_discovered=0,
            pages_crawled=0,
            configuration_json=request.configuration,
            error_message=None
        )

        created_audit = await self.repo.create_audit(audit)

        # 5. Persist idempotency key if provided
        if idempotency_key:
            await self.repo.create_idempotency_record(
                key=idempotency_key,
                request_hash=request_hash,
                audit_id=created_audit.id
            )

        return created_audit, False

    async def get_audit(self, audit_id: uuid.UUID) -> Audit:
        audit = await self.repo.get_audit_by_id(audit_id)
        if not audit:
            raise NotFoundError(f"Audit with ID '{audit_id}' does not exist.")
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
                f"Cannot cancel audit '{audit_id}' because it is already in terminal state '{audit.status}'."
            )

        audit.status = AuditStatus.cancelled.value
        audit.completed_at = datetime.now(timezone.utc)
        audit.updated_at = datetime.now(timezone.utc)

        return await self.repo.update_audit(audit)
