# Browser Performance Runner

Local runner that measures **user-facing page performance** with Lighthouse while Playwright prepares the browser and authentication. Results go to the console, local JSON files, and optionally **InfluxDB 1.8**.

```text
JMeter
    creates load

Browser Performance Runner
    measures user-facing performance
```

This tool is a **measurement probe**, not a load generator. Keep `PACING` high enough so the runner adds minimal extra traffic during a JMeter run.

---

## Architecture

```text
Node.js / TypeScript
        |
        v
     Runner
        |
        +-------------------+
        |                   |
        v                   v
   Playwright           Lighthouse
        |                   |
 browser/auth          performance audit
 preparation                |
        |                   |
        +---------+---------+
                  |
                  v
          MeasurementResult
                  |
       +----------+----------+
       |          |          |
       v          v          v
    Console      JSON     InfluxDB 1.8
```

- **Playwright** — Chromium lifecycle, auth preparation (headers / storage / cookies), cache control for `CACHE_MODE`.
- **Lighthouse** — real navigation performance audit (Speed Index, FCP, LCP, TBT, CLS, TTFB). Playwright does **not** pre-navigate the measured URL on cold runs.

---

## Metrics

| Metric | Lighthouse audit | Units |
|--------|------------------|-------|
| Speed Index | `speed-index` | ms |
| FCP | `first-contentful-paint` | ms |
| LCP | `largest-contentful-paint` | ms |
| TBT | `total-blocking-time` | ms |
| CLS | `cumulative-layout-shift` | unitless |
| TTFB | `server-response-time` (primary) | ms |

### TTFB source (explicit)

**Primary:** Lighthouse audit `server-response-time` → `numericValue` (milliseconds).  
This is Time To First Byte for the main document (request start → first response byte).

**Fallback:** `audits.metrics.details.items[0].timeToFirstByte` if the primary audit is missing.

Missing audits are stored as `null` / unavailable — the runner does not crash and does not substitute another metric for TTFB.

---

## Local demo (WebTours + InfluxDB)

This machine can run a full local loop against the Mercury/HP **WebTours** sample and InfluxDB 1.8.

```powershell
# 1) Start Docker Desktop, then:
cd C:\Users\kalya\browser-performance-runner
.\scripts\start-local.ps1

# 2) Preflight + short run (uses committed .env.example defaults via your local .env)
npm run browser:performance:check
npm run browser:performance
```

What gets started:

| Service | URL |
|---------|-----|
| WebTours | http://127.0.0.1:1080/WebTours/ |
| InfluxDB 1.8 | http://127.0.0.1:8086 (DB `performance`, auth off) |

Profile: `PERFORMANCE_URLS_PROFILE=webtoursUrls` (public pages, token `anonymous`).

JSON results: `results/<RUN_ID>/`.

---

## Local Jenkins

Pipeline job `browser-performance` is provisioned via JCasC + Job DSL and **checks out this repository from Git SCM** (URL profiles live in `src/profiles/*.ts`).

```powershell
cd C:\Users\kalya\browser-performance-runner
npm run local:jenkins
# or: .\scripts\start-jenkins.ps1
```

Then open **http://localhost:8080** → login **admin / admin** → job **browser-performance** → **Build with Parameters**.

| Parameter | Default (local demo) |
|-----------|----------------------|
| `TEST_STAND` | `http://host.docker.internal:1080/` |
| `PERFORMANCE_URLS_PROFILE` | `webtoursUrls` (from Git: `profiles/webtoursUrls.json`) |
| `RUN_TIME` / `PACING` / `PERF_REQUEST_TIMEOUT` | `60` / `5` / `90` |
| `INFLUX_URL` | `http://host.docker.internal:8086` |
| `CHECK_ONLY` | `false` (set `true` for preflight-only) |
| `RUN_ID` | empty → `jenkins-<BUILD_NUMBER>-…` (share with JMeter later) |

### Git SCM (profiles in VCS)

Locally we run **Gitea** as Git hosting (same Jenkins `git clone` flow as GitLab):

| | |
|--|--|
| UI | http://localhost:3001 (`gitadmin` / `gitadmin`) |
| Repo | http://localhost:3001/gitadmin/browser-performance-runner |
| Profiles | `src/profiles/*.ts` in Git |

```powershell
# push latest profiles/code to local SCM
npm run local:git
```

**Company GitLab:** create project, `git remote set-url origin <gitlab-url>`, push, set `GIT_URL` in `docker-compose.yml` (Jenkins) to that clone URL + update `git-scm` credentials. Optional `.gitlab-ci.yml` is included for GitLab CI.

How Jenkins runs: checkout from Git → `docker run` Playwright with `--volumes-from` Jenkins (workspace = checked-out profiles) → InfluxDB.

