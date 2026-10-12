Write-Host "Building Chrome Extension..." -ForegroundColor Cyan
Push-Location "D:\Website-Audit-Agent\extension"
try {
    npm run compile
    npm run build
} finally {
    Pop-Location
}