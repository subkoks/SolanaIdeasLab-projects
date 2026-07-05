# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-05 (phase 3)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Runnable baseline | Stripe billing + Postgres |
| **token-sniper-bot** | Launch pipeline + DB persist | Helius LaserStream |
| **wallet-tracker-pro** | Telegram MVP | Dashboard + analytics |

## token-safety-bot

**Done (phase 2)**
- Telegram push when monitored token safety level changes on rescan
- Daily scan limits by subscription tier on `POST /api/v1/scan` (free: 10/day)

**Done (phase 1)**
- HTTP admin guard, wallet signature verification, monitor rescans, holder count, `.env.example`

**Still needed**
- PostgreSQL migration (optional for single-node dev)
- Stripe tier enforcement beyond scan counts
- Bundle / LP lock heuristics

## token-sniper-bot

**Done (phase 3)**
- Prisma init migration + `DetectedLaunch` persistence on new pump.fun launches
- Helius `getAsset` metadata enrichment on launch Telegram alerts (when `HELIUS_API_KEY` set)
- ESLint flat config (`eslint.config.mjs`) — lint re-enabled in CI

**Done (phase 2)**
- pump.fun launch polling (`LaunchDetectionService`) wired into `MonitorService`
- Risk score on new launches + Telegram broadcast to `/launches subscribe` chats
- Fallback risk profile when metadata is not yet available

**Done (phase 1)**
- JWT auth, optional Telegram, monitor wired, RPC top-10 scoring, admin middleware

**Still needed**
- Helius LaserStream (real-time vs poll)
- Remove duplicate dead services (`safety-scanner.ts` copy)
- Stripe subscriptions

## wallet-tracker-pro

**Done (phase 3)**
- Telegram bot MVP: `/watch`, `/unwatch`, `/list`, `/activity`
- Solana watcher polls watchlist and pushes SOL in/out alerts
- Prisma schema + init migration (`TelegramSubscriber`, `WalletWatch`, `WalletActivityEvent`)
- `npm run bot:dev` / `bot:start`

**Still needed**
- Next.js dashboard depth (currently placeholder)
- SPL token transfer parsing in watcher
- Stripe / tier limits

## Commands

```bash
./scripts/local-dev-bootstrap.sh
./scripts/local-dev-bootstrap.sh --check
```

**Sniper launch alerts:** start bot → `/launches subscribe`

**Safety monitor alerts:** `/monitor <mint>` in Telegram (requires bot token)

**Wallet tracker bot:** set `TELEGRAM_BOT_TOKEN` → `cd wallet-tracker-pro && npm run bot:dev`
