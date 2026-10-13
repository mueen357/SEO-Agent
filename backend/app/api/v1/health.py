"""Health check endpoint preserving backward-compatible JSON schema."""

from fastapi import APIRouter
from app.schemas.common import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check",
    description="Returns the operational health status of the audit backend service."
)
async def get_health() -> HealthResponse:
    """Return health status of the audit backend service."""
    return HealthResponse(
        status="ok",
        service="website-audit-api"
    )
