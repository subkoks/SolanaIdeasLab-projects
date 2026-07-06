# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 14)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Production config guard + body limits | Observability / deploy runbook |
| **token-sniper-bot** | Telegram alerts wired to DB | Alert delivery from monitor |
| **wallet-tracker-pro** | Stripe checkout API + dashboard | End-to-end Stripe with live keys |

## wallet-tracker-pro

**Done (phase 14)**
- `POST /api/billing/checkout` — Stripe or mock checkout with `metadata.chatId`
- Dashboard **Checkout** button when Stripe configured
- Telegram `/upgrade` returns checkout URL when Stripe configured

**Done (phase 13)**
- `GET /api/billing/status`, `POST /api/billing/mock-upgrade`, dashboard Plans & billing

## token-sniper-bot

**Done (phase 14)**
- `/alert`, `/alerts`, `/stop` — DB-backed via `ensureTelegramUser` + `TokenAlert`

**Done (phase 13)**
- Real `/stats` and `/status` from database

## token-safety-bot

**Done (phase 14)**
- `assertProductionConfig()` — rejects default JWT / dev bypass flags in production
- Request body size limit (100kb), `trust proxy` in production

**Done (phase 12)**
- npm override `@hono/node-server` ≥ 1.19.13 (Dependabot #95)

## Stripe local testing

```bash
# Sniper (port 8000)
stripe listen --forward-to localhost:8000/webhook/stripe

# Safety (port 3000)
stripe listen --forward-to localhost:3000/webhook/stripe

# Wallet tracker (port 3001)
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

Include `chatId` in checkout metadata for wallet-tracker tier sync.

## Commands

```bash
./scripts/local-dev-bootstrap.sh
```
