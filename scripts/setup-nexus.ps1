# Bootstrap local Nexus OSS: Docker hosted repo + push browser-performance-runner image.
# Nexus stores the runner IMAGE - it does not run Lighthouse itself.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$NEXUS_UI = 'http://127.0.0.1:8081'
$NEXUS_DOCKER = '127.0.0.1:8082'
$NEXUS_USER = 'admin'
$NEXUS_PASS = 'admin123'
$IMAGE_NAME = 'browser-performance-runner'
$IMAGE_TAG = '1.1.0'

Write-Host '==> Starting Nexus'
docker compose up -d nexus

Write-Host "==> Waiting for Nexus UI ($NEXUS_UI) ..."
$deadline = (Get-Date).AddMinutes(5)
$ready = $false
do {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-WebRequest "$NEXUS_UI/service/rest/v1/status" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Write-Host '  still starting...'
} while ((Get-Date) -lt $deadline)

if (-not $ready) {
  throw 'Nexus did not become ready in time'
}

Write-Host '==> Reading initial admin password'
$initialPass = ''
try {
  $initialPass = (docker compose exec -T nexus cat /nexus-data/admin.password 2>$null | Out-String).Trim()
} catch {}

if ([string]::IsNullOrWhiteSpace($initialPass)) {
  $initialPass = $NEXUS_PASS
  Write-Host "  (no admin.password file - using $NEXUS_PASS)"
} else {
  Write-Host '  got initial password from container'
  Write-Host "==> Changing admin password to $NEXUS_PASS"
  $pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${NEXUS_USER}:${initialPass}"))
  try {
    Invoke-RestMethod -Method Put -Uri "$NEXUS_UI/service/rest/v1/security/users/admin/change-password" `
      -Headers @{ Authorization = "Basic $pair"; 'Content-Type' = 'text/plain' } `
      -Body $NEXUS_PASS | Out-Null
  } catch {
    Write-Host "  password change skipped/failed: $($_.Exception.Message)"
  }
}

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${NEXUS_USER}:${NEXUS_PASS}"))
$headers = @{ Authorization = "Basic $auth"; 'Content-Type' = 'application/json' }

Write-Host "==> Ensuring Docker hosted repository 'docker-hosted'"
$repos = Invoke-RestMethod -Uri "$NEXUS_UI/service/rest/v1/repositories" -Headers @{ Authorization = "Basic $auth" }
$exists = $repos | Where-Object { $_.name -eq 'docker-hosted' }
if (-not $exists) {
  $body = @{
    name = 'docker-hosted'
    online = $true
    storage = @{
      blobStoreName = 'default'
      strictContentTypeValidation = $true
      writePolicy = 'ALLOW'
    }
    docker = @{
      v1Enabled = $false
      forceBasicAuth = $true
      httpPort = 8082
    }
  } | ConvertTo-Json -Depth 5

  Invoke-RestMethod -Method Post -Uri "$NEXUS_UI/service/rest/v1/repositories/docker/hosted" `
    -Headers $headers -Body $body | Out-Null
  Write-Host '  created docker-hosted (HTTP :8082)'
} else {
  Write-Host '  docker-hosted already exists'
}

Write-Host '==> Enabling anonymous access (optional pull)'
try {
  Invoke-RestMethod -Method Put -Uri "$NEXUS_UI/service/rest/v1/security/anonymous" `
    -Headers $headers -Body '{"enabled":true,"userId":"anonymous","realmName":"NexusAuthorizingRealm"}' | Out-Null
} catch {
  Write-Host '  anonymous toggle skipped'
}

Write-Host '==> Building runner image'
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" -t "${NEXUS_DOCKER}/${IMAGE_NAME}:${IMAGE_TAG}" .

Write-Host '==> Login + push to Nexus Docker registry'
$NEXUS_PASS | docker login $NEXUS_DOCKER -u $NEXUS_USER --password-stdin
docker push "${NEXUS_DOCKER}/${IMAGE_NAME}:${IMAGE_TAG}"

Write-Host ''
Write-Host 'Nexus ready:'
Write-Host "  UI:       $NEXUS_UI  ($NEXUS_USER / $NEXUS_PASS)"
Write-Host "  Docker:   $NEXUS_DOCKER  (hosted repo: docker-hosted)"
Write-Host "  Image:    ${NEXUS_DOCKER}/${IMAGE_NAME}:${IMAGE_TAG}"
Write-Host ''
Write-Host 'What lives in Nexus:'
Write-Host '  Docker image browser-performance-runner'
Write-Host '    = Node + Playwright + Chromium + Lighthouse + profiles/*.json'
Write-Host '  Nexus does NOT run measurements - Jenkins/K8s pull the image and run it.'
Write-Host ''
Write-Host 'Smoke run from Nexus image:'
Write-Host "  docker run --rm --add-host=host.docker.internal:host-gateway -e TEST_STAND=http://host.docker.internal:1080/ -e PERFORMANCE_URLS_PROFILE=webtoursUrls -e RUN_TIME=30 -e INFLUX_ENABLED=false -e CHECK_ONLY=true ${NEXUS_DOCKER}/${IMAGE_NAME}:${IMAGE_TAG} /bin/bash /app/scripts/k8s-entrypoint.sh"
