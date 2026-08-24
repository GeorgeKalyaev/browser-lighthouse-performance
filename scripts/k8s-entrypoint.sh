#!/usr/bin/env bash
# Runtime entrypoint for Kubernetes Job pods.
# - Optionally refreshes URL profiles from Git (JSON under profiles/)
# - Runs compiled JS (node dist/) — no npm/tsx in the pod
set -euo pipefail

APP_DIR="${APP_DIR:-/app}"
PROFILES_DIR="${PROFILES_DIR:-/app/profiles}"
RUN_SCRIPT="${RUN_SCRIPT:-dist/index.js}"

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
  echo "==> Cloning profiles from Git: ${GIT_URL} (branch ${GIT_BRANCH:-main})"
  git clone --depth 1 --branch "${GIT_BRANCH:-main}" "$clone_url" /workspace/repo

  if [[ -d /workspace/repo/profiles ]]; then
    echo "==> Syncing profiles/*.json into ${PROFILES_DIR}"
    mkdir -p "$PROFILES_DIR"
    cp -a /workspace/repo/profiles/. "$PROFILES_DIR/"
  else
    echo "WARN: no profiles/ in repo — using profiles baked into the image" >&2
  fi
fi

cd "$APP_DIR"
export PROFILES_DIR

if [[ "${CHECK_ONLY:-false}" == "true" ]]; then
  RUN_SCRIPT="dist/check.js"
fi

if [[ ! -f "$RUN_SCRIPT" ]]; then
  echo "Missing compiled entrypoint: $APP_DIR/$RUN_SCRIPT" >&2
  exit 1
fi

echo "==> Running browser performance (${RUN_SCRIPT})"
exec node "$RUN_SCRIPT"