### Grafana (Lighthouse metrics)

| | |
|--|--|
| UI | http://localhost:3000 (`admin` / `admin`) |
| Dashboard | http://localhost:3000/d/browser-performance-lighthouse |

Panels: Speed Index, FCP, LCP, TTFB, TBT, CLS + averages table. Filters: `run_id`, `page`, `profile`.

---

## Local Nexus (Docker registry)

Nexus **stores** the runner image — it does **not** execute Lighthouse.

```text
Developer / CI
      |
      v
  docker build + push
      |
      v
Nexus (localhost:8081 UI, :8082 Docker)
      |
      stores: browser-performance-runner:1.1.0
              (Node + Playwright + Chromium + Lighthouse + dist/ + profiles/)
      |
      v
Jenkins / Kubernetes  →  docker pull  →  run measurements
```

```powershell
npm run local:nexus
# or: .\scripts\setup-nexus.ps1
```

| | |
|--|--|
| UI | http://localhost:8081 (`admin` / `admin123`) |
| Docker registry | `127.0.0.1:8082` |
| Image | `127.0.0.1:8082/browser-performance-runner:1.1.0` |

If `docker push` fails with HTTPS/HTTP error, add to Docker Desktop → Settings → Docker Engine:

```json
"insecure-registries": ["127.0.0.1:8082"]
```

Then Apply & Restart and re-run `npm run local:nexus`.

---

## Local Kubernetes (kind)

Jenkins job **`browser-performance-k8s`** creates a **one-shot Job** → Pod starts with modest CPU/RAM, runs measurements, exits. Pod is removed after completion (`ttlSecondsAfterFinished`).

```text
Jenkins job trigger
      |
      v
kubectl apply Job  (namespace browser-performance)
      |
      v
Pod: image from Nexus (Playwright + Lighthouse baked in)
      |-- git clone profiles from Gitea/GitLab (src/profiles/*.ts)
      |-- Lighthouse loop
      v
InfluxDB + pod terminates
```

| Source | What |
|--------|------|
| **Nexus** `:8082` | Docker image `browser-performance-runner:1.1.0` (runtime) |
| **Gitea/GitLab** | URL profiles JSON (`profiles/*.json`) + Jenkinsfile (cloned in pod) |
| **host.docker.internal** | WebTours `:1080`, Influx `:8086`, Gitea `:3001` from pod |

### Setup

Prerequisites: Docker Desktop running, `winget install Kubernetes.kind`, stack up (`npm run local:up`, `local:git`, `local:nexus`).

```powershell
npm run local:k8s
# or: .\scripts\setup-k8s.ps1
```

Creates kind cluster `browser-perf`, namespace `browser-performance`, secrets (Git + Nexus pull), exports `jenkins/kubeconfig` for Jenkins container.

Rebuild Jenkins (adds `kubectl`):

```powershell
docker compose build jenkins
docker compose up -d jenkins
```

Jenkins: http://localhost:8080 → job **`browser-performance-k8s`**.

### Manual smoke test

```powershell
$env:RUN_TIME='30'
$env:INFLUX_ENABLED='false'
$env:CHECK_ONLY='true'
.\scripts\run-k8s-job.ps1
```

Pod resources (PoC): requests `500m` CPU / `768Mi` RAM, limits `1500m` / `1536Mi`.

Files: `k8s/job.template.yaml`, `Jenkinsfile.k8s`, `scripts/k8s-entrypoint.sh`.

Company GitLab: change `GIT_URL` in `k8s/configmap.yaml`; image stays in corporate Nexus.

### Disk space (important on Windows)

This stack is heavy. Typical usage:

| What | ~Size |
|------|-------|
| `browser-performance-runner` image (Playwright + Chromium) | 3.5 GB |
| Nexus volume (stores that image) | 2 GB |
| kind cluster (`kindest/node` + volume) | **5 GB** |
| Jenkins / Grafana / Influx / Gitea | ~1.5 GB |
| Build cache (after `docker build`) | 1–3 GB |

Each K8s Job also runs `git clone` + `npm ci` inside the pod (temporary, pod deleted after 5 min).

**Auto-cleanup after every K8s run** (built into `run-k8s-job.ps1` and Jenkins `browser-performance-k8s`):
- deletes Job + Pod immediately (not waiting for TTL)
- removes `k8s/.job*.yaml` temp files
- prunes dangling Docker images/volumes and build cache (>24h)
- prunes unused images inside kind node

**Manual cleanup when not testing K8s:**

```powershell
npm run local:cleanup              # safe: orphan volumes, failed jobs, stale images
.\scripts\cleanup-local.ps1 -StopKind   # also removes kind (~5 GB)
```

