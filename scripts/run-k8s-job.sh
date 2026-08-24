#!/usr/bin/env bash
# Render k8s/job.template.yaml, apply Job, auto-cleanup after run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="${ROOT}/k8s/job.template.yaml"
OUT="${ROOT}/k8s/.job.generated.yaml"
CLEANUP="${ROOT}/scripts/cleanup-after-k8s.sh"

JOB_NAME="${JOB_NAME:-browser-perf-$(date +%Y%m%d-%H%M%S)}"
RUN_ID="${RUN_ID:-local-${JOB_NAME}}"
RUNNER_IMAGE="${RUNNER_IMAGE:-host.docker.internal:8082/browser-performance-runner:1.1.0}"

TEST_STAND="${TEST_STAND:-http://host.docker.internal:1080/}"
PERFORMANCE_URLS_PROFILE="${PERFORMANCE_URLS_PROFILE:-webtoursUrls}"
RUN_TIME="${RUN_TIME:-60}"
PACING="${PACING:-5}"
PERF_REQUEST_TIMEOUT="${PERF_REQUEST_TIMEOUT:-90}"
CACHE_MODE="${CACHE_MODE:-cold}"
INFLUX_ENABLED="${INFLUX_ENABLED:-true}"
INFLUX_URL="${INFLUX_URL:-http://host.docker.internal:8086}"
INFLUX_DATABASE="${INFLUX_DATABASE:-performance}"
INFLUX_MEASUREMENT="${INFLUX_MEASUREMENT:-browser_performance}"
CHECK_ONLY="${CHECK_ONLY:-false}"
GIT_URL="${GIT_URL:-http://host.docker.internal:3001/gitadmin/browser-performance-runner.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

cleanup() {
  bash "$CLEANUP" "$JOB_NAME" || true
}
trap cleanup EXIT

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Missing template: $TEMPLATE" >&2
  exit 1
fi

echo "==> Pre-run cleanup"
bash "$CLEANUP" || true

sed \
  -e "s|__JOB_NAME__|${JOB_NAME}|g" \
  -e "s|__RUN_ID__|${RUN_ID}|g" \
  -e "s|__RUNNER_IMAGE__|${RUNNER_IMAGE}|g" \
  -e "s|__TEST_STAND__|${TEST_STAND}|g" \
  -e "s|__PERFORMANCE_URLS_PROFILE__|${PERFORMANCE_URLS_PROFILE}|g" \
  -e "s|__RUN_TIME__|${RUN_TIME}|g" \
  -e "s|__PACING__|${PACING}|g" \
  -e "s|__PERF_REQUEST_TIMEOUT__|${PERF_REQUEST_TIMEOUT}|g" \
  -e "s|__CACHE_MODE__|${CACHE_MODE}|g" \
  -e "s|__INFLUX_ENABLED__|${INFLUX_ENABLED}|g" \
  -e "s|__INFLUX_URL__|${INFLUX_URL}|g" \
  -e "s|__INFLUX_DATABASE__|${INFLUX_DATABASE}|g" \
  -e "s|__INFLUX_MEASUREMENT__|${INFLUX_MEASUREMENT}|g" \
  -e "s|__CHECK_ONLY__|${CHECK_ONLY}|g" \
  -e "s|__GIT_URL__|${GIT_URL}|g" \
  -e "s|__GIT_BRANCH__|${GIT_BRANCH}|g" \
  "$TEMPLATE" > "$OUT"

echo "==> Applying Job ${JOB_NAME}"
kubectl apply -f "$OUT"

echo "==> Waiting for Job completion (timeout 1h)"
set +e
kubectl wait --for=condition=complete "job/${JOB_NAME}" -n browser-performance --timeout=3600s
wait_rc=$?
set -e

echo "==> Pod logs"
kubectl logs -n browser-performance "job/${JOB_NAME}" --tail=200 || true

exit "$wait_rc"
