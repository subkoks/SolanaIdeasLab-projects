# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 11)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Stripe webhook tier sync + `/quota` Telegram | E2E Stripe test mode |
| **token-sniper-bot** | Stripe webhook tier sync + `/launches stats` | E2E Stripe test mode |
| **wallet-tracker-pro** | Live CoinGecko SOL/USD with mock fallback | Stripe tier for Telegram |

## token-sniper-bot

**Done (phase 11)**
- `POST /webhook/stripe` — verifies signature, syncs tier on checkout/subscription events
- `syncSubscriptionFromStripe()` updates user tier + subscription rows
- Telegram `/launches stats`

**Done (phase 10)**
- Launch stats API, Stripe SDK checkout

## wallet-tracker-pro

**Done (phase 11)**
- Live SOL/USD from CoinGecko (`COINGECKO_API_KEY` optional)
- `PREFER_MOCK_SOL_PRICE=true` forces mock pricing
- Portfolio estimates use live price with mock fallback

**Done (phase 10)**
- Tier watch limits, portfolio summary

## token-safety-bot

**Done (phase 11)**
- `POST /webhook/stripe` — tier sync (incl. Telegram `telegram:<chatId>` users)
- Telegram `/quota` — daily scan usage

**Done (phase 10)**
- Scan quota HTTP API, Stripe SDK checkout

## Stripe webhook setup

1. Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + price IDs in bot `.env`
2. Stripe Dashboard → Webhooks → endpoint `https://HOST/webhook/stripe`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

## Commands

```bash
./scripts/local-dev-bootstrap.sh
```

**Sniper launch stats:** `/launches stats` or `GET /api/v1/launches/stats`

**Safety quota:** `/quota` or `GET /api/v1/users/quota`
