# SolanaIdeasLab Projects — Build Status

Last updated: 2026-07-05

## Summary

| Project | Status | Next milestone |
|---|---|---|
| **token-safety-bot** | Runnable baseline | Production auth + monitoring alerts |
| **token-sniper-bot** | Stabilized scaffold | Real launch detection + Telegram alerts |
| **wallet-tracker-pro** | Spec / UI shell | Telegram-first MVP (per master plan) |

## token-safety-bot

**Done (this phase)**
- HTTP admin routes gated by `ADMIN_WALLET_ADDRESSES`
- Wallet connect requires signed message + ed25519 verification (skippable in dev)
- Periodic monitor rescans (`MONITOR_RESCAN_INTERVAL_MS`)
- Holder count via SPL token account scan (fallback to largest accounts)
- `.env.example` + tests for wallet signature helper

**Still needed**
- PostgreSQL migration (optional — JSON store works for single-node dev)
- Stripe tier enforcement
- Telegram push on monitor score changes
- Bundle / LP lock heuristics

## token-sniper-bot

**Done (this phase)**
- Real JWT auth (was broken mock tokens)
- Optional Telegram startup (API works without bot token)
- `MonitorService` wired on startup
- Admin routes use `adminAuthMiddleware`
- Top-10 holder concentration from RPC (removed `Math.random()`)
- `.env.example`, auth unit tests, dev-friendly config defaults

**Still needed**
- pump.fun / Helius LaserStream launch pipeline
- Prisma migrations + seed
- Remove duplicate dead services (`safety-scanner.ts` copy)
- Stripe subscriptions

## wallet-tracker-pro

**Done (this phase)**
- `.env.example`
- Package scripts aligned with actual codebase
- Dashboard placeholder shell

**Still needed**
- Prisma schema (Wallet, Watchlist, Transaction)
- Analytics worker + API routes
- Telegram bot MVP (master plan Month 2 priority)

## Commands

```bash
# Bootstrap all three projects locally
./scripts/local-dev-bootstrap.sh

# Verify only
./scripts/local-dev-bootstrap.sh --check
```

## Doc alignment

- **Continuation target:** `token-safety-bot` (most complete)
- **Revenue priority #1:** `token-sniper-bot` launch alerts
- **Month 2:** wallet tracker Telegram MVP before Next dashboard depth
