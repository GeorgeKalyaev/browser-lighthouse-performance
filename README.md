# browser-lighthouse-performance

Замер производительности страниц в браузере: **Playwright** (сессия / auth) + **Lighthouse** (SI, FCP, LCP, TBT, CLS, TTFB).

Результат:
- консоль
- файлы `results/<id>/`
- **InfluxDB 1.8** (любой ваш, URL задаёте сами)

Смотреть графики — в **любой Grafana**: создаёте datasource на этот Influx и импортируете дашборд из репо.

Это **не** нагрузка. JMeter / k6 гоняете отдельно; runner можно запускать **одновременно** на том же стенде. `PACING` не ставьте слишком маленьким, чтобы аудиты сами не давили стенд.

Проверено на **HP/Mercury WebTours** и на контуре **Jenkins → Nexus → Kubernetes (kind Job)**.

---

## Оглавление

1. [Что это и как устроено](#1-что-это-и-как-устроено)
2. [Шаг за шагом: поднять демо у себя](#2-шаг-за-шагом-поднять-демо-у-себя)
3. [Шаг за шагом: свой стенд и свои страницы](#3-шаг-за-шагом-свой-стенд-и-свои-страницы)
4. [Шаг за шагом: свой InfluxDB и своя Grafana](#4-шаг-за-шагом-свой-influxdb-и-своя-grafana)
5. [Шаг за шагом: выкат для DevOps (Nexus / K8s / Jenkins)](#5-шаг-за-шагом-выкат-для-devops-nexus--k8s--jenkins)
6. [Справочник: переменные, метрики, файлы, версии](#6-справочник-переменные-метрики-файлы-версии)
7. [Если что-то не работает](#7-если-что-то-не-работает)

---

## 1. Что это и как устроено

### Роли компонентов

| Компонент | Что делает |
|-----------|------------|
| Runner (этот репо) | Открывает страницы, гоняет Lighthouse, пишет метрики |
| `profiles/*.json` | Список URL для замера |
| `.env` / параметры CI | Стенд, время прогона, auth, куда писать Influx |
| **InfluxDB 1.8** | Хранит точки метрик |
| **Grafana** | Только рисует; сама ничего не замеряет |
| **Nexus** | Хранит Docker-образ раннера (не запускает тесты) |
| **Kubernetes Job** | Поднимает Pod на время прогона и гасит его |
| **Jenkins** | Жмёт кнопку / передаёт параметры в Job |
| **Git** | Профили и Jenkinsfile (локально в PoC — Gitea) |

### Схема runner’а

```text
  profiles/*.json          .env или параметры Job
  (какие страницы)         (стенд, Influx, токены)
           \                     /
            v                   v
        ┌──────────────────────────┐
        │  Playwright → auth       │
        │  Lighthouse → метрики    │
        └────────────┬─────────────┘
                     │
       ┌─────────────┼─────────────┐
       v             v             v
    console    results/<id>/   InfluxDB 1.8
                               (INFLUX_URL)
                                     │
                                     v
                                  Grafana
```

### Схема CI (как в этом репо)

```text
  Git (profiles + Jenkinsfile)
           │
           v
       Jenkins  ──▶  Kubernetes Job (Pod)
                         │
                         │ docker pull
                         v
                       Nexus
                  (образ :1.1.0)
                         │
                         │ метрики
                         v
                    InfluxDB  ◀── Grafana
```

Рядом с нагрузкой:

```text
  JMeter / k6          этот runner
  (нагрузка)           (Lighthouse)
       \                   /
        └── одновременно ──┘
              один стенд
```

---

## 2. Шаг за шагом: поднять демо у себя

Цель: за 10–15 минут увидеть метрики WebTours в Grafana на своём ПК.

### Что нужно заранее

- Docker Desktop (запущен)
- Node.js **20+**
- Windows: PowerShell  
  Linux/macOS: bash

### Шаг 2.1 — клонировать

```powershell
git clone https://github.com/GeorgeKalyaev/browser-lighthouse-performance.git
cd browser-lighthouse-performance
```

### Шаг 2.2 — один скрипт установки

**Windows:**

```powershell
npm run bootstrap
```

**Linux / macOS:**

```bash
chmod +x scripts/*.sh
./scripts/bootstrap.sh
```

Что сделает скрипт сам:

1. `npm ci` (зависимости)
2. установка Chromium для Playwright
3. поднятие **InfluxDB + Grafana + WebTours**
4. копирование `.env.example` → `.env` (если `.env` ещё нет)
5. preflight-проверка

Первый запуск может занять несколько минут (build WebTours + pull образов).

### Шаг 2.3 — прогон

```powershell
npm run browser:performance
```

По умолчанию: ~60 секунд, профиль `webtoursUrls`, стенд `http://127.0.0.1:1080/`.

Сначала можно только проверку без цикла:

```powershell
npm run browser:performance:check
```

### Шаг 2.4 — куда смотреть результат

| Куда | Адрес / путь |
|------|----------------|
| WebTours | http://127.0.0.1:1080/WebTours/ |
| InfluxDB | http://127.0.0.1:8086 — БД `performance`, auth выключен |
| Grafana | http://127.0.0.1:3000 — логин `admin` / `admin` |
| Дашборд | http://127.0.0.1:3000/d/browser-performance-lighthouse |
| JSON | папка `results/<RUN_ID>/` |

На дашборде должны появиться Speed Index, FCP, LCP и т.д. по страницам WebTours.

---

## 3. Шаг за шагом: свой стенд и свои страницы

Цель: мерить не WebTours, а ваш test/stage.

### Шаг 3.1 — указать стенд в `.env`

```powershell
copy .env.example .env
```

Откройте `.env` и задайте:

```env
TEST_STAND=https://test.example.local/
PERFORMANCE_URLS_PROFILE=loadTestUrls
RUN_TIME=300
PACING=10
PERF_REQUEST_TIMEOUT=60
CACHE_MODE=cold
```

`TEST_STAND` — всегда **со слэшем в конце**. Хост в JSON-профилях не пишется.

### Шаг 3.2 — описать страницы в JSON

Файлы: каталог **`profiles/`**.  
Имя файла без `.json` = значение `PERFORMANCE_URLS_PROFILE`.

Пример `profiles/loadTestUrls.json`:

```json
[
  { "name": "Главная", "path": "./dashboard", "token": "userToken" },
  { "name": "Карточка", "path": "./projects/1001", "token": "userToken" },
  { "name": "Админка", "path": "./admin/users", "token": "adminToken" }
]
```

Правила:

| Поле | Правило |
|------|---------|
| `name` | Уникальный id страницы (уйдёт в Influx как тег `page`) |
| `path` | Относительный путь к `TEST_STAND` |
| `token` | Логическое имя: `userToken` / `adminToken` / `anonymous` — **не** сам секрет |

Готовые файлы в репо: `webtoursUrls`, `smokeUrls`, `loadTestUrls`, `criticalUrls`, `adminUrls`.

### Шаг 3.3 — токены и способ auth

В `.env`:

```env
USER_TOKEN=...ваш JWT или cookie-значение...
ADMIN_TOKEN=...
AUTH_STRATEGY=bearer-header
```

| `AUTH_STRATEGY` | Когда брать |
|-----------------|-------------|
| `bearer-header` | API/SPA ждёт `Authorization: Bearer …` |
| `local-storage` | Токен лежит в `localStorage` |
| `session-storage` | То же для `sessionStorage` |
| `cookie` | Токен в cookie |

Ключи storage/cookie: `AUTH_STORAGE_KEY`, `AUTH_COOKIE_NAME` (см. `.env.example`).  
Маппинг имён токенов → env: `src/config/tokens.ts`.

### Шаг 3.4 — проверить и запустить

```powershell
npm run browser:performance:check
npm run browser:performance
```

Если preflight красный — правьте URL / токены, пока не станет зелёным. Потом уже полный прогон.

Параллельно с JMeter: просто стартуете оба на одном `TEST_STAND`. Отдельной «склейки» id не нужно.

---

## 4. Шаг за шагом: свой InfluxDB и своя Grafana

Демо Influx/Grafana из `docker compose` — только для локальной проверки. В компании используете **свои**.

### Шаг 4.1 — куда писать метрики

В `.env` (или в параметрах Jenkins / K8s Job):

```env
INFLUX_ENABLED=true
INFLUX_URL=http://influx.company.local:8086
INFLUX_DATABASE=performance
INFLUX_USERNAME=
INFLUX_PASSWORD=
INFLUX_MEASUREMENT=browser_performance
```

1. Поднимите / возьмите существующий **InfluxDB 1.x** (HTTP line protocol).
2. Создайте БД (например `performance`) или дайте права на create.
3. Укажите `INFLUX_URL` так, чтобы до него достучался runner (с ноутбука, из Pod, из Jenkins — смотря откуда запускаете).
4. Прогон: `npm run browser:performance:check` — должен пройти ping Influx.

Без Influx: `INFLUX_ENABLED=false` — останутся console + JSON.

Что пишется:

- **теги:** `page`, `profile`, `stand`, `run_id`, `cacheMode`
- **поля:** `speedIndex`, `fcp`, `lcp`, `ttfb`, `tbt`, `cls`, …

`run_id` — просто метка этого прогона раннера (автогенерация, если пусто).

### Шаг 4.2 — как смотреть в своей Grafana

1. Откройте **вашу** Grafana (не обязательно из этого репо).
2. **Connections → Data sources → Add → InfluxDB**
   - URL = тот же, что `INFLUX_URL` (с точки зрения Grafana)
   - Database = `performance` (или как назвали)
   - Version / query language — InfluxQL для 1.x
3. Save & test — должен быть зелёный.
4. **Dashboards → Import** → файл из репо:  
   `grafana/dashboards/browser-performance.json`  
   При импорте выберите ваш datasource (в демо uid был `bpr-influx` — просто подставьте свой).
5. Откройте дашборд, фильтры: `run_id`, `page`, `profile`.

Готово: runner пишет в ваш Influx → вы смотрите в своей Grafana.

---

## 5. Шаг за шагом: выкат для DevOps (Nexus / K8s / Jenkins)

Ниже два пути: **краткий боевой** и **полный локальный PoC** (как проверялось в этом репо).

### 5A. Минимально в компании (без демо-compose)

| Шаг | Действие |
|-----|----------|
| 1 | Собрать образ из корневого `Dockerfile`, тег например `1.1.0` |
| 2 | Запушить в **ваш** Nexus / Harbor / registry |
| 3 | Положить `profiles/*.json` в Git (GitLab / GitHub) |
| 4 | Запускать контейнер или Kubernetes Job с env: `TEST_STAND`, `PERFORMANCE_URLS_PROFILE`, `INFLUX_URL`, токены |
| 5 | В корпоративной Grafana — datasource на Influx + импорт дашборда (шаг 4 выше) |

Образ внутри: Node + Playwright Chromium + скомпилированный `dist/` + `profiles/`.  
В Job профили можно обновлять через git-sync без пересборки образа (`scripts/k8s-entrypoint.sh`).

### 5B. Полный локальный контур (как в PoC) — по шагам

Нужны: Docker Desktop, место на диске **~8–12 GB** (Chromium-образ ~3.5 GB + Nexus + kind).

#### Шаг 5.1 — демо-стек (стенд + метрики)

```powershell
npm run local:up
```

Поднимает Influx, Grafana, WebTours.

#### Шаг 5.2 — локальный Git (Gitea) под профили

```powershell
npm run local:git
```

- UI: http://localhost:3001 — `gitadmin` / `gitadmin`
- Скрипт пушит в remote **`gitea`** (GitHub `origin` не трогает)

У вас в проде вместо Gitea будет GitLab: поменяете URL в `k8s/configmap.yaml` и в Jenkins.

#### Шаг 5.3 — Nexus и образ раннера

```powershell
npm run local:nexus
```

| | |
|--|--|
| UI Nexus | http://localhost:8081 — `admin` / `admin123` |
| Docker registry | `127.0.0.1:8082` |
| Образ | `127.0.0.1:8082/browser-performance-runner:1.1.0` |

Если `docker push` ругается на HTTPS — Docker Desktop → Settings → Docker Engine:

```json
"insecure-registries": ["127.0.0.1:8082"]
```

Apply & Restart, снова `npm run local:nexus`.

#### Шаг 5.4 — Jenkins

```powershell
npm run local:jenkins
```

- http://localhost:8080 — `admin` / `admin`
- Jobs: `browser-performance` (docker run), после шага 5.5 — ещё `browser-performance-k8s`

#### Шаг 5.5 — Kubernetes (kind)

Предварительно: `winget install Kubernetes.kind` (или свой install kind).

```powershell
npm run local:k8s
```

Создаёт кластер `browser-perf`, namespace, RBAC, secrets, `jenkins/kubeconfig`.

Потом пересоберите Jenkins (если ещё не с kubectl) — `local:jenkins` / `docker compose up -d --build jenkins`.

#### Шаг 5.6 — запустить Job

**Вариант A — из Jenkins:** job `browser-performance-k8s` → Build with Parameters.

**Вариант B — руками:**

```powershell
.\scripts\run-k8s-job.ps1
```

Что происходит:

```text
1. kubectl apply Job
2. Pod тянет image из Nexus
3. git clone профилей
4. Lighthouse loop
5. запись в Influx (INFLUX_URL)
6. Job/Pod удаляются
```

Важно: из Pod стенд и Influx на хосте — через **`host.docker.internal`**, не через `127.0.0.1`.  
На Windows **не** делайте `kind load docker-image` для этого образа.

#### Шаг 5.7 — уборка

```powershell
npm run local:cleanup
# или со снятием kind:
.\scripts\cleanup-local.ps1 -StopKind
```

### Какие файлы за что отвечают (CI)

| Файл | Зачем |
|------|--------|
| `Dockerfile` | Сборка образа раннера |
| `docker-compose.yml` | Локальные Influx, Grafana, Gitea, Nexus, Jenkins |
| `Jenkinsfile` | Пайплайн: checkout + `docker run` |
| `Jenkinsfile.k8s` | Пайплайн: Kubernetes Job |
| `jenkins/Dockerfile` | Образ Jenkins (+ kubectl) |
| `jenkins/casc.yaml` | JCasC: credentials, jobs |
| `k8s/namespace.yaml` | Namespace |
| `k8s/rbac.yaml` | Права для Job |
| `k8s/configmap.yaml` | Дефолтные env / Git URL |
| `k8s/job.template.yaml` | Шаблон one-shot Job |
| `k8s/kind-config.yaml` | kind + HTTP к Nexus |
| `scripts/k8s-entrypoint.sh` | Старт Pod: git-sync → `node dist/…` |
| `scripts/setup-nexus.ps1` | Поднять Nexus, build/push образа |
| `scripts/setup-k8s.ps1` | Поднять kind и обвязку |
| `scripts/run-k8s-job.ps1` | Ручной прогон Job |
| `grafana/dashboards/browser-performance.json` | Дашборд для импорта |
| `.gitlab-ci.yml` | Заготовка под GitLab CI |

---

## 6. Справочник: переменные, метрики, файлы, версии

### Основные переменные `.env`

| Переменная | Смысл |
|------------|--------|
| `TEST_STAND` | Базовый URL стенда (`…/` в конце) |
| `PERFORMANCE_URLS_PROFILE` | Имя файла в `profiles/` без `.json` |
| `RUN_TIME` | Длительность цикла, сек |
| `PACING` | Пауза между аудитами, сек |
| `PERF_REQUEST_TIMEOUT` | Таймаут одной страницы, сек |
| `CACHE_MODE` | `cold` \| `warm` |
| `USER_TOKEN` / `ADMIN_TOKEN` | Секреты |
| `AUTH_STRATEGY` | Как класть токен |
| `INFLUX_ENABLED` | `true` / `false` |
| `INFLUX_URL` | Куда писать |
| `INFLUX_DATABASE` | Имя БД |
| `INFLUX_MEASUREMENT` | По умолчанию `browser_performance` |
| `RUN_ID` | Метка прогона; пусто → авто |
| `PROFILES_DIR` | Каталог JSON (K8s после git-sync) |
| `CHROME_PATH` | Свой Chrome; пусто → Playwright |

Полный шаблон: `.env.example`.

### Метрики

| Метрика | Audit Lighthouse | Ед. |
|---------|------------------|-----|
| Speed Index | `speed-index` | ms |
| FCP | `first-contentful-paint` | ms |
| LCP | `largest-contentful-paint` | ms |
| TBT | `total-blocking-time` | ms |
| CLS | `cumulative-layout-shift` | — |
| TTFB | `server-response-time` | ms |

### Команды

```powershell
npm run bootstrap                   # демо с нуля
npm run browser:performance:check   # только preflight
npm run browser:performance         # полный цикл
npm run build                       # dist/ для Docker
npm run local:up / local:git / local:nexus / local:jenkins / local:k8s
npm run local:cleanup
```

### Версии (на чём собрано)

| Что | Версия |
|-----|--------|
| Пакет / image tag | `1.1.0` |
| Node | ≥ 20 |
| Docker base | `mcr.microsoft.com/playwright:v1.62.1-jammy` |
| Lighthouse | ^12.4 |
| InfluxDB | `influxdb:1.8` |
| Grafana (демо) | `9.5.18` |
| Gitea | `1.22.3` |
| Nexus | `3.70.1` |
| K8s (PoC) | kind `browser-perf` |
| Демо-стенд | WebTours, порт `1080` |

Имя образа в registry: `browser-performance-runner:1.1.0`.

### Дерево репо (коротко)

```text
profiles/          ← страницы для замера
demo/webtours/     ← демо-стенд
src/               ← код runner’а
grafana/           ← дашборд + provisioning демо
jenkins/           ← Dockerfile + casc
k8s/               ← Job, RBAC, kind
scripts/           ← bootstrap и setup-*
Dockerfile
Jenkinsfile
Jenkinsfile.k8s
.env.example
```

---

## 7. Если что-то не работает

| Симптом | Что сделать |
|---------|-------------|
| Preflight 401/403/404 | Проверить `TEST_STAND`, paths в JSON, токены, `AUTH_STRATEGY` |
| Grafana пустая | `INFLUX_ENABLED=true`, тот же `INFLUX_URL`/БД, datasource в Grafana смотрит **туда же** |
| WebTours не открывается | `docker compose -f demo/webtours/docker-compose.yaml ps` и `logs` |
| Pod не видит стенд/Influx | В env Job — `host.docker.internal`, не `127.0.0.1` |
| Не пушится в локальный Nexus | `insecure-registries: ["127.0.0.1:8082"]` в Docker Engine |
| Мало места на диске | `npm run local:cleanup`, не грузить образ через `kind load` |

---

## Вне скоупа

Пороги/гейты по метрикам, mobile/throttling, несколько Lighthouse параллельно в одном процессе — отдельные задачи поверх этого probe.
