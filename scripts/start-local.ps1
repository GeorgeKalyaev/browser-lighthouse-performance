# Bring up Influx + Grafana + WebTours demo, then print what to run next.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> InfluxDB + Grafana"
docker compose up -d influxdb grafana

Write-Host "==> WebTours (demo target on :1080)"
docker compose -f demo/webtours/docker-compose.yaml up -d --build

Write-Host "==> Waiting for health"
$deadline = (Get-Date).AddMinutes(3)
do {
  Start-Sleep -Seconds 2
  $influx = $false
  $wt = $false
  try {
    $r = Invoke-WebRequest 'http://127.0.0.1:8086/ping' -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -in 200, 204) { $influx = $true }
  } catch {}
  try {
    $r = Invoke-WebRequest 'http://127.0.0.1:1080/WebTours/' -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $wt = $true }
  } catch {}
  if ($influx -and $wt) { break }
} while ((Get-Date) -lt $deadline)

if (-not ($influx -and $wt)) {
  Write-Error "Services not ready (influx=$influx webtours=$wt). Is Docker Desktop running?"
}

try {
  Invoke-WebRequest 'http://127.0.0.1:8086/query?q=CREATE%20DATABASE%20performance' -Method POST -UseBasicParsing | Out-Null
} catch {}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host "==> Created .env from .env.example"
}

Write-Host ""
Write-Host "Ready."
Write-Host "  WebTours:  http://127.0.0.1:1080/WebTours/"
Write-Host "  InfluxDB:  http://127.0.0.1:8086  (db=performance)"
Write-Host "  Grafana:   http://127.0.0.1:3000  (admin / admin)"
Write-Host ""
Write-Host "First time on this machine:"
Write-Host "  npm ci"
Write-Host "  npm run browser:install"
Write-Host ""
Write-Host "Then:"
Write-Host "  npm run browser:performance:check"
Write-Host "  npm run browser:performance"
