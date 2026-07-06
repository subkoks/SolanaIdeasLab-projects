# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 13)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Dependabot @hono/node-server patch | Production hardening |
| **token-sniper-bot** | Real `/stats` from DB | Wire Telegram alerts to DB |
| **wallet-tracker-pro** | Dashboard billing UI + mock upgrade API | Stripe checkout from dashboard |

## wallet-tracker-pro

**Done (phase 13)**
- `GET /api/billing/status` — mode, tiers, prices, watch limits
- `POST /api/billing/mock-upgrade` — mock tier apply when Stripe unset
- Dashboard **Plans & billing** section — load plans, mock upgrade form

**Done (phase 12)**
- `POST /api/webhooks/stripe` — syncs Telegram subscriber tier via `metadata.chatId`
- Telegram `/billing`, `/upgrade <tier>` (mock when Stripe unset)

## token-sniper-bot

**Done (phase 13)**
- `ensureTelegramUser` / `getTelegramUserStats` — DB-backed Telegram users
- `/stats` — real tier, alert counts, launch subscription status
- `/status` — Helius health + launch stats

**Done (phase 12)**
- Telegram `/billing` — mode, tiers, launch counts + HTTP billing paths

## token-safety-bot

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
