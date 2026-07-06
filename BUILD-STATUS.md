# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 17)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Deploy smoke in `scripts/deploy-smoke.sh` | Production deploy doc |
| **token-sniper-bot** | Alert delivery history + metrics API | Alert dashboard UI |
| **wallet-tracker-pro** | Dev webhook sim + `/api/health` | Live Stripe with production keys |

## wallet-tracker-pro

**Done (phase 17)**
- `GET /api/health` — service liveness for deploy smoke
- `POST /api/billing/simulate-webhook` — mock/dev Stripe tier sync (`BILLING_DEV_WEBHOOK=true` optional)
- Shared `applySubscriberTierSync` helper used by Stripe webhook

**Done (phase 16)**
- Subscriber poll after checkout, alert throttle, deploy scripts

## token-sniper-bot

**Done (phase 17)**
- `AlertNotification` model + migration — persisted delivery log
- `GET /api/v1/alerts/metrics`, `GET /api/v1/alerts/history?token=`
- Telegram `/history` — per-user or per-token delivery log

**Done (phase 16)**
- Alert dedupe/rate limits, monitor → Telegram delivery

## token-safety-bot

**Done (phase 17)**
- Included in `scripts/deploy-smoke.sh` (safety + sniper + wallet)

**Done (phase 16)**
- `scripts/safety-prod-check.sh`, `/ready` probe

## Stripe local testing

```bash
# Sniper (port 8000)
stripe listen --forward-to localhost:8000/webhook/stripe

# Safety (port 3000)
stripe listen --forward-to localhost:3000/webhook/stripe

# Wallet tracker (port 3001)
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# Or simulate wallet tier sync without Stripe CLI (mock/dev):
curl -X POST http://localhost:3001/api/billing/simulate-webhook \
  -H 'Content-Type: application/json' \
  -d '{"chatId":"YOUR_CHAT_ID","tier":"pro"}'
```

Include `chatId` in checkout metadata for wallet-tracker tier sync.

## Commands

```bash
./scripts/local-dev-bootstrap.sh
./scripts/deploy-smoke.sh
./scripts/safety-prod-check.sh http://localhost:3000
```
