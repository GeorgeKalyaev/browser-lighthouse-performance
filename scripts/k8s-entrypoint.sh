#!/usr/bin/env bash
# Runtime entrypoint for Kubernetes Job pods.
# - Pulls URL profiles from Git (Gitea / GitLab) when GIT_SYNC=true
# - Runs compiled JS (dist/) — no npm/tsx download inside pod
set -euo pipefail

APP_DIR="${APP_DIR:-/app}"
RUN_SCRIPT="${RUN_SCRIPT:-dist/src/index.js}"

if [[ "${GIT_SYNC:-false}" == "true" ]]; then
  if [[ -z "${GIT_URL:-}" ]]; then
    echo "GIT_SYNC=true but GIT_URL is empty" >&2
    exit 1
  fi
  clone_url="$GIT_URL"
  if [[ -n "${GIT_USERNAME:-}" && -n "${GIT_PASSWORD:-}" ]]; then
    clone_url="${GIT_URL/http:\/\//http:\/\/${GIT_USERNAME}:${GIT_PASSWORD}@}"
    clone_url="${clone_url/https:\/\//https:\/\/${GIT_USERNAME}:${GIT_PASSWORD}@}"
  fi
  rm -rf /workspace/repo
  echo "==> Cloning profiles from Git: ${GIT_URL}"
  git clone --depth 1 --branch "${GIT_BRANCH:-main}" "$clone_url" /workspace/repo
  echo "==> Sync URL profiles into runner image"
  mkdir -p /app/src/profiles
  cp -a /workspace/repo/src/profiles/. /app/src/profiles/
  # Optional: sync env example only; secrets come from K8s env
fi

cd "$APP_DIR"

if [[ "${CHECK_ONLY:-false}" == "true" ]]; then
  RUN_SCRIPT="dist/src/check.js"
fi

if [[ ! -f "$RUN_SCRIPT" ]]; then
  echo "Missing compiled entrypoint: $APP_DIR/$RUN_SCRIPT (build dist/ into image)" >&2
  exit 1
fi

echo "==> Running browser performance (${RUN_SCRIPT})"
exec node "$RUN_SCRIPT"
