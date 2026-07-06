# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 9)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Mock checkout + webhook stub | Stripe SDK integration |
| **token-sniper-bot** | LaserStream hardening + mock checkout | Stripe SDK + production LaserStream |
| **wallet-tracker-pro** | Behavioral + token mint analytics | Portfolio valuation |

## token-sniper-bot

**Done (phase 9)**
- `POST /api/v1/billing/checkout` — mock checkout URL when Stripe unset; 501 when keys set (SDK pending)
- `POST /webhook/stripe` — stub (503 mock / 501 when configured)
- LaserStream exponential reconnect backoff (5s → 60s cap)
- Signature dedupe cache (5 min TTL) to reduce duplicate launch ingests
- LaserStream stats exposed on `/health`

**Done (phase 8)**
- LaserStream WebSocket client, mock billing status API

**Still needed**
- Stripe Checkout Session + webhook tier sync

## wallet-tracker-pro

**Done (phase 9)**
- `getWalletBehaviorSummary()` — 30-day in/out ratio, net lamports
- `getTokenMintBreakdown()` — top token mints by event count
- Activity lookup + dashboard show behavior and token breakdown

**Done (phase 8)**
- 7-day analytics overview + top wallets

**Still needed**
- Portfolio valuation / USD estimates
- Tier-based watch limits

## token-safety-bot

**Done (phase 9)**
- `POST /api/v1/billing/checkout` — mock checkout sessions
- `POST /webhook/stripe` — stub handler
- Billing status includes `pricesUsd`

**Done (phase 8)**
- Mock billing status API

**Still needed** — Stripe SDK checkout + webhook tier sync

## Commands

```bash
./scripts/local-dev-bootstrap.sh
```

**Mock checkout:** `POST /api/v1/billing/checkout` with `{ "tier": "pro" }` (auth required)

**Wallet tracker dashboard:** `cd wallet-tracker-pro && npm run dev`
