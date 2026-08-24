# Start local demo stack: InfluxDB 1.8 + WebTours, then print next steps.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  $root = $PSScriptRoot
}

Write-Host "==> Starting InfluxDB (browser-performance-runner)"
Push-Location $root
docker compose up -d
Pop-Location

Write-Host "==> Starting WebTours"
Push-Location 'C:\Users\kalya\k6Test\webtours-docker'
docker compose up -d
Pop-Location

Write-Host "==> Waiting for health"
$deadline = (Get-Date).AddMinutes(2)
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
  Write-Error "Services not ready (influx=$influx webtours=$wt)"
}

try {
  Invoke-WebRequest 'http://127.0.0.1:8086/query?q=CREATE%20DATABASE%20performance' -Method POST -UseBasicParsing | Out-Null
} catch {}

Write-Host ""
Write-Host "Ready."
Write-Host "  WebTours:  http://127.0.0.1:1080/WebTours/"
Write-Host "  InfluxDB:  http://127.0.0.1:8086"
Write-Host ""
Write-Host "Next:"
Write-Host "  cd $root"
Write-Host "  npm run browser:performance:check"
Write-Host "  npm run browser:performance"