Do **not** use `kind load docker-image` on Windows — it duplicates the 3.5 GB image and can crash Docker Desktop.

---

## Install (once)

```bash
cd browser-performance-runner
npm ci
npm run browser:install
```

If `package-lock.json` is not present yet:

```bash
npm install
npm run browser:install
```

Optional: set `CHROME_PATH` to a system Chrome binary. Otherwise Playwright’s Chromium is used. Browsers are **not** downloaded on every measurement — only via `browser:install`.

---

## Configure `.env`

```bash
cp .env.example .env
```

Example:

```env
TEST_STAND=https://test.example.local/
PERFORMANCE_URLS_PROFILE=loadTestUrls

RUN_TIME=60
PACING=5
PERF_REQUEST_TIMEOUT=30
CACHE_MODE=cold

USER_TOKEN=...
ADMIN_TOKEN=...

AUTH_STRATEGY=bearer-header

INFLUX_ENABLED=false
INFLUX_URL=http://localhost:8086
INFLUX_DATABASE=performance
INFLUX_MEASUREMENT=browser_performance
```

For a long soak next to JMeter:

```env
RUN_TIME=1800
PACING=10
```

`.env` is gitignored. Never commit real tokens or Influx passwords.

---

## Environment variables

| Variable | Meaning |
|----------|---------|
| `TEST_STAND` | Absolute base URL of the app (`https://…/`). Domains are **not** stored in URL profiles. |
| `PERFORMANCE_URLS_PROFILE` | Profile name: `loadTestUrls`, `smokeUrls`, `criticalUrls`, `adminUrls` |
| `RUN_TIME` | Total run duration in **seconds** (loop until elapsed) |
| `PACING` | Pause between measurements in **seconds** |
| `PERF_REQUEST_TIMEOUT` | Per-page Lighthouse/navigation timeout in **seconds** |
| `CACHE_MODE` | `cold` (clear HTTP cache before each audit) or `warm` |
| `CHROME_PATH` | Optional path to Chrome/Chromium executable |
| `RUN_ID` | Shared run id (auto: `local-YYYYMMDD-HHMMSS`). Pass the same value from Jenkins for JMeter + browser. |
| `USER_TOKEN` / `ADMIN_TOKEN` | Secrets for logical tokens `userToken` / `adminToken` |
| `AUTH_STRATEGY` | `bearer-header` \| `local-storage` \| `session-storage` \| `cookie` |
| `AUTH_STORAGE_KEY` | Storage key when using `*-storage` (default `accessToken`) |
| `AUTH_COOKIE_NAME` | Cookie name when using `cookie` |
| `INFLUX_ENABLED` | `true` / `false` |
| `INFLUX_URL` | InfluxDB 1.8 base URL |
| `INFLUX_DATABASE` | Database name |
| `INFLUX_USERNAME` / `INFLUX_PASSWORD` | Optional (omit if auth disabled) |
| `INFLUX_MEASUREMENT` | Default `browser_performance` |

---

## URL profiles

Profiles live in `profiles/*.json` (loaded at runtime; K8s can refresh them from Git without rebuilding the image). Example (`profiles/loadTestUrls.json`):

```json
[
  { "name": "Главная", "path": "./dashboard", "token": "userToken" },
  { "name": "Карточка проекта", "path": "./projects/1001", "token": "userToken" },
  { "name": "Админка-пользователи", "path": "./admin/users", "token": "adminToken" }
]
```

- `name` — **unique** page id (Influx tag `page` / Grafana).
- `path` — relative URL; resolved with `new URL(path, TEST_STAND)`.
- `token` — logical name from token mapping (`userToken`, `adminToken`), not the secret itself.

### Why `name` must be unique

Influx/Grafana identify the page by `page=<name>`. Duplicate names collide and break time-series comparison.

Duplicate names fail **before** Chrome/Lighthouse starts (non-zero exit).

### Add a page

1. Edit the chosen profile in `src/profiles/`.
2. Ensure `name` is unique.
3. Set `token` to `userToken` or `adminToken` (or extend `src/config/tokens.ts`).
4. Put the secret in `.env` (`USER_TOKEN` / `ADMIN_TOKEN`).

---

## Auth

Do not assume “Bearer on the first HTML request” is enough.

Configure `AUTH_STRATEGY` to match the real frontend:

| Strategy | Behavior |
|----------|----------|
| `bearer-header` | `Authorization: Bearer <token>` on Lighthouse/preflight requests |
| `local-storage` | Writes token to `localStorage[AUTH_STORAGE_KEY]` on the stand origin before audit |
| `session-storage` | Same for `sessionStorage` |
| `cookie` | Sets `AUTH_COOKIE_NAME` cookie for the stand host |

