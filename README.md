# browser-lighthouse-performance

Browser performance **probe**: Playwright готовит сессию/auth, **Lighthouse** меряет страницу, результат пишется в консоль / JSON / **ваш InfluxDB 1.8**. Смотреть можно в **любой Grafana** — достаточно datasource на этот Influx.

Это не генератор нагрузки. Нагрузку (JMeter, k6, …) гоняете отдельно; runner можно запускать **параллельно** в том же окне теста. Держите `PACING` разумным, чтобы аудиты сами по себе не добавляли лишний трафик.

Проверено локально на **HP/Mercury WebTours**, плюс полный контур **Jenkins → Nexus → Kubernetes (kind Job)**.

---

## Как читать этот README

| Если нужно… | Куда смотреть |
|-------------|---------------|
| Просто поднять и увидеть метрики | [Быстрый старт](#быстрый-старт) |
| Понять схему целиком | [Архитектура](#архитектура) |
| Подключить **свой** Influx / Grafana | [Свой InfluxDB и своя Grafana](#свой-influxdb-и-своя-grafana) |
| Список URL / стенд / auth | [Конфигурация](#конфигурация) |
| Выкатить как в CI (образ, Job, пайплайн) | [Выкат для DevOps](#выкат-для-devops) |
| Что за файлы лежат в репо | [CI и инфраструктурные файлы](#ci-и-инфраструктурные-файлы) |

Три уровня развёртывания:

1. **Runner + стенд** — Node + WebTours (или ваш `TEST_STAND`) + опционально Influx  
2. **Метрики в вашей компании** — тот же runner, `INFLUX_URL` на корпоративный Influx, дашборд в вашей Grafana  
3. **CI/CD** — Docker-образ в **Nexus**, Job в **Kubernetes**, триггер из **Jenkins** (локально всё это поднимается через `docker compose` + kind)

---

## Архитектура

### Общая схема

```text
                    profiles/*.json          .env / CI params
                    (какие страницы)         (стенд, Influx, auth)
                              \               /
                               v             v
                         ┌─────────────────────┐
                         │  browser-lighthouse │
                         │  performance        │
                         │                     │
                         │  Playwright  → auth │
                         │  Lighthouse  → SI…  │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              v                     v                     v
           console            results/<id>/          InfluxDB 1.8
                              *.json                 (ваш URL)
                                                           │
                                                           v
                                                      Grafana
                                                   (ваша или демо)
```

Рядом с нагрузкой (без обязательной «склейки» id):

```text
   JMeter / k6 / Gatling          этот runner
   ─────────────────              ────────────
   нагрузка на стенд              Lighthouse по URL из профиля
        │                                │
        └──────────── одновременно ──────┘
                     (один TEST_STAND)
```

### CI-контур (то, что собрано в репо)

```text
  Git (профили JSON + Jenkinsfile)
        │
        │  checkout / git clone в Job
        v
  ┌─────────────┐     pull      ┌──────────────────┐
  │   Jenkins   │──────────────▶│  Kubernetes Job  │
  │  (пайплайн) │               │  (kind / cluster)│
  └─────────────┘               └────────┬─────────┘
                                         │
                         image pull      │
                                         v
                               ┌──────────────────┐
                               │ Nexus (registry) │
                               │ browser-…:1.1.0  │
                               └──────────────────┘
                                         │
         Job пишет метрики ──────────────┤
                                         v
                               InfluxDB ←── Grafana
                               (INFLUX_URL)
```

Роли:

| Компонент | Роль |
|-----------|------|
| **Nexus** | Хранит Docker-образ раннера. Сам Lighthouse не запускает. |
| **Kubernetes Job** | One-shot Pod: pull образа → (опционально) git-sync профилей → прогон → выход. |
| **Jenkins** | Триггер и параметры (`TEST_STAND`, профиль, `RUN_TIME`, `INFLUX_*`). |
| **Git** | Источник `profiles/*.json` и пайплайнов (локально Gitea, у вас — GitLab/GitHub). |
| **InfluxDB** | Хранилище метрик. Любой доступный по сети 1.8. |
| **Grafana** | Только UI. Берёт данные из выбранного Influx datasource. |

---

## Версии (на чём собрано / проверено)

| Что | Версия / образ |
|-----|----------------|
| Пакет / image tag | `1.1.0` |
| Node | ≥ 20 |
| Playwright (npm) | ^1.50 (в Docker: `mcr.microsoft.com/playwright:v1.62.1-jammy`) |
| Lighthouse | ^12.4 |
| TypeScript | ^5.7 |
| InfluxDB | `influxdb:1.8` |
| Grafana (демо в compose) | `grafana/grafana:9.5.18` |
| Gitea (локальный SCM) | `gitea/gitea:1.22.3` |
| Nexus | `sonatype/nexus3:3.70.1` |
| Kubernetes | kind-кластер `browser-perf`, namespace `browser-performance` |
| Демо-стенд | HP/Mercury **WebTours** (`demo/webtours`, порт **1080**) |

Имя Docker-образа в реестре: `browser-performance-runner:1.1.0`  
npm-имя в `package.json`: `browser-lighthouse-performance`

---

## Быстрый старт

Нужны Docker Desktop и Node 20+.

```powershell
git clone https://github.com/GeorgeKalyaev/browser-lighthouse-performance.git
cd browser-lighthouse-performance
npm run bootstrap
npm run browser:performance
```

Linux/macOS: `chmod +x scripts/*.sh && ./scripts/bootstrap.sh`

`bootstrap` ставит зависимости и Chromium, поднимает демо Influx + Grafana + WebTours, копирует `.env`, гоняет preflight.

| Сервис (демо) | URL |
|---------------|-----|
| WebTours | http://127.0.0.1:1080/WebTours/ |
| InfluxDB | http://127.0.0.1:8086 (БД `performance`, auth off) |
| Grafana | http://127.0.0.1:3000 — `admin` / `admin` |
| Дашборд | http://127.0.0.1:3000/d/browser-performance-lighthouse |

---

## Свой InfluxDB и своя Grafana

Демо-compose — только для локальной проверки. В бою раннер **не требует** Grafana из этого репо.

### 1. Куда писать метрики

В `.env` или в параметрах Jenkins/K8s Job:

```env
INFLUX_ENABLED=true
INFLUX_URL=http://influx.company.local:8086
INFLUX_DATABASE=performance
INFLUX_USERNAME=          # если auth включён
INFLUX_PASSWORD=
INFLUX_MEASUREMENT=browser_performance
```

`INFLUX_URL` — любой reachable InfluxDB **1.x** (line protocol HTTP). Базу создайте заранее или дайте права на create.

Measurement по умолчанию: `browser_performance`.

Теги: `page`, `profile`, `stand`, `run_id`, `cacheMode`  
Поля: `speedIndex`, `fcp`, `lcp`, `ttfb`, `tbt`, `cls`, …  
(`run_id` — просто метка прогона раннера, авто `local-…` / `jenkins-…`; со склеиванием с JMeter ничего общего не требуется.)

Если Influx не нужен: `INFLUX_ENABLED=false` — останутся console + `results/<id>/`.

### 2. Как смотреть в своей Grafana

1. Datasource → InfluxDB → URL вашего Influx, database `performance` (или как назвали).  
2. Импорт дашборда из репо: `grafana/dashboards/browser-performance.json`  
   (в демо datasource uid `bpr-influx` — при импорте укажите свой datasource).  
3. Фильтры: `run_id`, `page`, `profile`.

Шаблон datasource для compose-демо: `grafana/provisioning/datasources/influxdb.yml` — в компании обычно заводят datasource руками или своим provisioning.

---

## Конфигурация

### Стенд и раннер — `.env`

```bash
cp .env.example .env
```

| Переменная | Смысл |
|------------|--------|
| `TEST_STAND` | Базовый URL стенда **со `/` в конце**. Домены в профилях не хранятся. |
| `PERFORMANCE_URLS_PROFILE` | Имя файла в `profiles/` без `.json` |
| `RUN_TIME` / `PACING` / `PERF_REQUEST_TIMEOUT` | длительность цикла / пауза / таймаут страницы (сек) |
| `CACHE_MODE` | `cold` \| `warm` |
| `USER_TOKEN` / `ADMIN_TOKEN` | секреты под логические токены из JSON |
| `AUTH_STRATEGY` | `bearer-header` \| `local-storage` \| `session-storage` \| `cookie` |
| `INFLUX_*` | см. выше |
| `RUN_ID` | опциональная метка прогона; пусто → автогенерация |
| `PROFILES_DIR` | каталог JSON (в K8s после git-sync) |
| `CHROME_PATH` | свой Chrome; пусто → Playwright Chromium |

Демо:

```env
TEST_STAND=http://127.0.0.1:1080/
PERFORMANCE_URLS_PROFILE=webtoursUrls
```

Боевой стенд:

```env
TEST_STAND=https://test.example.local/
PERFORMANCE_URLS_PROFILE=loadTestUrls
USER_TOKEN=...
ADMIN_TOKEN=...
AUTH_STRATEGY=bearer-header
INFLUX_ENABLED=true
INFLUX_URL=https://influx.example.local:8086
INFLUX_DATABASE=performance
```

### Страницы — `profiles/*.json`

| Файл | Зачем |
|------|--------|
| `webtoursUrls.json` | демо WebTours |
| `smokeUrls.json` | короткий smoke |
| `loadTestUrls.json` | пример под нагрузкой |
| `criticalUrls.json` | критический путь |
| `adminUrls.json` | админка |

```json
[
  { "name": "Главная", "path": "./dashboard", "token": "userToken" }
]
```

- `name` — уникальный id (тег `page` в Influx)  
- `path` — относительно `TEST_STAND`  
- `token` — `userToken` / `adminToken` / `anonymous`, не сам секрет  

Маппинг токенов → env: `src/config/tokens.ts`.

### Метрики Lighthouse

| Метрика | Audit | Ед. |
|---------|-------|-----|
| Speed Index | `speed-index` | ms |
| FCP | `first-contentful-paint` | ms |
| LCP | `largest-contentful-paint` | ms |
| TBT | `total-blocking-time` | ms |
| CLS | `cumulative-layout-shift` | — |
| TTFB | `server-response-time` | ms |

---

## Выкат для DevOps

### Минимально в компании

1. Собрать образ из `Dockerfile`, запушить в **ваш** registry (Nexus/Harbor/…).  
2. Положить `profiles/*.json` в Git.  
3. Запускать контейнер / K8s Job с env: `TEST_STAND`, профиль, `INFLUX_URL`, токены.  
4. В Grafana компании — datasource на этот Influx + импорт дашборда.

Пример локальной сборки (как в PoC):

```powershell
npm run local:nexus   # поднимает Nexus :8081/:8082, build+push :1.1.0
```

Образ: `127.0.0.1:8082/browser-performance-runner:1.1.0`  
Для HTTP-registry в Docker Engine: `"insecure-registries": ["127.0.0.1:8082"]`.

### Kubernetes Job

```powershell
npm run local:git     # Gitea + push (у вас = GitLab URL в ConfigMap)
npm run local:k8s     # kind + RBAC + secrets + kubeconfig для Jenkins
```

| Файл | Назначение |
|------|------------|
| `k8s/namespace.yaml` | namespace `browser-performance` |
| `k8s/rbac.yaml` | ServiceAccount / Role для Job |
| `k8s/configmap.yaml` | дефолтные env, в т.ч. Git URL профилей |
| `k8s/job.template.yaml` | шаблон one-shot Job (image из Nexus) |
| `k8s/kind-config.yaml` | kind + HTTP registry к Nexus |
| `scripts/k8s-entrypoint.sh` | entrypoint Pod: git-sync профилей → `node dist/…` |
| `scripts/run-k8s-job.ps1` / `.sh` | ручной прогон Job без Jenkins |
| `Jenkinsfile.k8s` | пайплайн: apply Job, wait, cleanup |

Поток Job:

```text
kubectl apply Job
  → Pod pull image из Nexus
  → git clone profiles
  → Lighthouse loop
  → write Influx (INFLUX_URL)
  → Pod/Job удаляются
```

Из кластера стенд и Influx на хосте — через `host.docker.internal` (не `127.0.0.1`).  
На Windows не используйте `kind load docker-image` для этого образа (диск / стабильность Docker Desktop).

### Jenkins

| Файл | Назначение |
|------|------------|
| `Jenkinsfile` | job `browser-performance`: checkout + `docker run` |
| `Jenkinsfile.k8s` | job `browser-performance-k8s`: kubectl Job |
| `jenkins/Dockerfile` | Jenkins + плагины + kubectl |
| `jenkins/casc.yaml` | JCasC: credentials, job DSL |

Локально: `npm run local:jenkins` → http://localhost:8080 (`admin` / `admin`).

Параметры типичные: `TEST_STAND`, `PERFORMANCE_URLS_PROFILE`, `RUN_TIME`, `PACING`, `INFLUX_URL`, `CHECK_ONLY`, токены через credentials.

### Порядок подъёма полного локального контура

```powershell
npm run local:up        # Influx + Grafana + WebTours
npm run local:git       # Gitea, push кода/профилей
npm run local:nexus     # registry + image 1.1.0
npm run local:jenkins   # Jenkins
npm run local:k8s       # kind + RBAC; дальше job в UI или run-k8s-job.ps1
```

Уборка: `npm run local:cleanup` (или `-StopKind`).  
Диск: образ с Chromium ~3.5 GB + Nexus + kind — закладывайте запас.

---

## CI и инфраструктурные файлы

```text
Dockerfile                 multi-stage: npm ci + tsc → node dist/ + Playwright + profiles/
docker-compose.yml         Influx 1.8, Grafana 9.5, Gitea, Nexus, Jenkins
.env.example               шаблон всех env

profiles/*.json            URL для замера (главное, что правят тест-инженеры)
demo/webtours/             демо-стенд WebTours

Jenkinsfile                CI: docker run
Jenkinsfile.k8s            CI: Kubernetes Job
jenkins/Dockerfile         образ Jenkins
jenkins/casc.yaml          JCasC

k8s/namespace.yaml
k8s/rbac.yaml
k8s/configmap.yaml
k8s/job.template.yaml
k8s/kind-config.yaml

grafana/dashboards/browser-performance.json
grafana/provisioning/…     демо datasource/dashboard

scripts/bootstrap.ps1|.sh
scripts/start-local.*      Influx+Grafana+WebTours
scripts/setup-git-scm.ps1
scripts/setup-nexus.ps1
scripts/setup-k8s.ps1
scripts/start-jenkins.ps1
scripts/run-k8s-job.*
scripts/k8s-entrypoint.sh
scripts/cleanup-*.ps1|.sh

src/                       код runner’а (auth, lighthouse, reporters, …)
.gitlab-ci.yml             заготовка под GitLab CI
```

---

## Команды runner’а

```bash
npm run browser:performance:check   # preflight
npm run browser:performance         # цикл RUN_TIME
npm run build                       # dist/ для образа
npm test
```

Preflight: конфиг → профиль → токены → браузер → страницы с auth → ping Influx (если включён).

Цикл:

```text
while elapsed < RUN_TIME:
  следующая страница из профиля
  auth (Playwright)
  cold/warm cache
  Lighthouse
  console + JSON + Influx
  sleep PACING
```

---

## Типичные проблемы

| Симптом | Что проверить |
|---------|----------------|
| 401/403/404 на preflight | `TEST_STAND`, JSON paths, токены, `AUTH_STRATEGY` |
| В Grafana пусто | `INFLUX_ENABLED`, верный `INFLUX_URL`/БД, datasource в Grafana смотрит **туда же** |
| WebTours не поднимается | `docker compose -f demo/webtours/docker-compose.yaml logs` |
| Pod не достучится до стенда/Influx | `host.docker.internal`, не `127.0.0.1` |
| push в локальный Nexus | `insecure-registries` для `127.0.0.1:8082` |

---

## Вне скоупа

Пороги/гейты по метрикам, mobile/throttling, параллельные Lighthouse в одном процессе — поверх этого probe, отдельной задачей.
