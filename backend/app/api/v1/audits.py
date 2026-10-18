from app.schemas.scoring import (
    PrioritiesListResponse,
    PriorityItemResponse,
    ScoreBreakdownResponse,
    ScoreCoverageResponse,
    ScorecardResponse,
)
from app.services.scoring_service import ScoringService
from app.schemas.technology import (
    AnalyzeTechnologiesResponse,
    TechnologyFindingResponse,
    TechnologyListResponse,
    TechnologySummaryResponse,
    WordPressPluginResponse,
    WordPressThemeResponse,
)
from app.services.technology_service import TechnologyService
"""Audit lifecycle endpoints including start, pagination, pages, and sitemaps."""

import math
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database.session import get_db
from app.schemas.audit import (
    AuditCancelResponse,
    AuditCreateRequest,
    AuditIssuesCollectionResponse,
    AuditListResponse,
    AuditPagesCollectionResponse,
    AuditResponse,
)
from app.schemas.issues import (
    AnalyzeAuditResponse,
    IssueSummaryResponse,
    LinkGraphSummaryResponse,
    PaginatedFindingGroupsResponse,
    PaginatedIssuesResponse,
    SiteWideSummaryResponse,
)
from app.services.issue_service import IssueService
from app.schemas.crawl import (
    AuditStartResponse,
    CrawlPageResponse,
    CrawlSitemapResponse,
    CrawlSitemapsListResponse,
)
from app.services.audit_service import AuditService
from app.services.audit_pipeline_service import AuditPipelineService

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
    response_model=PaginatedIssuesResponse,
    summary="Retrieve Detected SEO Issues for Audit",
    description="Returns paginated, filterable SEO issues produced by deterministic rule engines."
)
async def get_audit_issues(
    audit_id: uuid.UUID,
    category: Optional[str] = Query(None, description="Filter issues by category (e.g. on_page, images, links)"),
    severity: Optional[str] = Query(None, description="Filter issues by severity (critical, high, medium, low, info)"),
    status: Optional[str] = Query(None, description="Filter issues by assessment status (pass, warning, fail, unknown)"),
    crawl_page_id: Optional[uuid.UUID] = Query(None, description="Filter issues for a specific crawled page"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db)
) -> PaginatedIssuesResponse:
    service = IssueService(db)
    return await service.get_audit_issues(
        audit_id=audit_id,
        category=category,
        severity=severity,
        status=status,
        crawl_page_id=crawl_page_id,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/{audit_id}/analyze",
    response_model=AnalyzeAuditResponse,
    summary="Execute Deterministic SEO Analysis",
    description="Evaluates crawled pages for the audit against registered deterministic SEO rules (on_page, technical, or all) and persists findings."
)
async def analyze_audit(
    audit_id: uuid.UUID,
    category: Optional[str] = Query(None, description="Category to analyze: 'on_page', 'technical', or 'all'"),
    db: AsyncSession = Depends(get_db)
) -> AnalyzeAuditResponse:
    service = IssueService(db)
    return await service.run_analysis(audit_id, category=category)


