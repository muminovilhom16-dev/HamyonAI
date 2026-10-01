# Hamyon AI

Telegramdagi o'zbekcha aqlli hamyon.

Monorepo (pnpm, TypeScript strict). Biznes logika faqat backendda.

```
apps/api          Fastify API + grammY Telegram webhook (bundled with esbuild)
packages/config   Env validation (Zod), plan limits (configurable)
packages/core     Domain services: users/wallets, auth tokens, access control, PII masking
packages/db       Drizzle schema + SQL migrations (PostgreSQL 16)
```

## Local development

```bash
docker compose up -d            # postgres (+ hamyon_test db) and redis
cp .env.example .env            # fill TELEGRAM_* and AUTH_TOKEN_SECRET
pnpm install
pnpm db:migrate
pnpm dev                        # http://localhost:3000/health
```

The bot works only via webhook (no polling). For local testing expose the port
over https (e.g. a tunnel), set `PUBLIC_BASE_URL`, then:

```bash
pnpm --filter @hamyon/api set-webhook
```

## Checks

```bash
pnpm typecheck
pnpm test        # needs TEST_DATABASE_URL (a database whose name contains "test")
pnpm build && pnpm smoke   # boots the built server against a fake Telegram API
```

## Production

`Dockerfile` builds a minimal image; the container runs migrations, then the
server. Required env: see `.env.example` (`PUBLIC_BASE_URL` and `WEB_BASE_URL`
must be https). Secrets come only from environment variables.

Database migrations: edit `packages/db/src/schema.ts`, then `pnpm db:generate`.

## Money & data rules

- Amounts are `BIGINT` whole units; never floating point.
- USD transactions store the original amount, the frozen rate and `amount_uzs`.
- Debts are never expenses (enforced by DB constraints).
- Card numbers are masked to `****1234` before persistence.
- Telegram updates are idempotent (`processed_updates`).
