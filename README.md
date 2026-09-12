# browser-lighthouse-performance

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Lighthouse](https://img.shields.io/badge/Lighthouse-12-f04)](https://developer.chrome.com/docs/lighthouse)
[![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33)](https://playwright.dev/)
[![Version](https://img.shields.io/badge/version-1.1.0-informational)](./package.json)

> Browser performance **probe**: Playwright готовит сессию и auth, Lighthouse меряет страницу, метрики уходят в консоль / JSON / **ваш InfluxDB 1.8**. Смотреть можно в **любой Grafana**.

---

## Live Demo

_(не указано)_ — публичного деплоя / GitHub Pages нет.

Локальное демо поднимается одной командой (`npm run bootstrap`) на **HP/Mercury WebTours** + InfluxDB + Grafana. См. [Установка и запуск](#установка-и-запуск).

---

## Краткое описание

**browser-lighthouse-performance** — инструмент для замера **пользовательской** производительности веб-страниц во время (или рядом с) нагрузочным тестированием.

| | |
|--|--|
| **Что делает** | Циклически открывает URL из профиля, гоняет Lighthouse (SI, FCP, LCP, TBT, CLS, TTFB), пишет результат |
| **Для кого** | Performance / QA / DevOps инженеры, которым нужны браузерные метрики рядом с JMeter/k6 |
| **Чем полезен** | Не путается с нагрузкой: это probe, не генератор трафика. Профили в JSON, стенд и Influx — в env, образ — в Nexus, прогон — Kubernetes Job / Jenkins |

Нагрузку (JMeter, k6, …) запускаете **отдельно и параллельно** на том же стенде. Держите `PACING` разумным, чтобы аудиты сами не давили систему.

Проверено: **WebTours** + локальный контур **Jenkins → Nexus → Kubernetes (kind)**.

---

## Оглавление

- [Live Demo](#live-demo)
- [Краткое описание](#краткое-описание)
- [Архитектура](#архитектура)
- [Технологии и стек](#технологии-и-стек)
- [Установка и запуск](#установка-и-запуск)
- [Конфигурация](#конфигурация)
- [Структура проекта](#структура-проекта)
- [Примеры использования](#примеры-использования)
- [CI / DevOps](#ci--devops)
- [Метрики](#метрики)
- [FAQ](#faq)
- [Roadmap / вне скоупа](#roadmap--вне-скоупа)

---

## Архитектура

```text
  profiles/*.json                 .env / параметры Job
  (какие страницы)                (стенд, Influx, auth)
           \                           /
            v                         v
        ┌────────────────────────────────┐
        │  Playwright  →  auth / cache   │
        │  Lighthouse  →  SI, FCP, LCP…  │
        └────────────────┬───────────────┘
                         │
           ┌─────────────┼─────────────┐
           v             v             v
        console    results/<id>/   InfluxDB 1.8
                                   (ваш INFLUX_URL)
                                         │
                                         v
                                      Grafana
                                   (ваша или демо)
```

CI-контур из репозитория:

```text
  Git (profiles + Jenkinsfile)
            │
            v
        Jenkins  ──▶  Kubernetes Job
                          │ pull
                          v
                        Nexus
                   (образ :1.1.0)
                          │
                          v
                     InfluxDB ◀── Grafana
```

| Компонент | Роль |
|-----------|------|
| **Runner** | Замер страниц |
| **Nexus** | Хранит Docker-образ (сам тесты не гоняет) |
| **Kubernetes Job** | One-shot Pod → прогон → выход |
| **Jenkins** | Триггер и параметры |
| **InfluxDB** | Хранилище метрик |
| **Grafana** | Только UI поверх Influx |

---

## Технологии и стек

### Runtime (из `package.json`)

| Пакет | Версия | Назначение |
|-------|--------|------------|
| Node.js | ≥ 20 | runtime |
| TypeScript | ^5.7 | исходники |
| `playwright` | ^1.50 | браузер, auth, cache |
| `lighthouse` | ^12.4 | performance audit |
| `dotenv` | ^16.4 | загрузка `.env` |
| `tsx` | ^4.19 | локальный запуск TS (dev) |

### Docker / инфраструктура (из compose и Dockerfile)

| Компонент | Версия / образ |
|-----------|----------------|
| Base image | `mcr.microsoft.com/playwright:v1.62.1-jammy` |
| Image tag | `browser-performance-runner:1.1.0` |
| InfluxDB | `influxdb:1.8` |
| Grafana | `grafana/grafana:9.5.18` |
| Gitea (локальный SCM) | `gitea/gitea:1.22.3` |
| Nexus | `sonatype/nexus3:3.70.1` |
| Kubernetes (PoC) | kind, cluster `browser-perf` |
| Демо-стенд | HP/Mercury WebTours (`demo/webtours`, порт `1080`) |

### Браузер (код)

Задаётся в `src/config/browserConfig.ts` (не через env):

- headless: `true`
- viewport: `1920×1080`
- deviceScaleFactor: `1`
- стабильные Chromium launch flags

Через env: `CHROME_PATH`, `CACHE_MODE` (`cold` \| `warm`).

---

## Установка и запуск

### Требования

- Node.js **≥ 20**
- Docker Desktop (для демо-стенда / Influx / Grafana / полного CI-контура)
- Windows: PowerShell · Linux/macOS: bash  
- Yarn _(не указано)_ — проект на **npm** (`package-lock.json`)

### Вариант A — быстрый старт (рекомендуется)

```bash
git clone https://github.com/GeorgeKalyaev/browser-lighthouse-performance.git
cd browser-lighthouse-performance
```

**Windows:**

```powershell
npm run bootstrap
npm run browser:performance
```

**Linux / macOS:**

```bash
chmod +x scripts/*.sh
./scripts/bootstrap.sh
npm run browser:performance
```

`bootstrap` сделает: `npm ci` → Chromium → Influx + Grafana + WebTours → `.env` из примера → preflight.

| Сервис | URL |
|--------|-----|
| WebTours | http://127.0.0.1:1080/WebTours/ |
| InfluxDB | http://127.0.0.1:8086 (БД `performance`) |
| Grafana | http://127.0.0.1:3000 (`admin` / `admin`) |
| Дашборд | http://127.0.0.1:3000/d/browser-performance-lighthouse |

### Вариант B — только runner (стенд уже есть)

```bash
npm ci
npm run browser:install
cp .env.example .env
# отредактируйте TEST_STAND, профиль, токены, INFLUX_URL
npm run browser:performance:check
npm run browser:performance
```

### Вариант C — Docker-образ

```bash
docker build -t browser-performance-runner:1.1.0 .
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -e TEST_STAND=http://host.docker.internal:1080/ \
  -e PERFORMANCE_URLS_PROFILE=webtoursUrls \
  -e INFLUX_ENABLED=true \
  -e INFLUX_URL=http://host.docker.internal:8086 \
  -e INFLUX_DATABASE=performance \
  browser-performance-runner:1.1.0
```

Локальный push в Nexus PoC: `npm run local:nexus`.

---

## Конфигурация

### Стенд и раннер — `.env`

Шаблон: [`.env.example`](./.env.example). Файл `.env` в git не коммитится.

| Переменная | Смысл |
|------------|--------|
| `TEST_STAND` | Базовый URL стенда **со `/` в конце** |
| `PERFORMANCE_URLS_PROFILE` | Имя файла в `profiles/` без `.json` |
| `RUN_TIME` | Длительность цикла, сек |
| `PACING` | Пауза между аудитами, сек |
| `PERF_REQUEST_TIMEOUT` | Таймаут страницы, сек |
| `CACHE_MODE` | `cold` \| `warm` |
| `CHROME_PATH` | Свой Chrome; пусто → Playwright Chromium |
| `USER_TOKEN` / `ADMIN_TOKEN` | Секреты под логические токены |
| `AUTH_STRATEGY` | `bearer-header` \| `local-storage` \| `session-storage` \| `cookie` |
| `AUTH_STORAGE_KEY` / `AUTH_COOKIE_NAME` | Ключ storage / имя cookie |
| `INFLUX_ENABLED` | `true` / `false` |
| `INFLUX_URL` | URL **вашего** InfluxDB 1.x |
| `INFLUX_DATABASE` | Имя БД (например `performance`) |
| `INFLUX_MEASUREMENT` | По умолчанию `browser_performance` |
| `RUN_ID` | Метка прогона; пусто → автогенерация |
| `PROFILES_DIR` | Каталог JSON (после git-sync в K8s) |

### Страницы — `profiles/*.json`

```json
[
  { "name": "Главная", "path": "./dashboard", "token": "userToken" },
  { "name": "Карточка", "path": "./projects/1001", "token": "userToken" }
]
```

| Поле | Правило |
|------|---------|
| `name` | Уникальный id → тег `page` в Influx |
| `path` | Относительно `TEST_STAND` |
| `token` | `userToken` / `adminToken` / `anonymous` (не сам секрет) |

Готовые профили: `webtoursUrls`, `smokeUrls`, `loadTestUrls`, `criticalUrls`, `adminUrls`.

### Свой InfluxDB и своя Grafana

1. Укажите `INFLUX_URL` / `INFLUX_DATABASE` в `.env` или параметрах Job.  
2. В **вашей** Grafana: datasource → InfluxDB → тот же URL и БД.  
3. Import: [`grafana/dashboards/browser-performance.json`](./grafana/dashboards/browser-performance.json).  
4. При импорте выберите свой datasource (в демо uid был `bpr-influx`).

Демо-compose Influx/Grafana нужны только для локальной проверки.

### Настройки браузера

| Где | Что |
|-----|-----|
| `.env` | `CHROME_PATH`, `CACHE_MODE`, auth |
| `src/config/browserConfig.ts` | headless, viewport, launch args |
| `src/lighthouse/lighthouseRunner.ts` | viewport аудита, throttling (`provided`) |

---

## Структура проекта

```text
browser-lighthouse-performance/
├── profiles/                 # URL-профили для замера (*.json)
├── demo/webtours/            # демо-стенд HP WebTours
├── src/
│   ├── auth/                 # подготовка токенов / auth
│   ├── browser/              # Playwright lifecycle
│   ├── config/               # env, browserConfig, tokens
│   ├── lighthouse/           # audit + извлечение метрик
│   ├── reporters/            # console, JSON, Influx
│   ├── runner/               # preflight + цикл RUN_TIME
│   ├── profiles/             # загрузчик JSON с диска
│   ├── validation/
│   ├── index.ts              # полный прогон
│   └── check.ts              # только preflight
├── grafana/                  # дашборд + provisioning (демо)
├── jenkins/                  # Dockerfile Jenkins + JCasC
├── k8s/                      # Job template, RBAC, kind, ConfigMap
├── scripts/                  # bootstrap, setup-*, cleanup
├── tests/                    # unit-тесты профилей/валидации
├── Dockerfile                # multi-stage → node dist/
├── docker-compose.yml        # Influx, Grafana, Gitea, Nexus, Jenkins
├── Jenkinsfile               # CI: docker run
├── Jenkinsfile.k8s           # CI: Kubernetes Job
├── .gitlab-ci.yml            # заготовка GitLab CI
├── .env.example
└── package.json
```

---

## Примеры использования

### 1. Preflight без полного цикла

```bash
npm run browser:performance:check
```

Проверяет: конфиг → профиль → токены → браузер → доступность страниц → ping Influx (если включён).

### 2. Короткий прогон на WebTours

```env
TEST_STAND=http://127.0.0.1:1080/
PERFORMANCE_URLS_PROFILE=webtoursUrls
RUN_TIME=60
PACING=5
INFLUX_ENABLED=true
INFLUX_URL=http://127.0.0.1:8086
INFLUX_DATABASE=performance
```

```bash
npm run browser:performance
```

Результат: `results/<RUN_ID>/` + точки в Influx → Grafana.

### 3. Свой стенд + auth

```env
TEST_STAND=https://test.example.local/
PERFORMANCE_URLS_PROFILE=loadTestUrls
USER_TOKEN=eyJ...
ADMIN_TOKEN=eyJ...
AUTH_STRATEGY=bearer-header
INFLUX_ENABLED=true
INFLUX_URL=http://influx.company.local:8086
INFLUX_DATABASE=performance
RUN_TIME=1800
PACING=10
```

### 4. Параллельно с нагрузкой

1. Стартуете JMeter/k6 на стенд.  
2. В том же окне теста — `npm run browser:performance` (или Jenkins/K8s Job).  
3. Смотрите браузерные метрики в Grafana на том же Influx (или отдельном measurement).

Отдельной «склейки» id с нагрузкой не требуется.

### 5. Unit-тесты

```bash
npm test
npm run typecheck
```

---

## CI / DevOps

### Минимально в компании

1. `docker build` из корневого `Dockerfile` → push в ваш Nexus/Harbor.  
2. `profiles/*.json` в Git.  
3. Запуск контейнера / K8s Job с env (`TEST_STAND`, профиль, `INFLUX_URL`, токены).  
4. Grafana компании → datasource на Influx + импорт дашборда.

### Локальный полный контур (PoC)

```powershell
npm run local:up        # Influx + Grafana + WebTours
npm run local:git       # Gitea + push (remote gitea)
npm run local:nexus     # registry :8082 + image 1.1.0
npm run local:jenkins   # http://localhost:8080
npm run local:k8s       # kind + RBAC
# Job: browser-performance-k8s  или  .\scripts\run-k8s-job.ps1
npm run local:cleanup
```

| Файл | Назначение |
|------|------------|
| `Jenkinsfile` | checkout + `docker run` |
| `Jenkinsfile.k8s` | kubectl apply Job |
| `jenkins/casc.yaml` | JCasC |
| `k8s/job.template.yaml` | шаблон Job |
| `k8s/configmap.yaml` | дефолтные env / Git URL |
| `scripts/k8s-entrypoint.sh` | git-sync профилей → `node dist/…` |
| `scripts/setup-nexus.ps1` | Nexus + build/push |
| `scripts/setup-k8s.ps1` | kind + secrets |

Из Pod до стенда/Influx на хосте — `host.docker.internal`, не `127.0.0.1`.  
На Windows не используйте `kind load docker-image` для этого образа.

Диск: образ с Chromium ~3.5 GB + Nexus + kind — закладывайте **8–12 GB**.

---

## Метрики

| Метрика | Lighthouse audit | Ед. |
|---------|------------------|-----|
| Speed Index | `speed-index` | ms |
| FCP | `first-contentful-paint` | ms |
| LCP | `largest-contentful-paint` | ms |
| TBT | `total-blocking-time` | ms |
| CLS | `cumulative-layout-shift` | — |
| TTFB | `server-response-time` | ms |

**Influx tags:** `page`, `profile`, `stand`, `run_id`, `cacheMode`  
**Fields:** `speedIndex`, `fcp`, `lcp`, `ttfb`, `tbt`, `cls`, …  
Полный URL — field, не tag.

---

## FAQ

**Это генератор нагрузки?**  
Нет. Это probe: один Lighthouse-аудит за раз. Нагрузку даёт JMeter/k6/Gatling.

**Обязателен ли Influx из docker-compose?**  
Нет. Укажите свой `INFLUX_URL`. Grafana тоже может быть корпоративной — нужен только datasource на этот Influx.

**Где править список URL?**  
`profiles/*.json`. Имя файла = `PERFORMANCE_URLS_PROFILE`.

**Где настройки браузера (разрешение, headless)?**  
В коде: `src/config/browserConfig.ts`. Через env сейчас: `CHROME_PATH`, `CACHE_MODE`.

**Почему preflight падает с 401/403?**  
Неверный `AUTH_STRATEGY` / токены / `TEST_STAND`. Значения токенов в логи не пишутся — только логическое имя (`userToken`).

**Почему в Grafana пусто?**  
`INFLUX_ENABLED=true`, runner достучался до Influx, datasource в Grafana смотрит на **тот же** URL и БД, после прогона был хотя бы один успешный write.

**Зачем Nexus, если есть Docker Hub?**  
В PoC Nexus имитирует корпоративный registry. В проде — любой ваш registry; поменяйте image pull URL.

**Yarn?**  
_(не указано)_ — используйте `npm ci`.

**Лицензия?**  
_(не указано)_ в репозитории. Демо WebTours — классический учебный sample HP/Mercury.

**Почему на GitHub у папки «updated 2 weeks ago»?**  
Это дата последнего коммита, который трогал путь. Содержимое может быть актуальным (образ `1.1.0`, профили JSON).

---

## Roadmap / вне скоупа

Сейчас **нет** (отдельные задачи поверх probe):

- пороги / quality gates по метрикам  
- mobile emulation / network throttling profiles  
- параллельные Lighthouse в одном процессе  
- общий end-to-end пайплайн «JMeter + browser» с одной кнопкой  

---

## Команды (шпаргалка)

```bash
npm run bootstrap                   # демо с нуля (Windows → scripts/bootstrap.ps1)
npm run browser:performance:check   # preflight
npm run browser:performance         # полный цикл
npm run build                       # dist/ для Docker
npm test
npm run local:up | local:git | local:nexus | local:jenkins | local:k8s
npm run local:cleanup
```

---

<p align="center">
  <sub>Performance probe · Playwright · Lighthouse · InfluxDB 1.8 · optional Jenkins / Nexus / Kubernetes</sub>
</p>
