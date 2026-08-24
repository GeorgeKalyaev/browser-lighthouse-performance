# Auto-cleanup after a K8s measurement run — called from run-k8s-job.ps1 and Jenkinsfile.k8s.
param(
  [string]$JobName,
  [switch]$Quiet
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

function Log([string]$Msg) {
  if (-not $Quiet) { Write-Host $Msg }
}

function Invoke-Kubectl([string[]]$Args) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & kubectl @Args 2>&1 | Out-Null
  $ErrorActionPreference = $prev
}

Log '==> K8s post-run cleanup'

if (Get-Command kubectl -ErrorAction SilentlyContinue) {
  $ctx = kubectl config current-context 2>$null
  if ($ctx -match 'kind-browser-perf') {
    if ($JobName) {
      Log "  delete job $JobName"
      Invoke-Kubectl @('delete', 'job', $JobName, '-n', 'browser-performance', '--ignore-not-found')
    }
    Log '  delete all jobs in browser-performance (pods go with them)'
    Invoke-Kubectl @('delete', 'jobs', '--all', '-n', 'browser-performance', '--ignore-not-found')
  }
}

Get-ChildItem (Join-Path $root 'k8s') -Filter '.job*.yaml' -ErrorAction SilentlyContinue |
  ForEach-Object {
    Log "  remove $($_.Name)"
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
  }

if (Get-Command docker -ErrorAction SilentlyContinue) {
  Log '  docker: prune dangling images + unused build cache (>24h)'
  docker image prune -f 2>$null | Out-Null
  docker builder prune -f --filter 'until=24h' 2>$null | Out-Null
  docker volume ls -q -f dangling=true | ForEach-Object {
    Log "  docker: remove dangling volume $_"
    docker volume rm $_ 2>$null | Out-Null
  }

  $kindNode = docker ps -q -f 'name=browser-perf-control-plane' 2>$null
  if ($kindNode) {
    Log '  kind node: prune unused container images'
    docker exec $kindNode bash -lc '
      if command -v crictl >/dev/null 2>&1; then crictl rmi --prune 2>/dev/null; fi
      if command -v ctr >/dev/null 2>&1; then ctr -n k8s.io images ls -q 2>/dev/null | head -1 >/dev/null; fi
    ' 2>$null | Out-Null
  }
}

if (-not $Quiet) {
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  Log ("  C: free {0:N1} GB" -f ($disk.FreeSpace / 1GB))
}
