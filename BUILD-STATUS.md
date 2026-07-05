# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-05 (phase 2)

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Runnable baseline | Stripe billing + Postgres |
| **token-sniper-bot** | Launch pipeline MVP | Helius LaserStream + DB migrations |
| **wallet-tracker-pro** | Spec / UI shell | Telegram-first MVP |

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

**Done (phase 2)**
- pump.fun launch polling (`LaunchDetectionService`) wired into `MonitorService`
- Risk score on new launches + Telegram broadcast to `/launches subscribe` chats
- Fallback risk profile when metadata is not yet available

**Done (phase 1)**
- JWT auth, optional Telegram, monitor wired, RPC top-10 scoring, admin middleware

**Still needed**
- Helius LaserStream / richer metadata on launches
- Prisma migrations + persist launch alerts
- Remove duplicate dead services (`safety-scanner.ts` copy)
- Stripe subscriptions

## wallet-tracker-pro

**Phase 3 target:** Telegram bot MVP before dashboard depth.

## Commands

```bash
./scripts/local-dev-bootstrap.sh
./scripts/local-dev-bootstrap.sh --check
```

**Sniper launch alerts:** start bot → `/launches subscribe`

**Safety monitor alerts:** `/monitor <mint>` in Telegram (requires bot token)
