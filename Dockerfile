FROM node:20-bullseye AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NODE_OPTIONS=--max_old_space_size=768

RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install minimal OS deps + Codex CLI (for AI codex mode in container).
# - ca-certificates: HTTPS/TLS
# - git: codex may probe git even with repo checks disabled (varies by version)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

# Install production dependencies.
# NOTE: SSR runs inside the API process and imports the Vite SSR bundle from `apps/web/dist/ssr`.
# That bundle depends on `@yablog/web` runtime deps (react/react-router-dom/etc.), so we must
# install production deps for both workspaces.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci -w @yablog/api -w @yablog/web --omit=dev

# Install Codex CLI globally so `spawn("codex", ...)` works inside the container.
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
RUN npm install -g @openai/codex

COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/web/dist /app/apps/web/dist

EXPOSE 8787
CMD ["node", "apps/api/dist/index.js"]
