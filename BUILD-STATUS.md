# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 16)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | `scripts/safety-prod-check.sh` deploy smoke | Full deploy runbook doc |
| **token-sniper-bot** | Alert dedupe + per-chat rate limits | Alert history / metrics |
| **wallet-tracker-pro** | Subscriber poll after Stripe checkout | Live Stripe with production keys |

## wallet-tracker-pro

**Done (phase 16)**
- `GET /api/billing/subscriber?chatId=` — tier + watch limits + billing mode
- Stripe checkout return polls subscriber until tier syncs (or timeout)

**Done (phase 15)**
- Mock checkout return + tier apply via `?checkout=success`

## token-sniper-bot

**Done (phase 16)**
- `AlertNotificationThrottle` — dedupe + per-chat rate limit (`ALERT_DEDUPE_MS`, `ALERT_RATE_*`)
- Launch/token_watch alerts always fan out (not only when `userId` set)

**Done (phase 15)**
- Monitor → Telegram delivery

## token-safety-bot

**Done (phase 16)**
- `scripts/safety-prod-check.sh` — curls `/ready` + `/health` for deploy smoke

**Done (phase 15)**
- `GET /ready`, runtime metadata on `/health`

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
./scripts/safety-prod-check.sh http://localhost:3000
```
