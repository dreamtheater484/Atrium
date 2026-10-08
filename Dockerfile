# Atrium: one image with the server, the web app and the CLI.
#   docker build -t atrium .
#   docker compose -f deploy/docker-compose.yml up -d
# The runtime image holds only the bundled server (no node_modules, no sources).

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
ENV CI=true PNPM_HOME=/pnpm PATH=/pnpm:$PATH

# Dependencies first, so source changes don't reinstall them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY packages/db/package.json packages/db/
COPY packages/schema/package.json packages/schema/
COPY packages/ui/package.json packages/ui/
COPY packages/demo-data/package.json packages/demo-data/
COPY packages/importers/package.json packages/importers/
COPY packages/exporters/package.json packages/exporters/
COPY packages/mcp/package.json packages/mcp/
COPY packages/packs-core/package.json packages/packs-core/
COPY packs/tmforum/package.json packs/tmforum/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@atrium/server..." --filter "@atrium/web..." --filter "@atrium/cli..."

COPY . .
RUN pnpm --filter @atrium/web build \
 && pnpm --filter @atrium/cli build \
 && pnpm --filter @atrium/server build

# ---------- runtime ----------
FROM node:24-alpine
ARG VERSION=0.1.0
LABEL org.opencontainers.image.title="Atrium" \
      org.opencontainers.image.description="One shared, living map of your enterprise architecture" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=7300 \
    ATRIUM_VERSION=${VERSION}
WORKDIR /app
COPY --from=build --chown=node:node /src/apps/server/dist ./
USER node
EXPOSE 7300
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7300)+'/api/health',{headers:{host:'localhost'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.js"]
