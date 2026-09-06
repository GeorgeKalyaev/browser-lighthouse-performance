# WebTours (demo target)

Classic Mercury/HP WebTours on Apache + CGI. Local stand for trying the runner without a corporate environment.

```powershell
docker compose -f demo/webtours/docker-compose.yaml up -d --build
```

URL: http://127.0.0.1:1080/WebTours/

Wired via `profiles/webtoursUrls.json` and `TEST_STAND=http://127.0.0.1:1080/` in `.env.example`.
