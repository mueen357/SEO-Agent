Write-Host "Starting Website Audit Agent FastAPI Backend..." -ForegroundColor Cyan
Push-Location "D:\Website-Audit-Agent\backend"
try {
    & ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
} finally {
    Pop-Location
}