Only the **logical** auth profile name is logged (`Auth profile: adminToken`). Token values, Bearer strings, cookies, and passwords are never logged or written to JSON.

---

## Commands

```bash
# Preflight only (config, tokens, browser, pages, Influx)
npm run browser:performance:check

# Full RUN_TIME loop
npm run browser:performance

# Unit tests
npm test
```

Stop with `Ctrl+C` (SIGINT/SIGTERM): finish current measurement, flush reporters, close browser.

---

## Preflight order

1. Configuration validation (`TEST_STAND`, numbers, Influx config)
2. URL profile validation (unique names, paths, known tokens)
3. Token env presence
4. Browser launch + version
5. Page availability with auth (401/403/404/5xx/timeout)
6. InfluxDB ping (if enabled)

Fatal before `RUN_TIME`: `CONFIG_ERROR`, `AUTH_ERROR`, `BROWSER_ERROR`, failed page preflight, Influx down when enabled.

After successful preflight, a single URL failure is logged (`LIGHTHOUSE_ERROR` / `PAGE_ERROR` / …) and the loop continues.

---

## InfluxDB 1.8

Aligned with local JMeter tooling (`grafana-dashboards`, `JmeterReport`): HTTP Line Protocol to InfluxDB **1.8**.

When `INFLUX_ENABLED=true`, set URL/database in `.env` (or Jenkins credentials later). Username/password are optional if Influx auth is off.

### Tags

| Tag | Source |
|-----|--------|
| `page` | profile `name` |
| `profile` | `PERFORMANCE_URLS_PROFILE` |
| `stand` | host of `TEST_STAND` |
| `run_id` | `RUN_ID` (snake_case for JMeter `TAG_run_id` compatibility) |
| `cacheMode` | `cold` / `warm` |

Full dynamic URLs are **fields**, not tags (cardinality).

### Fields

`speedIndex`, `fcp`, `lcp`, `ttfb`, `tbt`, `cls` (ms except CLS), plus `durationMs`, `path`, `url`, `authProfile`, version metadata, `status`.

Each point uses the **measurement timestamp** (not one timestamp for the whole run).

If Influx is disabled, Console + JSON still work.

---

## JSON results

```text
results/<RUN_ID>/
  measurements.json
  errors.json
  summary.json
```

No tokens, Authorization headers, cookies, or passwords.

---

## Runtime loop

```text
while elapsed < RUN_TIME:
  next URL in profile (cycle)
  prepare auth
  cold/warm cache handling
  Lighthouse navigation audit
  Console + JSON + Influx
  wait PACING
```

One Lighthouse audit at a time. If `RUN_TIME` ends mid-audit, the current measurement finishes; the next URL is not started.

---

## Error categories

| Category | Typical phase |
|----------|----------------|
| `CONFIG_ERROR` | env / profile / Influx config |
| `AUTH_ERROR` | missing token, 401/403 |
| `BROWSER_ERROR` | Chromium launch |
| `PAGE_ERROR` | 404/5xx/timeout preflight or page |
| `LIGHTHOUSE_ERROR` | audit/timeout during loop |
| `REPORTER_ERROR` | Influx write (retried, limited) |

---

## CI integration notes

Env vars are CI-friendly. Jenkins can inject the same `RUN_ID` into JMeter and this runner, plus credentials for tokens and Influx.

Two Jenkins jobs:

| Job | Mode |
|-----|------|
| `browser-performance` | `docker run` Playwright (legacy local) |
| `browser-performance-k8s` | Kubernetes Job, Nexus image, Git profiles in pod |

Not in this PoC: combined JMeter+browser pipeline, thresholds, mobile emulation, network throttling, parallel Lighthouse.

---

## Project layout

```text
src/
  auth/           tokenResolver, authPreparer
  browser/        playwrightManager
  config/         env loader, browserConfig, tokens
  lighthouse/     lighthouseRunner, metricsExtractor
  logging/        logger (no secrets)
  profiles/       URL profiles
  reporters/      console, json, influx, composite
  runner/         preflight, loop, summary
  validation/     config + profile validation
  bootstrap.ts    shared startup
  index.ts        full run
  check.ts        preflight only
k8s/              kind config, Job template, ConfigMap, RBAC
scripts/          setup-k8s.ps1, run-k8s-job.ps1, k8s-entrypoint.sh
tests/            unit tests (no flaky Lighthouse e2e)
```

---

## Relation to existing local tooling

This workspace previously had **no** TypeScript Browser Performance package. Closest related pieces reused as **conventions** (not copied as a second architecture):

- `grafana-dashboards` — InfluxDB 1.8 + JMeter `run_id` tag
- `JmeterReport` — Line Protocol write style / secrets kept out of VCS

The runner is a standalone npm package under `browser-performance-runner/`.
