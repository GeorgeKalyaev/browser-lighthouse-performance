# Bootstrap local Kubernetes (kind) for Browser Performance Runner.
# Creates cluster, secrets, exports kubeconfig for Jenkins.
# By default does NOT run `kind load docker-image` — that can crash Docker Desktop on Windows
# (large Playwright image + containerd import). Pods pull from Nexus instead.
param(
  [switch]$SkipImageBuild,
  [switch]$LoadImageIntoKind,
  [switch]$RecreateCluster
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$CLUSTER = 'browser-perf'
$NAMESPACE = 'browser-performance'
$NEXUS_DOCKER = '127.0.0.1:8082'
$NEXUS_USER = 'admin'
$NEXUS_PASS = 'admin123'
$IMAGE = "${NEXUS_DOCKER}/browser-performance-runner:1.0.0"
$GIT_USER = 'gitadmin'
$GIT_PASS = 'gitadmin'

$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

function Ensure-Kind {
  if (-not (Get-Command kind -ErrorAction SilentlyContinue)) {
    throw 'kind is not installed. Run: winget install Kubernetes.kind'
  }
}

function Get-KindClusterNames {
  $lines = @()
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $lines = @(kind get clusters 2>&1)
  } finally {
    $ErrorActionPreference = $prev
  }
  foreach ($line in $lines) {
    if ($line -is [System.Management.Automation.ErrorRecord]) {
      if ($line.ToString() -match 'No kind clusters') { continue }
      throw $line
    }
    $text = "$line".Trim()
    if ($text) { $text }
  }
}

function Ensure-Cluster {
  $exists = @(Get-KindClusterNames) | Where-Object { $_ -eq $CLUSTER }
  if ($exists -and $RecreateCluster) {
    Write-Host "==> Deleting kind cluster '$CLUSTER' (-RecreateCluster)"
    kind delete cluster --name $CLUSTER
    $exists = $false
  }
  if (-not $exists) {
    Write-Host "==> Creating kind cluster '$CLUSTER'"
    kind create cluster --name $CLUSTER --config (Join-Path $root 'k8s/kind-config.yaml')
  } else {
    Write-Host "==> kind cluster '$CLUSTER' already exists"
  }
  kubectl config use-context "kind-$CLUSTER" | Out-Null
}

