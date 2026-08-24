# Browser Performance Runner — multi-stage build (no tsx at runtime).
# Builder: npm ci + tsc → dist/
# Runtime: Playwright + Chromium + compiled JS + JSON profiles

FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

# ---------------------------------------------------------------------------

FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PROFILES_DIR=/app/profiles

# Git sync of profiles/ at Job start (Gitea / GitLab)
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY profiles ./profiles
COPY scripts/k8s-entrypoint.sh ./scripts/k8s-entrypoint.sh

RUN chmod +x ./scripts/k8s-entrypoint.sh \
  && sed -i 's/\r$//' ./scripts/k8s-entrypoint.sh

# Local / docker run. K8s Job overrides with k8s-entrypoint.sh
CMD ["node", "dist/index.js"]
