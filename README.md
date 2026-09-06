# browser-lighthouse-performance

Замер пользовательской производительности страниц через **Lighthouse**. Браузер и авторизацию готовит **Playwright**. Метрики уходят в консоль, JSON и (по желанию) **InfluxDB 1.8** → Grafana.

Это **probe**, а не нагрузка. Рядом с JMeter держите `PACING` повыше, чтобы лишний трафик от аудитов не портил картину.

```text
JMeter / k6          →  создаёт нагрузку
этот runner          →  меряет, как страница ощущается «в браузере»
```

Репозиторий: [GeorgeKalyaev/browser-lighthouse-performance](https://github.com/GeorgeKalyaev/browser-lighthouse-performance)

---

## Что внутри (стек)

| Слой | Технология | Зачем |
|------|------------|--------|
| Runtime | Node.js ≥ 20, TypeScript | сам runner |
| Браузер | Playwright (Chromium) | сессия, auth, cache cold/warm |
| Метрики | Lighthouse 12 | SI, FCP, LCP, TBT, CLS, TTFB |
| Стенд (демо) | WebTours в `demo/webtours` | локальный target без корпоративного стенда |
| Метрики store | InfluxDB 1.8 | line protocol, как у JMeter-обвязки |
| UI | Grafana | дашборд `browser-performance-lighthouse` |
| Опционально CI | Jenkins + Gitea + Nexus + kind | локальный контур «как в компании» |

Docker-образ раннера в реестре называется `browser-performance-runner` (историческое имя image). npm-пакет в `package.json` — `browser-lighthouse-performance`.

---

## Быстрый старт (после clone)

Нужны: **Docker Desktop**, **Node 20+**, PowerShell (Windows) или bash (Linux/macOS).

### Windows

```powershell
git clone https://github.com/GeorgeKalyaev/browser-lighthouse-performance.git
cd browser-lighthouse-performance
npm run bootstrap
```

`bootstrap` сделает `npm ci`, поставит Chromium, поднимет Influx + Grafana + WebTours, скопирует `.env` из примера и прогонит preflight.

Полный прогон на минуту:

```powershell
npm run browser:performance
```

### Linux / macOS

```bash
git clone https://github.com/GeorgeKalyaev/browser-lighthouse-performance.git
cd browser-lighthouse-performance
chmod +x scripts/*.sh
./scripts/bootstrap.sh
npm run browser:performance
```

### Что должно открыться

| Сервис | URL | Логин |
|--------|-----|--------|
| WebTours | http://127.0.0.1:1080/WebTours/ | — |
| InfluxDB | http://127.0.0.1:8086 | auth выключен, БД `performance` |
| Grafana | http://127.0.0.1:3000 | `admin` / `admin` |
| Дашборд | http://127.0.0.1:3000/d/browser-performance-lighthouse | — |

JSON по прогону: `results/<RUN_ID>/`.

Если Docker ещё не прогрет — первый `bootstrap` может занять несколько минут (сборка WebTours + pull образов).

---

## Где что настраивается

Коротко: **домен стенда и секреты — в env**, **список страниц — в JSON-профилях**, **CI/K8s — в jenkins/ + k8s/**.

### 1. Стенд, время прогона, Influx — `.env`

```bash
cp .env.example .env   # bootstrap делает это сам
```

| Переменная | Что это |
|------------|---------|
| `TEST_STAND` | Базовый URL приложения, **со слэшем в конце**. Домены в профилях не хранятся. |
| `PERFORMANCE_URLS_PROFILE` | Имя профиля = имя файла без `.json` в `profiles/` |
| `RUN_TIME` | Длительность цикла, секунды |
| `PACING` | Пауза между аудитами, секунды |
| `PERF_REQUEST_TIMEOUT` | Таймаут одной страницы, секунды |
| `CACHE_MODE` | `cold` (чистый HTTP-кэш перед аудитом) или `warm` |
| `USER_TOKEN` / `ADMIN_TOKEN` | Секреты под логические токены из профиля |
| `AUTH_STRATEGY` | Как класть токен: `bearer-header`, `local-storage`, `session-storage`, `cookie` |
| `INFLUX_ENABLED` / `INFLUX_URL` / `INFLUX_DATABASE` | Отправка в Influx 1.8 |
| `RUN_ID` | Общий id прогона (удобно делить с JMeter). Пусто → `local-…` |
| `PROFILES_DIR` | Опционально: другой каталог с JSON (в K8s после git-sync) |
| `CHROME_PATH` | Свой Chrome; пусто → Chromium из Playwright |

Демо из коробки:

```env
TEST_STAND=http://127.0.0.1:1080/
PERFORMANCE_URLS_PROFILE=webtoursUrls
```

Свой стенд:

```env
TEST_STAND=https://test.example.local/
PERFORMANCE_URLS_PROFILE=loadTestUrls
USER_TOKEN=...
ADMIN_TOKEN=...
AUTH_STRATEGY=bearer-header
```

`.env` в git не коммитится.

### 2. Список URL для замера — `profiles/*.json`

Файлы лежат в корневом каталоге **`profiles/`** (не в `src/`). Имя файла без расширения = значение `PERFORMANCE_URLS_PROFILE`.

Сейчас в репо:

| Файл | Назначение |
|------|------------|
| `webtoursUrls.json` | демо WebTours (публичные страницы, `anonymous`) |
| `smokeUrls.json` | короткий smoke |
| `loadTestUrls.json` | пример «боевых» путей под нагрузкой |
| `criticalUrls.json` | критический путь |
| `adminUrls.json` | админка |

Формат одной записи:

```json
[
  { "name": "Главная", "path": "./dashboard", "token": "userToken" },
  { "name": "Карточка проекта", "path": "./projects/1001", "token": "userToken" }
]
```

- `name` — уникальный id страницы (тег `page` в Influx / фильтр в Grafana). Дубликаты валят старт до Chrome.
- `path` — относительный путь; собирается как `new URL(path, TEST_STAND)`.
- `token` — логическое имя (`userToken`, `adminToken`, `anonymous`), не сам секрет.

Добавить страницу:

1. Правите нужный `profiles/*.json` (или копируете файл → новый профиль).
2. Кладёте секрет в `.env`.
3. Меняете `PERFORMANCE_URLS_PROFILE`, если взяли новый файл.
4. `npm run browser:performance:check` — убедиться, что preflight зелёный.

В K8s Job те же JSON подтягиваются из Git при старте пода (`PROFILES_DIR`), образ пересобирать не нужно.

### 3. Маппинг токенов — `src/config/tokens.ts`

Логические имена из JSON → переменные окружения. Расширяете здесь, если нужны новые роли.

### 4. Дашборд Grafana — `grafana/`

Provisioning: `grafana/provisioning/`, JSON дашборда: `grafana/dashboards/browser-performance.json`. Поднимается вместе с `docker compose` сервисом `grafana`.

### 5. Jenkins / Git SCM / Nexus / kind

| Путь | Роль |
|------|------|
| `docker-compose.yml` | Influx, Grafana, Gitea, Nexus, Jenkins |
| `jenkins/` | образ Jenkins + JCasC (`casc.yaml`) |
| `Jenkinsfile` / `Jenkinsfile.k8s` | пайплайны |
| `k8s/` | kind config, Job template, ConfigMap, RBAC |
| `scripts/setup-*.ps1` | one-shot подготовка локального контура |
| `Dockerfile` | multi-stage: `tsc` → `node dist/`, Playwright + profiles |

Локальный Git (Gitea) — стенд вместо GitLab: http://localhost:3001 (`gitadmin` / `gitadmin`). Скрипт `npm run local:git` пушит в remote **`gitea`**, remote `origin` (GitHub) не трогает.

---

## Команды runner’а

```bash
npm run browser:performance:check   # только preflight
npm run browser:performance         # цикл RUN_TIME
npm test
npm run typecheck
npm run build                       # dist/ для Docker / prod
```

Остановка: Ctrl+C — дождётся текущего аудита, сбросит reporters, закроет браузер.

Preflight по порядку: конфиг → профиль → токены → браузер → доступность страниц с auth → ping Influx (если включён).

---

## Метрики

| Метрика | Audit Lighthouse | Ед. |
|---------|------------------|-----|
| Speed Index | `speed-index` | ms |
| FCP | `first-contentful-paint` | ms |
| LCP | `largest-contentful-paint` | ms |
| TBT | `total-blocking-time` | ms |
| CLS | `cumulative-layout-shift` | — |
| TTFB | `server-response-time` (fallback: `metrics.timeToFirstByte`) | ms |

Теги Influx: `page`, `profile`, `stand`, `run_id`, `cacheMode`. Полный URL — field, не tag.

---

## Локальный «полный» контур (по желанию)

Демо-замер выше **не требует** Jenkins/Nexus/kind. Они нужны, если хотите повторить CI-пайплайн у себя.

```powershell
npm run local:up        # Influx + Grafana + WebTours
npm run local:git       # Gitea + push профилей
npm run local:jenkins   # Jenkins job browser-performance
npm run local:nexus     # registry + image :1.1.0
npm run local:k8s       # kind + job browser-performance-k8s
```

Полезные URL:

| | |
|--|--|
| Jenkins | http://localhost:8080 (`admin` / `admin`) |
| Gitea | http://localhost:3001 |
| Nexus UI | http://localhost:8081 (`admin` / `admin123`) |
| Docker registry | `127.0.0.1:8082` |

Если `docker push` на `:8082` ругается на HTTPS — в Docker Engine добавьте `"insecure-registries": ["127.0.0.1:8082"]`, Apply & Restart, снова `npm run local:nexus`.

K8s Job тянет image из Nexus, профили — из Gitea, стенд/Influx с пода через `host.docker.internal`. На Windows лучше **не** делать `kind load docker-image` для этого образа — раздувает диск и иногда роняет Docker Desktop.

Уборка:

```powershell
npm run local:cleanup
# или жёстче: .\scripts\cleanup-local.ps1 -StopKind
```

Место на диске: образ с Chromium ~3.5 GB, Nexus volume, kind node — легко +5–10 GB. Имейте в виду перед `local:k8s`.

---

## Архитектура прогона

```text
.env + profiles/*.json
        |
        v
   preflight
        |
        v
  while elapsed < RUN_TIME:
      взять следующую страницу из профиля
      подготовить auth (Playwright)
      cold/warm cache
      Lighthouse navigation audit
      console + results/<RUN_ID>/*.json + Influx
      sleep PACING
```

Один аудит за раз. Auth-значения в логи и JSON не пишутся — только логическое имя профиля (`userToken` и т.п.).

---

## Структура репозитория

```text
profiles/           ← URL для замера (править чаще всего)
demo/webtours/      ← локальный стенд
src/                ← код runner’а
  auth/ browser/ lighthouse/ reporters/ runner/ config/
grafana/            ← datasource + dashboard
jenkins/            ← Dockerfile + casc
k8s/                ← kind + Job
scripts/            ← bootstrap, local stack, cleanup
Dockerfile          ← образ для Nexus / K8s
.env.example        ← шаблон конфига
```

---

## Типичные проблемы

| Симптом | Что проверить |
|---------|----------------|
| Preflight падает на страницах | `TEST_STAND`, пути в JSON, токены, `AUTH_STRATEGY` |
| Influx/Grafana пустые | `INFLUX_ENABLED=true`, БД `performance`, дашборд после хотя бы одного успешного write |
| WebTours 502 / не отвечает | `docker compose -f demo/webtours/docker-compose.yaml ps` и логи; первый build долгий |
| Pod в kind не резолвит стенд | из пода нужен `host.docker.internal`, не `127.0.0.1` |
| `docker push` на Nexus | insecure-registries для `127.0.0.1:8082` |

---

## Чего здесь намеренно нет

Общий Jenkins-пайплайн JMeter+browser с одним `RUN_ID` end-to-end, пороги/гейты по метрикам, mobile/throttling, параллельные Lighthouse — это следующий слой поверх того же probe.

Лицензия кода и демо WebTours: используйте как шаблон у себя; WebTours — классический учебный sample HP/Mercury.
