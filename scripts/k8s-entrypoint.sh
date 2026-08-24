#!/usr/bin/env bash
# Runtime entrypoint for Kubernetes Job pods.
# - Pulls URL profiles + code from Git (Gitea / GitLab) when GIT_SYNC=true
# - Runs Lighthouse measurements via tsx
set -euo pipefail

APP_DIR="${APP_DIR:-/app}"
RUN_SCRIPT="${RUN_SCRIPT:-src/index.ts}"

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
  cd /workspace/repo
  npm ci --omit=dev
  # tsx is devDependency — copy from baked image instead of npm registry in pod
  if [[ ! -x ./node_modules/.bin/tsx ]]; then
    mkdir -p ./node_modules/.bin
    cp -a /app/node_modules/tsx ./node_modules/tsx 2>/dev/null || npm install --no-save tsx@4.19.2
    ln -sf ../tsx/dist/cli.mjs ./node_modules/.bin/tsx 2>/dev/null || true
  fi
  APP_DIR=/workspace/repo
fi

cd "$APP_DIR"

if [[ "${CHECK_ONLY:-false}" == "true" ]]; then
  RUN_SCRIPT="src/check.ts"
fi

run_tsx() {
  if [[ -x ./node_modules/.bin/tsx ]]; then
    exec ./node_modules/.bin/tsx "$@"
  elif [[ -x /app/node_modules/.bin/tsx ]]; then
    exec /app/node_modules/.bin/tsx "$@"
  else
    exec npx --yes tsx@4.19.2 "$@"
  fi
}

echo "==> Running browser performance (${RUN_SCRIPT})"
run_tsx "$RUN_SCRIPT"
