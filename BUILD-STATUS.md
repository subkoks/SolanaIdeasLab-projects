# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-05 (phase 4)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Heuristics + Prisma schema | Wire Postgres runtime + Stripe |
| **token-sniper-bot** | Launch pipeline + DB persist | Helius LaserStream |
| **wallet-tracker-pro** | Telegram + dashboard API | Analytics depth |

## token-safety-bot

**Done (phase 4)**
- Bundle burst heuristic (8+ txs in 120s window via signature block times)
- LP/freeze risk flag when freeze authority active + concentrated supply
- Prisma schema + init migration (`token_safety` DB); JSON store remains default until `DATABASE_URL` wiring

**Done (phase 2)**
- Telegram push when monitored token safety level changes on rescan
- Daily scan limits by subscription tier on `POST /api/v1/scan` (free: 10/day)

**Done (phase 1)**
- HTTP admin guard, wallet signature verification, monitor rescans, holder count, `.env.example`

**Still needed**
- Switch `DatabaseService` to Prisma when `DATABASE_URL` set
- Stripe tier enforcement beyond scan counts

## token-sniper-bot

**Done (phase 4)**
- Removed dead duplicate services (`safety-scanner.ts`, `solana.ts`)
- Improved liquidity pool proxy in `RiskScoringService.hasLiquidityPools`

**Done (phase 3)**
- Prisma init migration + `DetectedLaunch` persistence on new pump.fun launches
- Helius `getAsset` metadata enrichment on launch Telegram alerts (when `HELIUS_API_KEY` set)
- ESLint flat config (`eslint.config.mjs`) — lint re-enabled in CI

**Done (phase 2)**
- pump.fun launch polling (`LaunchDetectionService`) wired into `MonitorService`
- Risk score on new launches + Telegram broadcast to `/launches subscribe` chats

**Still needed**
- Helius LaserStream (real-time vs poll)
- Stripe subscriptions

## wallet-tracker-pro

**Done (phase 4)**
- SPL token transfer parsing in Solana watcher (`preTokenBalances` / `postTokenBalances`)
- Dashboard API: `GET /api/stats`, `GET /api/activity/[wallet]`
- Next.js dashboard page wired to stats + activity lookup

**Done (phase 3)**
- Telegram bot MVP: `/watch`, `/unwatch`, `/list`, `/activity`
- Solana watcher polls watchlist and pushes SOL in/out alerts
- Prisma schema + init migration

**Still needed**
- Portfolio charts / behavioral analytics
- Stripe / tier limits

## Commands

```bash
./scripts/local-dev-bootstrap.sh
./scripts/local-dev-bootstrap.sh --check
```

**Sniper launch alerts:** start bot → `/launches subscribe`

**Safety monitor alerts:** `/monitor <mint>` in Telegram (requires bot token)

**Wallet tracker bot:** set `TELEGRAM_BOT_TOKEN` → `cd wallet-tracker-pro && npm run bot:dev`

**Wallet tracker dashboard:** `cd wallet-tracker-pro && npm run dev` → open `/`
