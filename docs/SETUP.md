# Setup

Get all three projects running locally **without API keys**. Add keys later using [API-KEYS.md](./API-KEYS.md).

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| **Node.js** | 22.x (repo CI target) | Everything — `nvm use 22` recommended |
| **npm** | 10.x | Comes with Node 22 |
| **PostgreSQL** | 14+ | Running the bots with a real DB (optional for most tests) |
| **Redis** | 6+ | token-sniper-bot queues (optional for basic API) |

> **Local validation does not require Postgres or Redis.** All unit/type/lint
> checks run without a database. DB-backed tests (`describeIfDatabase`) are
> skipped automatically when `DATABASE_URL` is unset, so you can clone, install,
> type-check, lint, and test immediately. Install Postgres/Redis only when you
> want to actually run the apps end-to-end.

macOS (Homebrew) — install only if you intend to run the apps with a real DB:

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

## One-command bootstrap

From repo root:

```bash
cd ~/Projects/SolanaIdeasLab-projects
./scripts/local-dev-bootstrap.sh
```

This will:

1. Create Postgres DBs: `token_sniper`, `wallet_tracker`, `token_safety` (if `createdb` exists)
2. Copy `.env.example` → `.env` in each project **only when `.env` is missing**
3. Run `npm ci`, `prisma generate`, `prisma migrate deploy` (when DB is up)
4. Run `npm run type-check` in each project

Fast check without reinstalling deps:

```bash
./scripts/local-dev-bootstrap.sh --check
```

## Environment files

Each project has its own `.env` — **never commit them**.

| Project | Path |
|---|---|
| token-sniper-bot | `token-sniper-bot/.env` |
| token-safety-bot | `token-safety-bot/.env` |
| wallet-tracker-pro | `wallet-tracker-pro/.env` |

Defaults work for local dev. See [API-KEYS.md](./API-KEYS.md) when you add real services.

## Run locally

Open **three terminals** (or run only what you need):

### token-safety-bot (port 3000)

```bash
cd token-safety-bot
npm run dev
```

Health: `curl http://localhost:3000/health`  
Ready: `curl http://localhost:3000/ready`

### token-sniper-bot (port 8000)

```bash
cd token-sniper-bot
npm run dev
```

Health: `curl http://localhost:8000/health`  
Alert dashboard: http://localhost:8000/dashboard/alerts

### wallet-tracker-pro (port 3001)

Dashboard:

```bash
cd wallet-tracker-pro
npm run dev
```

Open http://localhost:3001

Telegram bot (separate terminal):

```bash
cd wallet-tracker-pro
npm run bot:dev
```

Health: `curl http://localhost:3001/api/health`

## Verify your install (no keys, no deploy)

Run the full local regression (type-check + tests for `shared` + all three
bots). It uses no network, deploy, wallet, secret, or external state change:

```bash
bash scripts/test-all.sh
```

To validate a single package:

```bash
cd shared && npm install && npm run type-check && npm test
cd token-safety-bot && npm install && npm run type-check && npm test
cd token-sniper-bot && npm install && npm run type-check && npm test
cd wallet-tracker-pro && npm install && npm run type-check && npm test
```

`npm test` for the bots auto-builds `shared/dist` first (via the `build:shared`
pre-hook), so the shared dependency resolves. Tests that need a live database
are skipped automatically when `DATABASE_URL` is unset.

> The `scripts/deploy-smoke.sh` and `scripts/production-deploy-checklist.sh`
> helpers are **production-oriented** (health checks against running services,
> pre-deploy steps). Use them only when you actually run the apps/deploy — they
> are not part of local validation.

## Tests (optional)

Per project:

```bash
cd token-sniper-bot && npm test
cd token-safety-bot && npm test
cd wallet-tracker-pro && npm test
```

### Full local regression (recommended)

`scripts/test-all.sh` runs type-check + unit tests for **all four** packages
(`shared` + the three bots) with **no network, deploy, wallet, secret, or
external state change**:

```bash
bash scripts/test-all.sh
```

### Shared package (`@solanaideaslab/shared`)

`shared/` is a **self-contained package** with its own `package.json`,
`package-lock.json`, and `tsconfig.json`. It no longer needs a sibling
`node_modules` symlink (that older approach was removed because it hid missing
devDependencies). Install and verify it on its own:

```bash
cd shared
npm install            # installs shared's own devDependencies
npm run type-check     # tsc --noEmit
npm test               # jest (includes the local schema harness)
npm run lint           # eslint
npm run build          # tsc -p tsconfig.json -> dist/  (dist/ is gitignored)
```

The bots consume `shared` via `"@solanaideaslab/shared": "file:../shared"`.
Their `pretest`/`pretype-check` scripts run a `build:shared` step that builds
`shared/dist` automatically, so you do not need to build it by hand before
running a bot's tests.

#### Local schema harness

`shared/tests/database-schema.test.ts` is a **local-only** validation + smoke
test for `shared/database/schemas.sql` — it runs the DDL in an in-memory
Postgres (`pg-mem`, no DB/credentials/network) and asserts table/column/constraint
behavior. It runs as part of `npm test` in `shared`. To run just that file:

```bash
cd shared
npx jest tests/database-schema.test.ts
```

See `shared/database/README.md` for exactly what the harness validates and what
it deliberately cannot validate (Supabase `auth.uid()` RLS enforcement is not
faked without a real Supabase-compatible context).

## Database management

| Command | Where |
|---|---|
| `npm run db:migrate` | Apply migrations (dev) |
| `npm run db:migrate:deploy` | Apply migrations (prod/CI) |
| `npm run db:studio` | Prisma Studio GUI |

Projects with Prisma: **token-sniper-bot**, **wallet-tracker-pro**, **token-safety-bot** (when `DATABASE_URL` set).

## Next steps

- [USAGE.md](./USAGE.md) — dashboards, Telegram, billing mock flows
- [API-KEYS.md](./API-KEYS.md) — when you want Helius, Telegram, Stripe
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — if bootstrap or ports fail
