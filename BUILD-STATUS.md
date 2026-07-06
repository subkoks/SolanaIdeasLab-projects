# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 10)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Scan quota API + Stripe SDK checkout | Webhook tier sync |
| **token-sniper-bot** | Launch stats + Stripe SDK checkout | Webhook tier sync |
| **wallet-tracker-pro** | Tier watch limits + mock portfolio USD | Live SOL price feed |

## token-sniper-bot

**Done (phase 10)**
- `GET /api/v1/launches/stats` — total, 24h, breakdown by risk level
- `resolveCheckoutSession()` — Stripe SDK when keys + price IDs configured

**Done (phase 9)**
- Mock checkout, LaserStream hardening, billing status

**Still needed**
- Stripe webhook → subscription tier sync

## wallet-tracker-pro

**Done (phase 10)**
- Subscriber `tier` column + tier-based watch limits (free 3 / basic 10 / pro 25 / enterprise 100)
- Telegram `/limits` command
- `getWalletPortfolioSummary()` — mock USD via `MOCK_SOL_USD_PRICE`
- `GET /api/analytics/portfolio/[wallet]` + portfolio on activity lookup

**Done (phase 9)**
- Behavioral analytics + token mint breakdown

**Still needed**
- Live SOL/USD price (CoinGecko/Jupiter when keys available)
- Stripe-linked tier upgrades for Telegram subscribers

## token-safety-bot

**Done (phase 10)**
- `GET /api/v1/users/quota` — daily scan usage / remaining / reset time
- `resolveCheckoutSession()` — Stripe SDK when configured

**Done (phase 9)**
- Mock checkout + webhook stub

**Still needed** — Stripe webhook tier sync

## Commands

```bash
./scripts/local-dev-bootstrap.sh
```

**Launch stats:** `curl http://localhost:8000/api/v1/launches/stats`

**Scan quota:** `GET /api/v1/users/quota` (auth required)

**Portfolio:** `GET /api/analytics/portfolio/<wallet>`