function Load-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return @{} }
  $map = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { return }
    if ($line -match '^([^=]+)=(.*)$') {
      $map[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $map
}

Write-Host '==> Ensuring Nexus image exists locally'
if (-not (docker image inspect $IMAGE 2>$null)) {
  Write-Host '  image missing — running setup-nexus.ps1'
  & (Join-Path $root 'scripts/setup-nexus.ps1')
} else {
  Write-Host "  found $IMAGE"
}

Write-Host '==> Rebuilding runner image (git + k8s entrypoint)'
if (-not $SkipImageBuild) {
  docker build -t "browser-performance-runner:1.0.0" -t $IMAGE .
  $NEXUS_PASS | docker login $NEXUS_DOCKER -u $NEXUS_USER --password-stdin
  docker push $IMAGE
} else {
  Write-Host '  -SkipImageBuild: using existing image in Nexus'
}

Ensure-Kind
Ensure-Cluster

Write-Host '==> Applying Kubernetes manifests'
kubectl apply -f (Join-Path $root 'k8s/namespace.yaml')
kubectl apply -f (Join-Path $root 'k8s/configmap.yaml')
kubectl apply -f (Join-Path $root 'k8s/rbac.yaml')

$dotenv = Load-DotEnv (Join-Path $root '.env')
$userToken = if ($dotenv.USER_TOKEN) { $dotenv.USER_TOKEN } else { $env:USER_TOKEN }
$adminToken = if ($dotenv.ADMIN_TOKEN) { $dotenv.ADMIN_TOKEN } else { $env:ADMIN_TOKEN }
$influxUser = if ($dotenv.INFLUX_USERNAME) { $dotenv.INFLUX_USERNAME } else { $env:INFLUX_USERNAME }
$influxPass = if ($dotenv.INFLUX_PASSWORD) { $dotenv.INFLUX_PASSWORD } else { $env:INFLUX_PASSWORD }

Write-Host '==> Creating/updating secrets'
kubectl create secret generic browser-performance-secrets `
  --namespace $NAMESPACE `
  --from-literal=GIT_USERNAME=$GIT_USER `
  --from-literal=GIT_PASSWORD=$GIT_PASS `
  --from-literal=USER_TOKEN=$userToken `
  --from-literal=ADMIN_TOKEN=$adminToken `
  --from-literal=INFLUX_USERNAME=$influxUser `
  --from-literal=INFLUX_PASSWORD=$influxPass `
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret docker-registry nexus-docker `
  --namespace $NAMESPACE `
  --docker-server=host.docker.internal:8082 `
  --docker-username=$NEXUS_USER `
  --docker-password=$NEXUS_PASS `
  --dry-run=client -o yaml | kubectl apply -f -

if ($LoadImageIntoKind) {
  Write-Host '==> Loading image into kind (optional; may stress Docker Desktop on Windows)'
  $loadOk = $false
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    kind load docker-image "browser-performance-runner:1.0.0" --name $CLUSTER 2>&1 | Write-Host
    if ($LASTEXITCODE -eq 0) { $loadOk = $true }
  } catch {
    Write-Warning "kind load failed: $_"
  }
  $ErrorActionPreference = $prev
  if (-not $loadOk) {
    Write-Warning 'kind load failed. Pod will pull from host.docker.internal:8082 instead.'
  }
} else {
  Write-Host '==> Skipping kind load (default). Pod will pull image from Nexus at runtime.'
  Write-Host '    To pre-load: .\\scripts\\setup-k8s.ps1 -LoadImageIntoKind  (may crash Docker on low RAM)'
}

Write-Host '==> Exporting kubeconfig for Jenkins container'
$kubeDir = Join-Path $root 'jenkins'
New-Item -ItemType Directory -Force -Path $kubeDir | Out-Null
$srcKube = Join-Path $env:USERPROFILE '.kube/config'
if (-not (Test-Path $srcKube)) {
  throw "kubeconfig not found at $srcKube"
}
# Jenkins reaches kind API via host.docker.internal; kind cert has no SAN for that name,
# so skip TLS verify for the exported copy only (local PoC).
$server = kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'
$port = ([uri]$server).Port
$jenkinsKube = @"
apiVersion: v1
kind: Config
clusters:
- cluster:
    insecure-skip-tls-verify: true
    server: https://host.docker.internal:$port
  name: kind-$CLUSTER
contexts:
- context:
    cluster: kind-$CLUSTER
    user: kind-$CLUSTER
  name: kind-$CLUSTER
current-context: kind-$CLUSTER
users:
- name: kind-$CLUSTER
  user:
    client-certificate-data: $(kubectl config view --raw --minify -o jsonpath='{.users[0].user.client-certificate-data}')
    client-key-data: $(kubectl config view --raw --minify -o jsonpath='{.users[0].user.client-key-data}')
"@
Set-Content -Path (Join-Path $kubeDir 'kubeconfig') -Value $jenkinsKube -NoNewline

Write-Host ''
Write-Host 'Kubernetes ready:'
Write-Host "  Context:   kind-$CLUSTER"
Write-Host "  Namespace: $NAMESPACE"
Write-Host "  Image:     host.docker.internal:8082/browser-performance-runner:1.0.2"
Write-Host "  Git:       http://host.docker.internal:3001/... (profiles cloned in pod)"
Write-Host ''
Write-Host 'Smoke test (30s, no Influx):'
Write-Host '  $env:RUN_TIME=30; $env:INFLUX_ENABLED=false; powershell -File scripts/run-k8s-job.ps1'
Write-Host ''
Write-Host 'Jenkins K8s job: rebuild Jenkins image, restart stack, run job browser-performance-k8s'
Write-Host '  docker compose build jenkins && docker compose up -d jenkins'

Write-Host ''
Write-Host '==> Post-setup cleanup (remove stale jobs/volumes)'
& (Join-Path $root 'scripts/cleanup-after-k8s.ps1') -Quiet
