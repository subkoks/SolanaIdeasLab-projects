# SolanaIdeasLab Projects

Implementation repo for three Solana tools. Planning and architecture live in [SolanaIdeasLab](https://github.com/subkoks/SolanaIdeasLab).

**GitHub:** [subkoks/SolanaIdeasLab-projects](https://github.com/subkoks/SolanaIdeasLab-projects)

## Built apps

| Project | Port | Description |
|---|---|---|
| [token-safety-bot](./token-safety-bot) | 3000 | Token safety scans + monitoring |
| [token-sniper-bot](./token-sniper-bot) | 8000 | Launch detection, alerts, risk API |
| [wallet-tracker-pro](./wallet-tracker-pro) | 3001 | Wallet watches + analytics dashboard |

## Documentation

**Start here:** [docs/README.md](./docs/README.md)

| Guide | Contents |
|---|---|
| [Setup](./docs/SETUP.md) | Install, bootstrap, run locally (**no API keys required**) |
| [Usage](./docs/USAGE.md) | Dashboards, Telegram commands, billing mock flows |
| [API keys](./docs/API-KEYS.md) | Helius, Telegram, Stripe — add when ready |
| [Deploy](./docs/DEPLOY.md) | Production checklist + smoke tests |
| [Overview](./docs/OVERVIEW.md) | Architecture and ports |

## Quick start

```bash
cd ~/Projects/SolanaIdeasLab-projects
./scripts/local-dev-bootstrap.sh
```

Then see [docs/SETUP.md](./docs/SETUP.md). Verification and production keys can wait.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/local-dev-bootstrap.sh` | DBs, `.env`, deps, migrations, type-check |
| `scripts/deploy-smoke.sh` | Health checks for all three apps |
| `scripts/production-deploy-checklist.sh` | Pre-deploy steps + smoke |
| `scripts/safety-prod-check.sh` | Safety `/ready` + `/health` only |

## Engineering

- [BUILD-STATUS.md](./BUILD-STATUS.md) — phased build log
- [AGENTS.md](./AGENTS.md) — contributor/agent rules
- [shared/](./shared) — cross-project utilities

## Planned (not in this repo yet)

See [SolanaIdeasLab ideas](https://github.com/subkoks/SolanaIdeasLab/tree/main/ideas) — airdrop-tracker, copy-trade-bot, etc.
