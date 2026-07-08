# Setup

Get all three projects running locally **without API keys**. Add keys later using [API-KEYS.md](./API-KEYS.md).

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| **Node.js** | 22.x (repo CI target) | `nvm use 22` recommended |
| **npm** | 10.x | Comes with Node 22 |
| **PostgreSQL** | 14+ | Per-project databases |
| **Redis** | 6+ | token-sniper-bot queues (optional for basic API) |

macOS (Homebrew):

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

## Verify install (optional)

When services are running:

```bash
./scripts/deploy-smoke.sh
# safety=http://localhost:3000 sniper=http://localhost:8000 wallet=http://localhost:3001
```

Production-oriented checklist (prints steps + runs smoke):

```bash
./scripts/production-deploy-checklist.sh
```

## Tests (optional)

Per project:

```bash
cd token-sniper-bot && npm test
cd token-safety-bot && npm test
cd wallet-tracker-pro && npm test
```

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
