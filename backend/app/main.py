"""Website Audit Agent - Backend Application Service."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="Website Audit Agent API",
    description="Backend API service for AI-Powered Website Audit Chrome Extension",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Safer Development CORS Policy:
# - Explicitly permits local development addresses and Vite dev servers
# - Uses regex to permit requests originating from Chrome Extensions (chrome-extension://<id>)
# - Disables cross-origin credentials since session cookies/credentials are not used for health/audit APIs
# - Future Production Policy: Restrict allow_origins to the specific published Chrome Extension ID
DEVELOPMENT_ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEVELOPMENT_ALLOWED_ORIGINS,
    allow_origin_regex=r"^chrome-extension://[a-z0-9]+$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

class HealthResponse(BaseModel):
    status: str
    service: str

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def get_health() -> HealthResponse:
    """Return health status of the audit backend service."""
    return HealthResponse(
        status="ok",
        service="website-audit-api"
    )

if __name__ == "__main__":
    import uvicorn
    # Keep development binding strictly on 127.0.0.1
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)