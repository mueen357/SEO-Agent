"""Audit repository handling all database persistence operations."""

import hashlib
import json
import uuid
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, IdempotencyRecord


class AuditRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_audit(self, audit: Audit) -> Audit:
        self.session.add(audit)
        await self.session.commit()
        await self.session.refresh(audit)
        return audit

    async def get_audit_by_id(self, audit_id: uuid.UUID) -> Optional[Audit]:
        stmt = select(Audit).where(Audit.id == audit_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_audits(
        self,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        hostname: Optional[str] = None
    ) -> Tuple[List[Audit], int]:
        query = select(Audit)
        count_query = select(func.count(Audit.id))

        if status:
            query = query.where(Audit.status == status)
            count_query = count_query.where(Audit.status == status)
        if hostname:
            query = query.where(Audit.hostname == hostname.lower())
            count_query = count_query.where(Audit.hostname == hostname.lower())

        total_res = await self.session.execute(count_query)
        total = total_res.scalar() or 0

        offset = (page - 1) * page_size
        query = query.order_by(Audit.created_at.desc()).offset(offset).limit(page_size)

        audits_res = await self.session.execute(query)
        audits = list(audits_res.scalars().all())

        return audits, total

    async def update_audit(self, audit: Audit) -> Audit:
        await self.session.commit()
        await self.session.refresh(audit)
        return audit

    async def get_idempotency_record(self, key: str) -> Optional[IdempotencyRecord]:
        stmt = select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == key)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_idempotency_record(
        self,
        key: str,
        request_hash: str,
        audit_id: uuid.UUID
    ) -> IdempotencyRecord:
        record = IdempotencyRecord(
            idempotency_key=key,
            request_hash=request_hash,
            audit_id=audit_id
        )
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record


def compute_request_hash(normalized_url: str, mode: str, max_pages: int, config: Dict[str, Any]) -> str:
    """Compute deterministic SHA-256 hash of normalized request parameters."""
    payload = {
        "normalized_url": normalized_url,
        "mode": mode,
        "max_pages": max_pages,
        "configuration": config
    }
    dumped = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(dumped.encode("utf-8")).hexdigest()
