# SolanaIdeasLab Projects

Implementation repo for Solana tools. Planning and architecture live in [SolanaIdeasLab](https://github.com/subkoks/SolanaIdeasLab).

**GitHub:** [subkoks/SolanaIdeasLab-projects](https://github.com/subkoks/SolanaIdeasLab-projects)

## Local fixture lab (no keys, no live chain)

Deterministic, simulated demos for local/CI use only. No wallet connection, live RPC, signing, trading, Redis, queues, or external APIs.

| Surface | URL | Start |
|---|---|---|
| [Solana Lab Console](./solana-lab-console) | http://localhost:3002/ | `cd solana-lab-console && npm run dev` |
| [token-safety-bot](./token-safety-bot) demo | http://localhost:3000/demo | `cd token-safety-bot && npm run dev` |
| [token-sniper-bot](./token-sniper-bot) demo | http://localhost:8000/demo | `cd token-sniper-bot && npm run dev` |
| [wallet-tracker-pro](./wallet-tracker-pro) demo | http://localhost:3001/demo | `cd wallet-tracker-pro && npm run dev` |

Shared design tokens: canonical `shared/design/tokens.css`. Sync / check:

```bash
node shared/design/sync-tokens.js
node shared/design/check-tokens.js
```

## Full apps (beyond fixtures)

| Project | Port | Description |
|---|---|---|
| [token-safety-bot](./token-safety-bot) | 3000 | Token safety scans + monitoring |
| [token-sniper-bot](./token-sniper-bot) | 8000 | Launch detection, alerts, risk API |
| [wallet-tracker-pro](./wallet-tracker-pro) | 3001 | Wallet watches + analytics dashboard |
| [solana-lab-console](./solana-lab-console) | 3002 | Static local launcher for the demos |

## Documentation

**Start here:** [docs/README.md](./docs/README.md)

| Guide | Contents |
|---|---|
| [Setup](./docs/SETUP.md) | Install, bootstrap, run locally (**no API keys required**) |
| [Usage](./docs/USAGE.md) | Fixture demos, dashboards, Telegram commands, billing mock flows |
| [API keys](./docs/API-KEYS.md) | Helius, Telegram, Stripe — add when ready |
| [Deploy](./docs/DEPLOY.md) | Production checklist + smoke tests |
| [Overview](./docs/OVERVIEW.md) | Architecture and ports |

## Quick start

```bash
cd ~/Projects/SolanaIdeasLab-projects
./scripts/local-dev-bootstrap.sh
```

For the fixture lab only, start Console + the three apps’ `npm run dev`, then open http://localhost:3002/. See [docs/SETUP.md](./docs/SETUP.md). Verification and production keys can wait.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/local-dev-bootstrap.sh` | DBs, `.env`, deps, migrations, type-check; prints fixture-lab URLs |
| `scripts/local-lab-smoke.sh` | HTTP 200 checks for Console + three `/demo` routes (servers must be up) |
| `scripts/test-all.sh` | Local regression: design tokens + shared + bots + console (no network/deploy/secrets) |
| `scripts/deploy-smoke.sh` | Health checks for all three apps |
| `scripts/production-deploy-checklist.sh` | Pre-deploy steps + smoke |
| `scripts/safety-prod-check.sh` | Safety `/ready` + `/health` only |

## Engineering

- [BUILD-STATUS.md](./BUILD-STATUS.md) — phased build log
- [AGENTS.md](./AGENTS.md) — contributor/agent rules
- [shared/](./shared) — cross-project utilities + [design tokens](./shared/design)

## Planned (not in this repo yet)

See [SolanaIdeasLab ideas](https://github.com/subkoks/SolanaIdeasLab/tree/main/ideas) — airdrop-tracker, copy-trade-bot, etc.
