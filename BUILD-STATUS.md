# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 15)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | `/ready` + runtime health metadata | Deploy runbook |
| **token-sniper-bot** | Monitor → Telegram alert delivery | Monitor dedupe / rate limits |
| **wallet-tracker-pro** | Mock checkout return + tier apply | Live Stripe E2E with keys |

## wallet-tracker-pro

**Done (phase 15)**
- Checkout return handler — `?checkout=success` applies mock tier via `mock-upgrade`
- Session-persisted chat ID/tier through mock checkout redirect

**Done (phase 14)**
- `POST /api/billing/checkout`, dashboard Checkout, Telegram `/upgrade` URL

## token-sniper-bot

**Done (phase 15)**
- Monitor `sendNotification` — fans out to Telegram via `token_watch` alerts + monitoring user
- `notifyMonitoringAlert` on Telegram bot; `parseTelegramChatId` helper

**Done (phase 14)**
- `/alert`, `/alerts`, `/stop` DB-backed

## token-safety-bot

**Done (phase 15)**
- `GET /ready` — 503 until database, queue, and Solana checks pass
- `/health` includes `runtime.nodeEnv` and `runtime.productionGuard`

**Done (phase 14)**
- Production config guard, body limits, trust proxy

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
