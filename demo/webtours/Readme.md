# WebTours (demo target)

Classic Mercury/HP WebTours sample behind Apache + CGI. Used as a local stand so you can try the runner without a real test environment.

```powershell
docker compose -f demo/webtours/docker-compose.yaml up -d --build
```

Opens on http://127.0.0.1:1080/WebTours/

Profile wired for this demo: `profiles/webtoursUrls.json` + `TEST_STAND=http://127.0.0.1:1080/` in `.env.example`.
