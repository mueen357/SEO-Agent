"""Audit lifecycle endpoints."""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.schemas.audit import (
    AuditCancelResponse,
    AuditCreateRequest,
    AuditIssuesCollectionResponse,
    AuditListResponse,
    AuditPagesCollectionResponse,
    AuditResponse,
)
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audits", tags=["Audits"])


@router.post(
    "",
    response_model=AuditResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create Persistent Audit Job",
    description=(
        "Validate target URL, check SSRF safety, record idempotency key, and create "
        "a persistent audit record in 'created' state. Crawling is decoupled and handled in later phases."
    )
)
async def create_audit(
    request: AuditCreateRequest,
    response: Response,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db)
) -> AuditResponse:
    service = AuditService(db)
    audit, is_replay = await service.create_audit(
        request=request,
        idempotency_key=idempotency_key
    )

    if is_replay:
        # Idempotent re-submission returns 200 OK
        response.status_code = status.HTTP_200_OK

    return AuditResponse.model_validate(audit)


@router.get(
    "/{audit_id}",
    response_model=AuditResponse,
    summary="Retrieve Audit Details",
    description="Retrieve the current status, configuration, and metrics for a specific audit by UUID."
)
async def get_audit(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AuditResponse:
    service = AuditService(db)
    audit = await service.get_audit(audit_id)
    return AuditResponse.model_validate(audit)


@router.get(
    "",
    response_model=AuditListResponse,
    summary="List Audits with Pagination & Filtering",
    description="Query persistent audit records ordered newest-first with pagination and optional status/hostname filters."
)
async def list_audits(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by status (e.g. 'created', 'completed')"),
    hostname: Optional[str] = Query(None, description="Filter by hostname (e.g. 'example.com')"),
    db: AsyncSession = Depends(get_db)
) -> AuditListResponse:
    service = AuditService(db)
    audits, total = await service.list_audits(
        page=page,
        page_size=page_size,
        status=status,
        hostname=hostname
    )

    items = [AuditResponse.model_validate(a) for a in audits]
    return AuditListResponse.create(
        audits=items,
        total=total,
        page=page,
        page_size=page_size
    )


@router.post(
    "/{audit_id}/cancel",
    response_model=AuditCancelResponse,
    summary="Cancel Audit Job",
    description="Transition an active or queued audit to 'cancelled'. Rejected if the audit is already in a terminal state."
)
async def cancel_audit(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AuditCancelResponse:
    service = AuditService(db)
    audit = await service.cancel_audit(audit_id)
    return AuditCancelResponse(
        message=f"Audit '{audit_id}' successfully cancelled.",
        audit=AuditResponse.model_validate(audit)
    )


@router.get(
    "/{audit_id}/pages",
    response_model=AuditPagesCollectionResponse,
    summary="Retrieve Crawled Pages for Audit",
    description="Returns pages crawled for this audit. Returns empty collection with informational message (crawling scheduled for Phase 1.4)."
)
async def get_audit_pages(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AuditPagesCollectionResponse:
    service = AuditService(db)
    # Ensure audit exists
    await service.get_audit(audit_id)
    return AuditPagesCollectionResponse(audit_id=audit_id)


@router.get(
    "/{audit_id}/issues",
    response_model=AuditIssuesCollectionResponse,
    summary="Retrieve Detected SEO Issues for Audit",
    description="Returns detected SEO issues. Returns empty collection with informational message (issue detection scheduled for Phase 1.5)."
)
async def get_audit_issues(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AuditIssuesCollectionResponse:
    service = AuditService(db)
    # Ensure audit exists
    await service.get_audit(audit_id)
    return AuditIssuesCollectionResponse(audit_id=audit_id)
