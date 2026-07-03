# Projects (companion repo)

This directory is its own git repo and is pushed separately as **[subkoks/SolanaIdeasLab-projects](https://github.com/subkoks/SolanaIdeasLab-projects)**. The parent `SolanaIdeasLab` repo holds only the planning docs.

To work on these, clone both:

```bash
git clone git@github.com:subkoks/SolanaIdeasLab.git
git clone git@github.com:subkoks/SolanaIdeasLab-projects.git SolanaIdeasLab/projects
```

## Subprojects

## Built (with code)

- [`wallet-tracker-pro/`](wallet-tracker-pro) — Solana wallet tracker (Next.js, ~35 code files)
- [`token-safety-bot/`](token-safety-bot) — Token safety bot (~29 code files)
- [`token-sniper-bot/`](token-sniper-bot) — Token sniper bot (~28 code files)
- [`shared/`](shared) — Cross-project utilities (auth, db schemas, deployment, UI primitives)

## Planned (not yet built)

Listed in [`ideas/`](https://github.com/subkoks/SolanaIdeasLab/tree/main/ideas) tier docs. To start any of these, scaffold a subdir here with `src/`, `tests/`, `docs/`, `config/`, `deploy/`.

- ai-agent-platform
- airdrop-tracker
- copy-trade-bot
- crypto-tax-calculator
- kol-tracker
- on-chain-casino
- token-safety-suite

See [`MASTER-PLAN.md`](https://github.com/subkoks/SolanaIdeasLab/blob/main/MASTER-PLAN.md) and [`ARCHITECTURE.md`](https://github.com/subkoks/SolanaIdeasLab/blob/main/ARCHITECTURE.md) for context.

## Codex CLI

Codex CLI can use the repo root `AGENTS.md` and the tracked `.codex/config.toml` defaults in this workspace.
