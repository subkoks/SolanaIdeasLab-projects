# Contributing to SolanaIdeasLab-projects

This monorepo contains the SolanaIdeasLab bots and a shared auth library. Thanks for
helping make it more secure and reliable.

## Repository layout

| Path | Purpose |
|---|---|
| `shared/` | `@solanaideaslab/shared` — canonical auth + API middleware (real Ed25519 wallet-proof + HS256 JWT; Express auth/subscription/rate-limit middleware). Consumed by the bots via a package install. |
| `token-safety-bot/` | Token safety / rug-pull analysis bot. |
| `token-sniper-bot/` | Token sniping / launch-detection bot. |
| `wallet-tracker-pro/` | Wallet tracking / watch bot. |
| `scripts/test-all.sh` | Full local regression (type-check + tests for every package, no network/deploy). |

## Local development

1. Install dependencies per package (`npm ci` where a lockfile exists; otherwise
   `npm install`).
2. Run the whole suite without touching any network, wallet, or deployment:
   ```bash
   bash scripts/test-all.sh
   ```
3. For an individual package: `npm run type-check && npm test`.

## Branching & PRs

- Branch from `main` (e.g. `feat/...`, `fix/...`).
- Open a PR against `main`. Same-repo PRs are auto-approved and auto-merged by the
  `auto-merge` workflow once all required status checks pass (branch protection still
  gates — nothing merges on red).
- Keep PRs focused and descriptive. Fill in the PR template, including the security
  checklist for auth/redirect/signing/validation changes.

## Security expectations

Security-sensitive areas — redirects, authentication, signing, transaction
construction, wallet integration, external URLs, user input, and serialization — are
high priority for review and testing. Please:

- Add a regression test for any bug fix or meaningful behavior change.
- Never commit real keys, seed phrases, tokens, or credentials (redact as `[REDACTED]`).
- Do not weaken authentication, authorization, validation, rate limits, or secret
  handling to make a change pass.
- Use local mocks / fixtures / a local validator instead of real chains and real
  credentials in tests.

## CI

CI (`ci.yml`) runs `verify` (type-check, lint, `npm audit`, tests, and PostgreSQL-gated
Prisma suites) for `shared` and the three bots, plus CodeQL code scanning. All required
checks must be green before merge.

## Code style

- Follow existing TypeScript / project conventions in each package.
- Run the narrowest relevant tests during development; run the full suite before pushing.
- Don't claim tests or CI passed unless they actually passed.
