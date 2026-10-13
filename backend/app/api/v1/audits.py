"""Audit lifecycle endpoints including start, pagination, pages, and sitemaps."""

import math
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
from app.schemas.crawl import (
    AuditStartResponse,
    CrawlPageResponse,
    CrawlSitemapResponse,
    CrawlSitemapsListResponse,
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
        "a persistent audit record in 'created' state. Crawling is decoupled and handled in background."
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
        response.status_code = status.HTTP_200_OK

    return AuditResponse.model_validate(audit)


@router.post(
    "/{audit_id}/start",
    response_model=AuditStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start Website Crawl Execution",
    description=(
        "Validate that the audit is in 'created' state and transition it to 'queued' for "
        "background crawl worker execution. Rejects duplicate starts and verified_owner mode."
    )
)
async def start_audit(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AuditStartResponse:
    service = AuditService(db)
    audit = await service.start_audit(audit_id)
    return AuditStartResponse(
        message=f"Audit '{audit_id}' has been queued for background crawling.",
        audit_id=audit.id,
        status=audit.status,
    )


@router.get(
    "/{audit_id}",
    response_model=AuditResponse,
    summary="Retrieve Audit Details",
    description="Retrieve the current status, configuration, and progress metrics for a specific audit by UUID."
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
    description="Returns real persisted page records discovered and crawled for this audit with pagination."
)
async def get_audit_pages(
    audit_id: uuid.UUID,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db)
) -> AuditPagesCollectionResponse:
    service = AuditService(db)
    pages, total = await service.get_audit_pages(audit_id, page=page, page_size=page_size)
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    message = None
    if total == 0:
        message = "Page crawling has not been executed yet. The core crawling pipeline is scheduled for Phase 1.4."

    items = [CrawlPageResponse.model_validate(p) for p in pages]
    return AuditPagesCollectionResponse(
        audit_id=audit_id,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        pages=items,
        message=message,
    )


@router.get(
    "/{audit_id}/sitemaps",
    response_model=CrawlSitemapsListResponse,
    summary="Retrieve Discovered Sitemaps for Audit",
    description="Returns real discovered and parsed XML sitemaps for this audit."
)
async def get_audit_sitemaps(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> CrawlSitemapsListResponse:
    service = AuditService(db)
    sitemaps = await service.get_audit_sitemaps(audit_id)
    items = [CrawlSitemapResponse.model_validate(s) for s in sitemaps]
    return CrawlSitemapsListResponse(
        audit_id=audit_id,
        total=len(items),
        sitemaps=items,
    )


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
    await service.get_audit(audit_id)
    return AuditIssuesCollectionResponse(audit_id=audit_id)
