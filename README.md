# Hamyon AI

Telegramdagi o'zbekcha aqlli hamyon.

Monorepo (pnpm, TypeScript strict). Biznes logika faqat backendda.

```
apps/api          Fastify API + grammY Telegram webhook (bundled with esbuild)
packages/ai       Provider-neutral AIProvider + Anthropic adapter (replaceable)
packages/config   Env validation (Zod), plan limits (configurable)
packages/core     Domain: parser + validation pipeline, transactions, FX, auth, access control
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

## Web: landing, sign up, panel

- `/` landing, `/signup` and `/login`, `/app` panel (served by the API, same origin).
- Accounts are Telegram accounts — no phone, email or password. Two ways in:
  the Telegram Login Widget, or the bot (`/start` to sign up, `/web` for a
  one-time login link).
- The widget only works on the domain registered for the bot: in @BotFather
  run `/setdomain` and enter the public domain.

## Production

Step-by-step (Uzbek): [docs/DEPLOY.md](docs/DEPLOY.md) — `cd deploy && ./deploy.sh`.


`Dockerfile` builds a minimal image; the container runs migrations, then the
server. Required env: see `.env.example` (`PUBLIC_BASE_URL` and `WEB_BASE_URL`
must be https). Secrets come only from environment variables.

Database migrations: edit `packages/db/src/schema.ts`, then `pnpm db:generate`.

## How a message becomes a transaction

```
text → mask card numbers → rule parser (amounts, type, category, date)
     → user category rules → AI only if still uncertain → schema + business
     validation (AI amounts must match parsed amounts) → decision:
     save | confirm amount | pick category | debt or expense? | ask amount
```

Without `ANTHROPIC_API_KEY` (or during an outage) the rule parser alone is
used; transactions with a certain amount are saved with a pending category.

## Money & data rules

- Amounts are `BIGINT` whole units; never floating point.
- USD transactions store the original amount, the frozen rate and `amount_uzs`.
- Debts are never expenses (enforced by DB constraints).
- Card numbers are masked to `****1234` before persistence.
- Telegram updates are idempotent (`processed_updates`).
