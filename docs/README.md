# SolanaIdeasLab Projects — Documentation

User-facing guides for this repo. **Verification and production keys can wait** — start with the **local fixture lab**, then full mock/dev app paths.

## Start here

| Doc | What it covers |
|---|---|
| [OVERVIEW.md](./OVERVIEW.md) | Fixture lab + full apps, ports, architecture |
| [SETUP.md](./SETUP.md) | Prerequisites, bootstrap, fixture lab run, full apps |
| [USAGE.md](./USAGE.md) | Fixture demos, dashboards, Telegram, HTTP APIs, billing mocks |
| [API-KEYS.md](./API-KEYS.md) | Where to get keys and which `.env` vars to set (**later**) |
| [DEPLOY.md](./DEPLOY.md) | Production checklist, smoke tests, Stripe webhooks |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common local dev issues |

**Fixture lab ports:** Console `http://localhost:3002/` · Safety `…:3000/demo` · Sniper `…:8000/demo` · Wallet `…:3001/demo`

## Build / engineering

- [../BUILD-STATUS.md](../BUILD-STATUS.md) — phased feature log (for contributors)
- [../AGENTS.md](../AGENTS.md) — agent rules for this repo

## Quick start (no API keys)

```bash
cd ~/Projects/SolanaIdeasLab-projects
./scripts/local-dev-bootstrap.sh
```

Then open [SETUP.md](./SETUP.md) → **Run locally** and [USAGE.md](./USAGE.md).
