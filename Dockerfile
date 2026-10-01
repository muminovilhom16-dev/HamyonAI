# syntax=docker/dockerfile:1
# Workspace code (@hamyon/*) is bundled into apps/api/dist by esbuild; the
# runtime image only needs the API's third-party production dependencies.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @hamyon/api build

FROM base AS prod-deps
RUN pnpm install --prod --frozen-lockfile --filter @hamyon/api --config.node-linker=hoisted

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/dist ./dist
USER node
EXPOSE 3000
# Migrations run before the server starts; both are idempotent.
CMD ["sh", "-c", "node dist/migrate.js && node --enable-source-maps dist/server.js"]