@router.post(
    "/{audit_id}/analyze/technical",
    response_model=AnalyzeAuditResponse,
    summary="Execute Technical SEO Analysis",
    description="Evaluates crawled pages and site-level context against registered technical SEO rules and persists findings."
)
async def analyze_technical_audit(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AnalyzeAuditResponse:
    service = IssueService(db)
    return await service.run_technical_analysis(audit_id)


@router.get(
    "/{audit_id}/issues/summary",
    response_model=IssueSummaryResponse,
    summary="Retrieve SEO Issues Aggregate Summary",
    description="Returns aggregate counts of detected issues grouped by category, severity, and assessment status."
)
async def get_audit_issues_summary(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> IssueSummaryResponse:
    service = IssueService(db)
    return await service.get_summary(audit_id)


@router.post(
    "/{audit_id}/analyze/sitewide",
    response_model=AnalyzeAuditResponse,
    summary="Execute Site-Wide SEO and Topological Analysis",
    description="Evaluates all 13 site-wide rules: duplicate content, duplicate metadata, internal link graph, broken internal links, redirects, and canonical consolidation."
)
async def analyze_sitewide_audit(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AnalyzeAuditResponse:
    service = IssueService(db)
    return await service.run_sitewide_analysis(audit_id)


@router.get(
    "/{audit_id}/sitewide/summary",
    response_model=SiteWideSummaryResponse,
    summary="Retrieve Site-Wide Intelligence Summary",
    description="Returns aggregate counts of exact and near duplicate groups, duplicate metadata, and crawl coverage."
)
async def get_sitewide_summary(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> SiteWideSummaryResponse:
    service = IssueService(db)
    return await service.get_sitewide_summary(audit_id)


@router.get(
    "/{audit_id}/sitewide/duplicate-groups",
    response_model=PaginatedFindingGroupsResponse,
    summary="Retrieve Duplicate Content & Metadata Finding Groups",
    description="Returns paginated duplicate groups with affected URLs and similarity evidence."
)
async def get_sitewide_duplicate_groups(
    audit_id: uuid.UUID,
    rule_id: Optional[str] = Query(None, description="Filter by rule ID (e.g. SITE_CONTENT_DUPLICATE_EXACT)"),
    group_type: Optional[str] = Query(None, description="Filter by group type (e.g. exact_duplicate_content, near_duplicate_content)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db)
) -> PaginatedFindingGroupsResponse:
    service = IssueService(db)
    return await service.get_sitewide_duplicate_groups(
        audit_id=audit_id,
        rule_id=rule_id,
        group_type=group_type,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{audit_id}/sitewide/link-graph",
    response_model=LinkGraphSummaryResponse,
    summary="Retrieve Internal Link Graph & Topological Metrics",
    description="Constructs and returns internal link graph nodes, depth, inlinks, outlinks, and orphan caveats."
)
async def get_sitewide_link_graph(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> LinkGraphSummaryResponse:
    service = IssueService(db)
    return await service.get_sitewide_link_graph(audit_id)


@router.post(
    "/{audit_id}/score",
    response_model=ScorecardResponse,
    status_code=status.HTTP_200_OK,
    summary="Calculate or Recalculate SEO Health Scorecard",
    description="Computes evidence-based SEO health scores (0-100), category breakdowns, and priority actions idempotently."
)
async def compute_audit_score(
    audit_id: uuid.UUID,
    force: bool = Query(False, description="Force recalculation even if evidence has not changed"),
    db: AsyncSession = Depends(get_db)
) -> ScorecardResponse:
    service = ScoringService(db)
    card = await service.compute_score(audit_id=audit_id, force=force)
    return ScorecardResponse.model_validate(card)


@router.get(
    "/{audit_id}/score",
    response_model=ScorecardResponse,
    summary="Get Audit Health Scorecard",
    description="Returns the SEO Health Scorecard for an audit, detecting staleness if underlying evidence changed."
)
async def get_audit_score(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> ScorecardResponse:
    service = ScoringService(db)
    card = await service.get_scorecard(audit_id=audit_id)
    return ScorecardResponse.model_validate(card)


@router.get(
    "/{audit_id}/score/breakdown",
    response_model=ScoreBreakdownResponse,
    summary="Get Audit Health Score Breakdown",
    description="Returns category health scores, rule contribution points, and top deductions."
)
async def get_audit_score_breakdown(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> ScoreBreakdownResponse:
    service = ScoringService(db)
    data = await service.get_breakdown(audit_id=audit_id)
    return ScoreBreakdownResponse(**data)


@router.get(
    "/{audit_id}/score/coverage",
    response_model=ScoreCoverageResponse,
    summary="Get Evidence Coverage & Confidence",
    description="Returns coverage ratio, completeness label, and audit state."
)
async def get_audit_score_coverage(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> ScoreCoverageResponse:
    service = ScoringService(db)
    data = await service.get_coverage(audit_id=audit_id)
    return ScoreCoverageResponse(**data)


@router.get(
    "/{audit_id}/priorities",
    response_model=PrioritiesListResponse,
    summary="Get Prioritized Remediation Actions",
    description="Returns ordered, actionable SEO remediation items categorized into P0-P3 priority tiers."
)
async def get_audit_priorities(
    audit_id: uuid.UUID,
    priority_tier: Optional[str] = Query(None, description="Filter by tier: P0, P1, P2, P3"),
    category: Optional[str] = Query(None, description="Filter by category: on_page, technical, sitewide"),
    rule_id: Optional[str] = Query(None, description="Filter by rule ID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db)
) -> PrioritiesListResponse:
    service = ScoringService(db)
    offset = (page - 1) * page_size
    items, total, tier_counts = await service.get_priorities(
        audit_id=audit_id,
        priority_tier=priority_tier,
        category=category,
        rule_id=rule_id,
        limit=page_size,
        offset=offset,
    )
    return PrioritiesListResponse(
        items=[PriorityItemResponse.model_validate(it) for it in items],
        total=total,
        limit=page_size,
        offset=offset,
        tier_counts=tier_counts,
    )


@router.post(
    "/{audit_id}/technologies/analyze",
    response_model=AnalyzeTechnologiesResponse,
    summary="Analyze Technologies & CMS",
    description="Executes deterministic, passive technology detection across all crawled pages of an audit."
)
async def analyze_audit_technologies(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AnalyzeTechnologiesResponse:
    service = TechnologyService(db)
    technologies, summary = await service.analyze_audit(audit_id)
    return AnalyzeTechnologiesResponse(
        message=f"Successfully analyzed technologies for audit '{audit_id}'. Found {len(technologies)} technologies.",
        audit_id=audit_id,
        technologies_detected=summary.total_detected,
        primary_cms=summary.primary_cms,
        technologies=[TechnologyFindingResponse.model_validate(t) for t in technologies],
        wordpress_themes=[WordPressThemeResponse.model_validate(t) for t in summary.wordpress_themes_json],
        wordpress_plugins=[WordPressPluginResponse.model_validate(p) for p in summary.wordpress_plugins_json],
    )


@router.post(
    "/{audit_id}/technologies/reanalyze",
    response_model=AnalyzeTechnologiesResponse,
    summary="Re-Analyze Existing Audit Technologies",
    description="Re-evaluates technology stack using persisted crawl evidence and updated fingerprint catalog without re-crawling."
)
async def reanalyze_audit_technologies(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> AnalyzeTechnologiesResponse:
    service = TechnologyService(db)
    technologies, summary = await service.reanalyze_audit(audit_id)
    return AnalyzeTechnologiesResponse(
        message=f"Successfully re-analyzed technologies for audit '{audit_id}'. Found {len(technologies)} technologies.",
        audit_id=audit_id,
        technologies_detected=summary.total_detected,
        primary_cms=summary.primary_cms,
        technologies=[TechnologyFindingResponse.model_validate(t) for t in technologies],
        wordpress_themes=[WordPressThemeResponse.model_validate(t) for t in summary.wordpress_themes_json],
        wordpress_plugins=[WordPressPluginResponse.model_validate(p) for p in summary.wordpress_plugins_json],
    )


@router.get(
    "/{audit_id}/technologies",
    response_model=TechnologyListResponse,
    summary="Get Detected Technologies",
    description="Returns ordered, evidence-backed technologies observed across the audit."
)
async def get_audit_technologies(
    audit_id: uuid.UUID,
    category: Optional[str] = Query(None, description="Filter by category: cms, frontend, backend"),
    status: Optional[str] = Query(None, description="Filter by status: detected, possible, unknown"),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db)
) -> TechnologyListResponse:
    service = TechnologyService(db)
    offset = (page - 1) * page_size
    items, total, themes, plugins = await service.get_technologies(
        audit_id=audit_id,
        category=category,
        status_filter=status,
        min_confidence=min_confidence,
        limit=page_size,
        offset=offset,
    )
    return TechnologyListResponse(
        items=[TechnologyFindingResponse.model_validate(it) for it in items],
        total=total,
        limit=page_size,
        offset=offset,
        wordpress_themes=[WordPressThemeResponse.model_validate(t) for t in themes],
        wordpress_plugins=[WordPressPluginResponse.model_validate(p) for p in plugins],
    )


@router.get(
    "/{audit_id}/technologies/summary",
    response_model=TechnologySummaryResponse,
    summary="Get Technology Executive Summary",
    description="Returns executive summary of detected CMS, frontend frameworks, backend runtimes, themes, and plugins."
)
async def get_audit_technology_summary(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> TechnologySummaryResponse:
    service = TechnologyService(db)
    summary = await service.get_summary(audit_id=audit_id)
    return TechnologySummaryResponse.model_validate(summary)


@router.post(
    "/{audit_id}/complete-analysis",
    response_model=dict,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue Missing Analysis for Existing Audit",
    description="Atomically enqueues missing downstream analysis stages (On-Page, Technical, Site-Wide, Technology, Scoring) on an existing crawl for background worker execution."
)
async def complete_missing_audit_analysis(
    audit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> dict:
    session_factory = async_sessionmaker(bind=db.bind, class_=AsyncSession, expire_on_commit=False, autoflush=False)
    pipeline_svc = AuditPipelineService(session_factory=session_factory)
    result = await pipeline_svc.enqueue_missing_stages(audit_id=audit_id)
    return result


