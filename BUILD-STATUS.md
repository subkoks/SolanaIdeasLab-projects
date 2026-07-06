# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-06 (phase 6)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Postgres runtime wired | Stripe billing |
| **token-sniper-bot** | Launch history API + Telegram | Helius LaserStream |
| **wallet-tracker-pro** | Activity analytics chart | Portfolio depth |

## token-safety-bot

**Done (phase 5)**
- `createDatabaseService()` uses Prisma when `DATABASE_URL` is set; JSON file store remains default for tests/dev without Postgres
- `PrismaDatabaseService` mirrors JSON persistence API (users, scans, alerts, blacklist, cache)

**Still needed**
- Stripe tier enforcement beyond scan counts

## token-sniper-bot

**Done (phase 6)**
- `GET /api/v1/launches/recent` — persisted launch history from `DetectedLaunch`
- Telegram `/launches recent` lists last 10 launches with risk scores
- `TelegramBotService` shares main `DatabaseService` instance (no duplicate DB client)

**Done (phase 4)**
- Removed dead duplicate services; improved liquidity pool proxy in risk scoring

**Still needed**
- Helius LaserStream (real-time vs poll)
- Stripe subscriptions

## wallet-tracker-pro

**Done (phase 6)**
- Activity direction breakdown API field on `GET /api/activity/[wallet]`
- Recharts bar chart on dashboard for in/out/unknown counts

**Done (phase 4)**
- SPL parsing, dashboard API, Telegram MVP

**Still needed**
- Portfolio charts / behavioral analytics depth
- Stripe / tier limits

## Commands

```bash
./scripts/local-dev-bootstrap.sh
./scripts/local-dev-bootstrap.sh --check
```

**Sniper launch history:** `GET /api/v1/launches/recent` or Telegram `/launches recent`

**Wallet tracker dashboard:** `cd wallet-tracker-pro && npm run dev`
