# SolanaIdeasLab Projects — Documentation

User-facing guides for the three built apps in this repo. **Verification and production keys can wait** — everything below supports **mock/dev mode** first.

## Start here

| Doc | What it covers |
|---|---|
| [OVERVIEW.md](./OVERVIEW.md) | What each project does, ports, architecture |
| [SETUP.md](./SETUP.md) | Prerequisites, bootstrap, databases, first run |
| [USAGE.md](./USAGE.md) | Dashboards, Telegram commands, HTTP APIs, billing flows |
| [API-KEYS.md](./API-KEYS.md) | Where to get keys and which `.env` vars to set (**later**) |
| [DEPLOY.md](./DEPLOY.md) | Production checklist, smoke tests, Stripe webhooks |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common local dev issues |

## Build / engineering

- [../BUILD-STATUS.md](../BUILD-STATUS.md) — phased feature log (for contributors)
- [../AGENTS.md](../AGENTS.md) — agent rules for this repo

## Quick start (no API keys)

```bash
cd ~/Projects/SolanaIdeasLab-projects
./scripts/local-dev-bootstrap.sh
```

Then open [SETUP.md](./SETUP.md) → **Run locally** and [USAGE.md](./USAGE.md).
