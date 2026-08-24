# Bootstrap local Git SCM (Gitea), create repo, push current project.
# For company GitLab: create the project there, change remote URL, push — Jenkins GIT_URL follows.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Starting Gitea + InfluxDB + Grafana"
docker compose up -d gitea influxdb grafana

Write-Host "==> Waiting for Gitea"
$deadline = (Get-Date).AddMinutes(3)
do {
  Start-Sleep -Seconds 3
  try {
    $r = Invoke-WebRequest 'http://127.0.0.1:3001/' -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { break }
  } catch {}
} while ((Get-Date) -lt $deadline)

Write-Host "==> Ensuring admin user"
docker compose exec -T gitea gitea admin user create --admin --username gitadmin --password gitadmin --email gitadmin@local --must-change-password=false 2>$null | Out-Null

Write-Host "==> Creating repository (idempotent)"
$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('gitadmin:gitadmin'))
$headers = @{ Authorization = "Basic $pair"; 'Content-Type' = 'application/json' }
try {
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/api/v1/user/repos' -Headers $headers -Body '{"name":"browser-performance-runner","private":false,"auto_init":false}' | Out-Null
} catch {
  Write-Host "  (repo may already exist)"
}

if (-not (Test-Path '.git')) {
  git init -b main
  git config user.name 'George Kalyaev'
  git config user.email 'george.kalyaev@local'
}

$remotes = git remote 2>$null
if ($remotes -notcontains 'origin') {
  git remote add origin 'http://gitadmin:gitadmin@127.0.0.1:3001/gitadmin/browser-performance-runner.git'
} else {
  git remote set-url origin 'http://gitadmin:gitadmin@127.0.0.1:3001/gitadmin/browser-performance-runner.git'
}

git add -A
$pending = git status --porcelain
if ($pending) {
  git commit -m "chore: browser performance runner with SCM profiles and Grafana dashboard"
}

git push -u origin main

Write-Host ""
Write-Host "Git SCM ready:"
Write-Host "  UI:     http://localhost:3001  (gitadmin / gitadmin)"
Write-Host "  Repo:   http://localhost:3001/gitadmin/browser-performance-runner"
Write-Host "  Clone:  http://127.0.0.1:3001/gitadmin/browser-performance-runner.git"
Write-Host ""
Write-Host "Profiles in Git: src/profiles/*.ts"
Write-Host "Grafana:         http://localhost:3000  (admin / admin)"
Write-Host "Dashboard:       http://localhost:3000/d/browser-performance-lighthouse"
