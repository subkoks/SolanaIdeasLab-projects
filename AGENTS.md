# AGENTS.md

Repo-specific instructions for Codex CLI and other agents working in this repository.

## Scope

- This repo holds runnable Solana subprojects; the parent `SolanaIdeasLab` repo holds planning docs.
- Each subproject is an independent TypeScript package. Work inside the package you are changing.
- Read `README.md` and `CLAUDE.md` before editing.

## Operating rules

- Use the package-local commands in `CLAUDE.md` for build, test, lint, and security checks.
- Follow the Solana safety rules in `CLAUDE.md` for any signing, on-chain, or trading-related change.
- Keep secrets out of VCS and logs.
- Use repo-local `.codex/config.toml` for Codex workspace defaults.
