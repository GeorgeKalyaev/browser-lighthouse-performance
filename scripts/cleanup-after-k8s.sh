#!/usr/bin/env bash
# Auto-cleanup after a K8s measurement run (bash variant for Jenkins on Linux agents).
set +e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JOB_NAME="${1:-}"

echo "==> K8s post-run cleanup"

if command -v kubectl >/dev/null 2>&1; then
  ctx="$(kubectl config current-context 2>/dev/null || true)"
  if [[ "$ctx" == *kind-browser-perf* ]]; then
    if [[ -n "$JOB_NAME" ]]; then
      kubectl delete job "$JOB_NAME" -n browser-performance --ignore-not-found
    fi
    kubectl delete jobs --all -n browser-performance --ignore-not-found
  fi
fi

rm -f "${ROOT}"/k8s/.job*.yaml

if command -v docker >/dev/null 2>&1; then
  docker image prune -f >/dev/null 2>&1
  docker builder prune -f --filter 'until=24h' >/dev/null 2>&1
  docker volume ls -q -f dangling=true | xargs -r docker volume rm >/dev/null 2>&1
  kind_node="$(docker ps -q -f name=browser-perf-control-plane 2>/dev/null || true)"
  if [[ -n "$kind_node" ]]; then
    docker exec "$kind_node" bash -lc 'command -v crictl >/dev/null && crictl rmi --prune 2>/dev/null || true' >/dev/null 2>&1
  fi
fi

echo "==> cleanup done"
