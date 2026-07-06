# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 7)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Postgres runtime wired | Stripe billing |
| **token-sniper-bot** | Helius webhook + configurable poll | LaserStream client |
| **wallet-tracker-pro** | Timeline analytics + CI lint | Portfolio depth |

## token-sniper-bot

**Done (phase 7)**
- `POST /webhook/helius/enhanced` — ingest launch txs from Helius enhanced webhooks (optional `HELIUS_WEBHOOK_SECRET`)
- `LaunchDetectionService.ingestSignature()` for webhook/push path alongside poll
- Configurable `LAUNCH_POLL_INTERVAL_MS` (default 30s)

**Done (phase 6)**
- `GET /api/v1/launches/recent`, Telegram `/launches recent`

**Still needed**
- Native Helius LaserStream WebSocket client
- Stripe subscriptions

## wallet-tracker-pro

**Done (phase 7)**
- 14-day activity timeline on `GET /api/activity/[wallet]` + Recharts line chart
- ESLint flat config (typescript-eslint only) — lint enabled in CI for all projects

**Done (phase 6)**
- Direction breakdown bar chart

**Still needed**
- Portfolio / behavioral analytics depth
- Stripe / tier limits

## token-safety-bot

**Done (phase 5)** — Postgres via `createDatabaseService()`

**Still needed** — Stripe tier enforcement

## Commands

```bash
./scripts/local-dev-bootstrap.sh
```

**Helius webhook:** point enhanced webhook to `POST /webhook/helius/enhanced` with `Authorization: <HELIUS_WEBHOOK_SECRET>`

**Wallet tracker dashboard:** `cd wallet-tracker-pro && npm run dev`
