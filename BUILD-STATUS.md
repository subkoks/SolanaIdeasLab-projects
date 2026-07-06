# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 12)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Dependabot @hono/node-server patch | Production hardening |
| **token-sniper-bot** | Telegram `/billing` | Real user stats in `/stats` |
| **wallet-tracker-pro** | Stripe webhook + Telegram billing/upgrade | Dashboard checkout UI |

## wallet-tracker-pro

**Done (phase 12)**
- `POST /api/webhooks/stripe` — syncs Telegram subscriber tier via `metadata.chatId`
- Telegram `/billing`, `/upgrade <tier>` (mock when Stripe unset)

## token-sniper-bot

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
