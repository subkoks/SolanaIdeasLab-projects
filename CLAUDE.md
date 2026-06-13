# CLAUDE.md — SolanaIdeasLab-projects

Companion repo to `SolanaIdeasLab`: runnable Solana subprojects. The parent repo
holds planning docs; this one holds the code.

## Layout
- `token-safety-bot/`, `token-sniper-bot/`, `wallet-tracker-pro/` — independent bots.
- `shared/` — utilities reused across the bots.

## Conventions
- Python: `snake_case`, type hints at boundaries, validate external/RPC input.
- Secrets (RPC URLs, keypairs, API keys) live in `.env*` — never commit them.
- Treat wallet keys and signing as maximally sensitive; no key material in VCS or logs.
- Tests: `pytest`, colocated `*_test.py` / `tests/`; prioritize failure modes.
- One logical change per commit; `type(scope): description`; feature branches only.

## CI
`@claude` mentions invoke the agent; every PR gets an automatic Claude review.
Same-repo PRs auto-merge once required checks pass.
