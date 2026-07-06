# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 8)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Mock billing API | Real Stripe checkout |
| **token-sniper-bot** | LaserStream + mock billing | Production LaserStream hardening |
| **wallet-tracker-pro** | 7-day analytics dashboard | Portfolio depth |

## token-sniper-bot

**Done (phase 8)**
- `HeliusLaserStreamService` — WebSocket push on pump.fun `InitializeMint2` → `monitor.ingestLaunchSignature()`
- `ENABLE_LASERSTREAM` feature flag (default on; skips when no `HELIUS_API_KEY`)
- `GET /api/v1/billing/status` — mock-aware tier info when `STRIPE_SECRET_KEY` unset
- Upgrade responses include `billing` status object

**Done (phase 7)**
- `POST /webhook/helius/enhanced`, `LAUNCH_POLL_INTERVAL_MS`

**Still needed**
- Real Stripe checkout sessions
- LaserStream reconnect/backpressure hardening

## wallet-tracker-pro

**Done (phase 8)**
- `GET /api/analytics/overview` — 24h/7d event counts, unique active wallets, avg events per watch
- `GET /api/analytics/top-wallets` — top wallets by 7-day activity
- Dashboard analytics section with top-wallet list

**Done (phase 7)**
- 14-day activity timeline + ESLint in CI

**Still needed**
- Portfolio / behavioral analytics depth
- Stripe tier limits

## token-safety-bot

**Done (phase 8)**
- `GET /api/v1/billing/status` — mock mode when Stripe keys unset
- Upgrade responses include `billing` status
- `STRIPE_*` env vars in `.env.example`

**Done (phase 5)** — Postgres via `createDatabaseService()`

**Still needed** — Real Stripe checkout + webhook tier sync

## Commands

```bash
./scripts/local-dev-bootstrap.sh
```

**Helius webhook:** `POST /webhook/helius/enhanced` with `Authorization: <HELIUS_WEBHOOK_SECRET>`

**LaserStream:** set `HELIUS_API_KEY` + `ENABLE_LASERSTREAM=true` (default)

**Wallet tracker dashboard:** `cd wallet-tracker-pro && npm run dev`
