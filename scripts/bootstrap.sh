#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

echo "==> Node deps"
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi

echo "==> Playwright Chromium"
npm run browser:install

echo "==> Demo stack"
bash "$root/scripts/start-local.sh"

echo "==> Preflight"
npm run browser:performance:check

echo ""
echo "Bootstrap done. Full run:"
echo "  npm run browser:performance"
echo ""
echo "Grafana: http://127.0.0.1:3000/d/browser-performance-lighthouse"
