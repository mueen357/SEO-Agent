Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Website Audit Agent - Phase 1 Task 1.1 Verification" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$allPass = $true

# 1. Frontend TypeScript Validation
Write-Host "`n[1/4] Running Extension TypeScript Validation (tsc --noEmit)..." -ForegroundColor Yellow
Push-Location "D:\Website-Audit-Agent\extension"
try {
    npm run compile
    if ($LASTEXITCODE -eq 0) {
        Write-Host ">>> Extension TypeScript: PASS" -ForegroundColor Green
    } else {
        Write-Host ">>> Extension TypeScript: FAIL" -ForegroundColor Red
        $allPass = $false
    }
} finally {
    Pop-Location
}

# 2. Frontend Production Build
Write-Host "`n[2/4] Running Extension Production Build (wxt build)..." -ForegroundColor Yellow
Push-Location "D:\Website-Audit-Agent\extension"
try {
    npm run build
    $manifestPath = "D:\Website-Audit-Agent\extension\.output\chrome-mv3\manifest.json"
    if (Test-Path $manifestPath) {
        $manifest = Get-Content $manifestPath | ConvertFrom-Json
        if ($manifest.manifest_version -eq 3) {
            Write-Host ">>> Extension Build & Manifest V3: PASS" -ForegroundColor Green
        } else {
            Write-Host ">>> Extension Manifest is not V3: FAIL" -ForegroundColor Red
            $allPass = $false
        }
    } else {
        Write-Host ">>> Manifest file not found: FAIL" -ForegroundColor Red
        $allPass = $false
    }
} finally {
    Pop-Location
}

# 3. Backend Unit & Health Tests
Write-Host "`n[3/4] Running Backend Pytest Suite..." -ForegroundColor Yellow
Push-Location "D:\Website-Audit-Agent\backend"
try {
    & ".\.venv\Scripts\pytest.exe" -v
    if ($LASTEXITCODE -eq 0) {
        Write-Host ">>> Backend Pytest Suite: PASS" -ForegroundColor Green
    } else {
        Write-Host ">>> Backend Pytest Suite: FAIL" -ForegroundColor Red
        $allPass = $false
    }
} finally {
    Pop-Location
}

# 4. Playwright Chromium Check
Write-Host "`n[4/4] Verifying Playwright Chromium Browser..." -ForegroundColor Yellow
Push-Location "D:\Website-Audit-Agent\backend"
try {
    & ".\.venv\Scripts\python.exe" -c "from playwright.sync_api import sync_playwright; p = sync_playwright().start(); b = p.chromium.launch(headless=True); print('Playwright Chromium Launched: Version', b.version); b.close(); p.stop()"
    if ($LASTEXITCODE -eq 0) {
        Write-Host ">>> Playwright Chromium Launch: PASS" -ForegroundColor Green
    } else {
        Write-Host ">>> Playwright Chromium Launch: FAIL" -ForegroundColor Red
        $allPass = $false
    }
} finally {
    Pop-Location
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
if ($allPass) {
    Write-Host " ALL PHASE 1 TASK 1.1 VERIFICATIONS PASSED SUCCESSFULLY! " -ForegroundColor Green
} else {
    Write-Host " ONE OR MORE VERIFICATION CHECKS FAILED. " -ForegroundColor Red
}
Write-Host "==========================================================" -ForegroundColor Cyan