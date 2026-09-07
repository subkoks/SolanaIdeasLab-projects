# Overview

SolanaIdeasLab **projects** repo: apps converging on a Solana Trust/Risk Gateway for token intelligence, wallet telemetry, alerts, and future agent clients. Planning docs live in the separate [SolanaIdeasLab](https://github.com/subkoks/SolanaIdeasLab) repo.

**GitHub:** [subkoks/SolanaIdeasLab-projects](https://github.com/subkoks/SolanaIdeasLab-projects)

## Local fixture lab

Fixed local-only demos use **deterministic simulated data**. They are not live integrations.

| Surface | Port / path | Data |
|---|---|---|
| **solana-lab-console** | http://localhost:3002/ | Static launcher only (no fetch / aggregation) |
| **token-safety-bot** | http://localhost:3000/demo | Fixture risk reports |
| **token-sniper-bot** | http://localhost:8000/demo | Fixture alerts |
| **wallet-tracker-pro** | http://localhost:3001/demo | Fixture activity |

Design tokens: `shared/design/tokens.css` → generated outputs via `node shared/design/sync-tokens.js` (check with `node shared/design/check-tokens.js`).

## Projects

| Project | Default port | Stack | Purpose |
|---|---|---|---|
| **token-safety-bot** | 3000 | Express, Prisma/JSON store | Token safety scans, monitoring, Telegram alerts + local `/demo` |
| **token-sniper-bot** | 8000 | Express, Prisma, Redis queues | Launch detection, risk scoring, Telegram + HTTP API + local `/demo` |
| **wallet-tracker-pro** | 3001 | Next.js, Prisma | Wallet watch alerts + analytics + local `/demo` |
| **solana-lab-console** | 3002 | Node static server | Local module launcher for the demos |

## How they relate

```mermaid
flowchart LR
  subgraph console [solana-lab-console :3002]
    LAUNCH[Static launcher]
  end
  subgraph sniper [token-sniper-bot :8000]
    LS[LaserStream / Helius]
    TG1[Telegram]
    API1[REST API]
    DASH1[/dashboard/alerts]
    DEMO1[/demo fixtures]
  end
  subgraph safety [token-safety-bot :3000]
    SCAN[Safety scanner]
    TG2[Telegram]
    API2[REST API]
    DEMO2[/demo fixtures]
  end
  subgraph wallet [wallet-tracker-pro :3001]
    WEB[Next.js dashboard]
    TG3[Telegram bot]
    WATCH[Solana watcher]
    DEMO3[/demo fixtures]
  end
  PG[(Postgres)]
  RD[(Redis)]
  LAUNCH -.-> DEMO1
  LAUNCH -.-> DEMO2
  LAUNCH -.-> DEMO3
  LS --> sniper
  sniper --> PG
  sniper --> RD
  safety --> PG
  wallet --> PG
  WATCH --> wallet
```

Dashed edges are **browser navigation only** — the Console does not proxy or fetch module data.

## Dev vs production

| Mode | Keys needed | Billing | Fixture demos |
|---|---|---|---|
| **Local fixture lab** | None | N/A | Available in non-production |
| **Local full app** | None required | Mock upgrades, simulate webhook | Same |
| **Real Solana data** | Helius RPC (recommended), optional Telegram | Still mock billing | Keep demos local-only |
| **Production** | All Tier B + C keys — see [API-KEYS.md](./API-KEYS.md) | Stripe checkout + webhooks | Demo routes return 404 |

You can explore the **fixture lab without verifying on-chain or adding paid keys**. Add keys when you are ready for full-app paths.

## Shared infrastructure

`shared/` is a buildable package (`@solanaideaslab/shared`) providing wallet-ownership proof and API middleware. See [`shared/README.md`](../shared/README.md). Design tokens live under `shared/design/`.

| Service | Databases | Notes |
|---|---|---|
| Postgres | `token_sniper`, `wallet_tracker`, `token_safety` | Created by bootstrap script (full apps) |
| Redis | sniper queues | Default `localhost:6379` (full sniper path) |
| Stripe | all three (optional) | Mock when `STRIPE_SECRET_KEY` empty |

## Repo layout

```
SolanaIdeasLab-projects/
├── docs/                 ← you are here
├── scripts/              ← bootstrap, deploy smoke, production checklist
├── solana-lab-console/   ← local fixture launcher (:3002)
├── token-safety-bot/
├── token-sniper-bot/
├── wallet-tracker-pro/
├── shared/               ← utilities + design/
└── BUILD-STATUS.md       ← engineering phase log
```
