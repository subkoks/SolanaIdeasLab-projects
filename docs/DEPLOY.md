# Deploy

Production deployment guide. **Local verification can wait** — use this when you host the apps.

## Pre-deploy checklist

```bash
cd ~/Projects/SolanaIdeasLab-projects
./scripts/production-deploy-checklist.sh
```

The script:

1. Confirms `.env.example` exists per project
2. Prints required production env vars (no secret values read)
3. Reminds you to run Prisma migrations
4. Runs `deploy-smoke.sh` if services respond

## Smoke tests

```bash
./scripts/deploy-smoke.sh [safety_url] [sniper_url] [wallet_url]
# Defaults: http://localhost:3000 :8000 :3001
```

| Check | Endpoint |
|---|---|
| Safety ready | `GET /ready` → 200 |
| Safety health | `GET /health` |
| Sniper health | `GET /health` |
| Sniper dashboard | `GET /dashboard/alerts` → 200 (warn if down) |
| Wallet health | `GET /api/health` |

Safety-only:

```bash
./scripts/safety-prod-check.sh http://localhost:3000
```

## Environment (production)

| Project | Required |
|---|---|
| **token-safety-bot** | `NODE_ENV=production`, non-default `JWT_SECRET`, `DATABASE_URL` |
| **token-sniper-bot** | `DATABASE_URL`, `JWT_SECRET`, Redis URL |
| **wallet-tracker-pro** | `DATABASE_URL`, Stripe vars for live billing |

Safety bot **blocks startup** if:

- Default `JWT_SECRET` in production
- `SKIP_WALLET_SIGNATURE_VERIFY=true`
- `SKIP_AUTH_IN_DEV=true`

See `token-safety-bot/src/utils/production-guard.ts`.

## Database migrations

Before first production deploy:

```bash
cd token-sniper-bot && npm run db:migrate:deploy
cd wallet-tracker-pro && npm run db:migrate:deploy
cd token-safety-bot && npm run db:migrate:deploy   # when using Postgres
```

## Process layout

| Service | Start command | Port |
|---|---|---|
| token-safety-bot | `npm run build && npm start` | 3000 |
| token-sniper-bot | `npm run build && npm start` | 8000 |
| wallet-tracker-pro | `npm run build && npm start` | 3001 |
| wallet Telegram bot | `npm run bot:start` | — (polling) |

Run wallet **dashboard** and **bot** as separate processes.

## Stripe webhooks (production)

Public HTTPS URLs required. Wallet tracker **must** sync `chatId` in checkout metadata.

| App | Path |
|---|---|
| wallet-tracker-pro | `https://YOUR_DOMAIN/api/webhooks/stripe` |
| token-sniper-bot | `https://YOUR_DOMAIN/webhook/stripe` |
| token-safety-bot | `https://YOUR_DOMAIN/webhook/stripe` |

Set `STRIPE_WEBHOOK_SECRET` per environment. Test with Stripe CLI before going live.

## Reverse proxy notes

- Safety: enable `trust proxy` in production (already set when `NODE_ENV=production`)
- Request body limit: 100kb on safety bot
- Wallet: Next.js behind proxy — set `PORT=3001` or platform default

## Helius webhooks (sniper)

`POST /webhook/helius/enhanced` — expose port 8000 or route through proxy. Set `HELIUS_WEBHOOK_SECRET` as Authorization header in Helius dashboard.

## After deploy

1. `./scripts/deploy-smoke.sh https://safety... https://sniper... https://wallet...`
2. Wallet dashboard → Load plans → confirm `stripeConfig.liveReady` if using Stripe
3. Telegram `/limits` and `/stats` on each bot

## Engineering log

Feature phases and merge history: [BUILD-STATUS.md](../BUILD-STATUS.md)
