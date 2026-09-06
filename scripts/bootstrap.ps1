# One-shot local setup after clone: deps + Chromium + demo stack + short check.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Node deps"
if (Test-Path 'package-lock.json') {
  npm ci
} else {
  npm install
}

Write-Host "==> Playwright Chromium"
npm run browser:install

Write-Host "==> Demo stack"
& "$PSScriptRoot\start-local.ps1"

Write-Host "==> Preflight"
npm run browser:performance:check

Write-Host ""
Write-Host "Bootstrap done. Full run:"
Write-Host "  npm run browser:performance"
Write-Host ""
Write-Host "Grafana dashboard (after a run with INFLUX_ENABLED=true):"
Write-Host "  http://127.0.0.1:3000/d/browser-performance-lighthouse"
