# Overview

SolanaIdeasLab **projects** repo: three Node.js apps for Solana token intelligence and wallet monitoring. Planning docs live in the separate [SolanaIdeasLab](https://github.com/subkoks/SolanaIdeasLab) repo.

**GitHub:** [subkoks/SolanaIdeasLab-projects](https://github.com/subkoks/SolanaIdeasLab-projects)

## Projects

| Project | Default port | Stack | Purpose |
|---|---|---|---|
| **token-safety-bot** | 3000 | Express, Prisma/JSON store | Token safety scans, monitoring, Telegram alerts |
| **token-sniper-bot** | 8000 | Express, Prisma, Redis queues | Launch detection, risk scoring, Telegram + HTTP API |
| **wallet-tracker-pro** | 3001 | Next.js, Prisma | Wallet watch alerts via Telegram + analytics dashboard |

## How they relate

```mermaid
flowchart LR
  subgraph sniper [token-sniper-bot :8000]
    LS[LaserStream / Helius]
    TG1[Telegram]
    API1[REST API]
    DASH1[/dashboard/alerts]
  end
  subgraph safety [token-safety-bot :3000]
    SCAN[Safety scanner]
    TG2[Telegram]
    API2[REST API]
  end
  subgraph wallet [wallet-tracker-pro :3001]
    WEB[Next.js dashboard]
    TG3[Telegram bot]
    WATCH[Solana watcher]
  end
  PG[(Postgres)]
  RD[(Redis)]
  LS --> sniper
  sniper --> PG
  sniper --> RD
  safety --> PG
  wallet --> PG
  WATCH --> wallet
```

## Dev vs production

| Mode | Keys needed | Billing |
|---|---|---|
| **Local dev (default)** | None required | Mock upgrades, simulate webhook |
| **Real Solana data** | Helius RPC (recommended), optional Telegram | Still mock billing |
| **Production** | All Tier B + C keys — see [API-KEYS.md](./API-KEYS.md) | Stripe checkout + webhooks |

You can develop and explore **without verifying on-chain or adding paid keys**. Add keys when you are ready.

## Shared infrastructure

| Service | Databases | Notes |
|---|---|---|
| Postgres | `token_sniper`, `wallet_tracker`, `token_safety` | Created by bootstrap script |
| Redis | sniper queues | Default `localhost:6379` |
| Stripe | all three (optional) | Mock when `STRIPE_SECRET_KEY` empty |

## Repo layout

```
SolanaIdeasLab-projects/
├── docs/                 ← you are here
├── scripts/              ← bootstrap, deploy smoke, production checklist
├── token-safety-bot/
├── token-sniper-bot/
├── wallet-tracker-pro/
├── shared/               ← cross-project utilities
└── BUILD-STATUS.md     ← engineering phase log
```
