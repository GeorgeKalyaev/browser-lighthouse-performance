# Free disk space: K8s jobs, Docker orphans, old images/volumes.
# Safe by default — keeps running stack + kind cluster. Use -Full for aggressive cleanup.
param(
  [switch]$Full,
  [switch]$StopKind
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

function Show-Disk {
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  Write-Host ("C: free {0:N1} GB / {1:N1} GB" -f ($disk.FreeSpace / 1GB), ($disk.Size / 1GB))
}

Write-Host '==> Before cleanup'
Show-Disk
docker system df 2>&1

if (Get-Command kubectl -ErrorAction SilentlyContinue) {
  & (Join-Path $root 'scripts/cleanup-after-k8s.ps1') -Quiet
}

if ($Full) {
  Write-Host '==> Remove unused images (not used by running containers)'
  docker image prune -a -f 2>&1 | Select-Object -Last 5
}

# Old demo images often left on dev machines
$staleImages = @(
  'pytest_image:latest',
  'local-demo-webtours:latest',
  'grafana/grafana:9.2.10',
  'hello-world:latest'
)
foreach ($img in $staleImages) {
  if (docker image inspect $img 2>$null) {
    Write-Host "  removing stale image $img"
    docker rmi $img 2>&1 | Write-Host
  }
}

if ($StopKind) {
  Write-Host '==> Delete kind cluster (frees ~5 GB: kindest/node + volume)'
  kind delete cluster --name browser-perf 2>&1 | Write-Host
}

if ($Full -and -not $StopKind) {
  Write-Host 'Tip: kind cluster alone uses ~5 GB. Run with -StopKind to remove it when not testing K8s.'
}

Write-Host ''
Write-Host '==> After cleanup'
Show-Disk
docker system df 2>&1

Write-Host ''
Write-Host 'What uses the most space in this project:'
Write-Host '  browser-performance-runner image  ~3.5 GB  (Playwright + Chromium + Lighthouse)'
Write-Host '  Nexus volume (stores that image)  ~2 GB'
Write-Host '  kind cluster (kindest/node)         ~5 GB   (node image + pulled layers)'
Write-Host '  Jenkins home volume               ~0.5 GB'
Write-Host ''
Write-Host 'When not testing K8s: .\scripts\cleanup-local.ps1 -StopKind'
Write-Host 'Full Docker cleanup:  .\scripts\cleanup-local.ps1 -Full -StopKind'
