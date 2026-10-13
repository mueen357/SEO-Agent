"""Website Audit Agent - Backend Application Service."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import v1_router
from app.config import get_settings
from app.core.errors import AppError, ErrorDetail, ErrorResponse
from app.core.logging import configure_logging, get_logger
from app.database.session import init_db
from app.schemas.common import HealthResponse

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: configure logging and ensure initial DB tables exist
    configure_logging()
    logger.info("Initializing Website Audit Agent API database...")
    await init_db()
    logger.info("Database initialized successfully.")
    yield
    # Shutdown logic
    logger.info("Shutting down Website Audit Agent API.")


def create_application() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="Backend API service for AI-Powered Website Audit Chrome Extension",
        version=settings.app_version,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan
    )

    # CORS Middleware: explicitly permits local dev and Chrome Extension origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_origin_regex=settings.cors_allowed_origin_regex,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Accept", "Idempotency-Key"],
    )

    # Global Exception Handlers for Unified Error Responses
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        error_resp = ErrorResponse(
            error=ErrorDetail(
                code=exc.code,
                message=exc.message,
                details=exc.details
            )
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=error_resp.model_dump()
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        error_resp = ErrorResponse(
            error=ErrorDetail(
                code="UNPROCESSABLE_ENTITY",
                message="Request body or query parameter validation failed.",
                details=exc.errors()
            )
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_resp.model_dump()
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server exception: %s", exc)
        error_resp = ErrorResponse(
            error=ErrorDetail(
                code="INTERNAL_SERVER_ERROR",
                message="An unexpected internal server error occurred."
            )
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_resp.model_dump()
        )

    # Backward-compatible root /health endpoint for existing extension and tests
    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Service Health Check (Root)"
    )
    async def root_health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service="website-audit-api"
        )

    # Mount v1 router at /api/v1
    app.include_router(v1_router, prefix=settings.api_prefix)

    return app


app = create_application()

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
