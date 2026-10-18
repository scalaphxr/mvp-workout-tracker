# The API server. Built from the root of the repository:
#   docker build -f deploy/api.Dockerfile -t mvp-api .
# Debian, not Alpine: native dev dependencies of the workspace (better-sqlite3) have prebuilt
# binaries for glibc only.
FROM node:22-slim

RUN corepack enable
WORKDIR /app

# Manifests first, so a change of the code does not reinstall the dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/content/package.json packages/content/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/schemas/package.json packages/schemas/
# The API and the packages it imports; the mobile app stays out of the image.
RUN pnpm install --frozen-lockfile --filter "@mvp/api..."

COPY apps/api apps/api
COPY packages/content packages/content
COPY packages/db packages/db
COPY packages/domain packages/domain
COPY packages/schemas packages/schemas

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# Started without pnpm: as the "node" user corepack would have to fetch it again at every start.
WORKDIR /app/apps/api
USER node
# Migrations are applied by the server itself at start.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
