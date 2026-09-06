#!/usr/bin/env bash
# Bring up Influx + Grafana + WebTours demo.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

echo "==> InfluxDB + Grafana"
docker compose up -d influxdb grafana

echo "==> WebTours (demo target on :1080)"
docker compose -f demo/webtours/docker-compose.yaml up -d --build

echo "==> Waiting for health"
deadline=$((SECONDS + 180))
influx=0
wt=0
while (( SECONDS < deadline )); do
  sleep 2
  if curl -fsS -o /dev/null -w '' http://127.0.0.1:8086/ping 2>/dev/null; then influx=1; fi
  if curl -fsS -o /dev/null -w '' http://127.0.0.1:1080/WebTours/ 2>/dev/null; then wt=1; fi
  if [[ "$influx" -eq 1 && "$wt" -eq 1 ]]; then break; fi
done

if [[ "$influx" -ne 1 || "$wt" -ne 1 ]]; then
  echo "Services not ready (influx=$influx webtours=$wt). Is Docker running?" >&2
  exit 1
fi

curl -fsS -X POST 'http://127.0.0.1:8086/query?q=CREATE%20DATABASE%20performance' >/dev/null 2>&1 || true

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> Created .env from .env.example"
fi

echo ""
echo "Ready."
echo "  WebTours:  http://127.0.0.1:1080/WebTours/"
echo "  InfluxDB:  http://127.0.0.1:8086  (db=performance)"
echo "  Grafana:   http://127.0.0.1:3000  (admin / admin)"
echo ""
echo "First time:"
echo "  npm ci && npm run browser:install"
echo ""
echo "Then:"
echo "  npm run browser:performance:check"
echo "  npm run browser:performance"
