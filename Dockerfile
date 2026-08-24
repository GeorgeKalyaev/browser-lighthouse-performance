# Browser Performance Runner image for Nexus / Kubernetes.
# Contains: Node + Playwright + Chromium + Lighthouse + app sources (URL profiles).
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Git clone at Job start (profiles from Gitea / GitLab)
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY scripts/k8s-entrypoint.sh ./scripts/k8s-entrypoint.sh
RUN chmod +x ./scripts/k8s-entrypoint.sh

# tsx is needed to run TypeScript entrypoints without a separate build step
RUN npm install --no-save tsx@4.19.2 && npm cache clean --force

# Default: full measurement run (K8s Job uses scripts/k8s-entrypoint.sh)
CMD ["npx", "tsx", "src/index.ts"]
