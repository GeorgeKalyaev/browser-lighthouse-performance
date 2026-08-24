# Run a one-shot Browser Performance Job in local Kubernetes (Windows wrapper).
# Auto-cleans K8s jobs, generated yaml, and Docker orphans after each run.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

$kubeconfig = Join-Path $env:USERPROFILE '.kube/config'
if (-not (Test-Path $kubeconfig)) {
  throw 'No kubeconfig. Run scripts/setup-k8s.ps1 first.'
}
$env:KUBECONFIG = $kubeconfig
kubectl config use-context kind-browser-perf | Out-Null

$template = Join-Path $root 'k8s/job.template.yaml'
$jobName = if ($env:JOB_NAME) { $env:JOB_NAME } else { "browser-perf-$(Get-Date -Format 'yyyyMMdd-HHmmss')" }
$out = Join-Path $root "k8s/.job.$jobName.yaml"
$cleanupScript = Join-Path $root 'scripts/cleanup-after-k8s.ps1'
$exitCode = 0

function Replace-Token {
  param([string]$Text, [string]$Token, [string]$Value)
  return $Text.Replace("__${Token}__", $Value)
}

# Remove leftover jobs from previous runs before starting a new one
Write-Host '==> Pre-run cleanup (old K8s jobs + temp files)'
& $cleanupScript -Quiet

$yaml = Get-Content $template -Raw
$replacements = @{
  JOB_NAME = $jobName
  RUN_ID = if ($env:RUN_ID) { $env:RUN_ID } else { "local-$jobName" }
  RUNNER_IMAGE = if ($env:RUNNER_IMAGE) { $env:RUNNER_IMAGE } else { 'host.docker.internal:8082/browser-performance-runner:1.1.0' }
  TEST_STAND = if ($env:TEST_STAND) { $env:TEST_STAND } else { 'http://host.docker.internal:1080/' }
  PERFORMANCE_URLS_PROFILE = if ($env:PERFORMANCE_URLS_PROFILE) { $env:PERFORMANCE_URLS_PROFILE } else { 'webtoursUrls' }
  RUN_TIME = if ($env:RUN_TIME) { $env:RUN_TIME } else { '60' }
  PACING = if ($env:PACING) { $env:PACING } else { '5' }
  PERF_REQUEST_TIMEOUT = if ($env:PERF_REQUEST_TIMEOUT) { $env:PERF_REQUEST_TIMEOUT } else { '90' }
  CACHE_MODE = if ($env:CACHE_MODE) { $env:CACHE_MODE } else { 'cold' }
  INFLUX_ENABLED = if ($env:INFLUX_ENABLED) { $env:INFLUX_ENABLED } else { 'true' }
  INFLUX_URL = if ($env:INFLUX_URL) { $env:INFLUX_URL } else { 'http://host.docker.internal:8086' }
  INFLUX_DATABASE = if ($env:INFLUX_DATABASE) { $env:INFLUX_DATABASE } else { 'performance' }
  INFLUX_MEASUREMENT = if ($env:INFLUX_MEASUREMENT) { $env:INFLUX_MEASUREMENT } else { 'browser_performance' }
  CHECK_ONLY = if ($env:CHECK_ONLY) { $env:CHECK_ONLY } else { 'false' }
  GIT_URL = if ($env:GIT_URL) { $env:GIT_URL } else { 'http://host.docker.internal:3001/gitadmin/browser-performance-runner.git' }
  GIT_BRANCH = if ($env:GIT_BRANCH) { $env:GIT_BRANCH } else { 'main' }
}

foreach ($key in $replacements.Keys) {
  $yaml = Replace-Token -Text $yaml -Token $key -Value $replacements[$key]
}

try {
  Set-Content -Path $out -Value $yaml -NoNewline
  Write-Host "==> Applying Job $jobName"
  kubectl apply -f $out
  Write-Host '==> Waiting for completion (up to 1h)'
  kubectl wait --for=condition=complete "job/$jobName" -n browser-performance --timeout=3600s
  if ($LASTEXITCODE -ne 0) { $exitCode = 1 }
  Write-Host '==> Logs'
  kubectl logs -n browser-performance "job/$jobName" --tail=200
} catch {
  $exitCode = 1
  Write-Host "==> Job failed: $_"
  kubectl logs -n browser-performance "job/$jobName" --tail=200 2>$null
} finally {
  Write-Host ''
  & $cleanupScript -JobName $jobName
}

exit $exitCode
