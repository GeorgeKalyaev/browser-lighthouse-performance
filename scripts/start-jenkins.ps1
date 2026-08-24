# Start full local stack: Git SCM + Influx + Grafana + Jenkins (+ WebTours)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

& "$PSScriptRoot\setup-git-scm.ps1"

Write-Host "==> Ensuring WebTours"
if (Test-Path 'C:\Users\kalya\k6Test\webtours-docker\docker-compose.yaml') {
  Push-Location 'C:\Users\kalya\k6Test\webtours-docker'
  docker compose up -d
  Pop-Location
}

Write-Host "==> Rebuilding Jenkins (git plugin + SCM job)"
docker compose up -d --build jenkins

Write-Host "==> Waiting for Jenkins"
$deadline = (Get-Date).AddMinutes(6)
do {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-WebRequest 'http://127.0.0.1:8080/login' -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { break }
  } catch {}
  Write-Host "  still starting..."
} while ((Get-Date) -lt $deadline)

try {
  Invoke-WebRequest 'http://127.0.0.1:8086/query?q=CREATE%20DATABASE%20performance' -Method POST -UseBasicParsing | Out-Null
} catch {}

Write-Host ""
Write-Host "Ready:"
Write-Host "  Git SCM:  http://localhost:3001/gitadmin/browser-performance-runner"
Write-Host "  Jenkins:  http://localhost:8080  (admin / admin)  job: browser-performance"
Write-Host "  Grafana:  http://localhost:3000/d/browser-performance-lighthouse  (admin / admin)"
Write-Host "  Influx:   http://localhost:8086  db=performance"
Write-Host "  WebTours: http://127.0.0.1:1080/WebTours/"
Write-Host ""
Write-Host "Jenkins checks out profiles from Git on every build."
Write-Host "To use company GitLab: push this repo there and set GIT_URL in docker-compose / Jenkins."
