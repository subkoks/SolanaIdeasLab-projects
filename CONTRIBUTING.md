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

1. Install dependencies per package: `cd <package> && npm install` (each package
   has its own `package-lock.json`; there is no root workspace).
2. Validate everything locally with no network, wallet, or deployment:
   ```bash
   bash scripts/test-all.sh
   ```
   This runs type-check + tests for `shared` and all three bots. `shared` is a
   self-contained package — `cd shared && npm install && npm test` works on its
   own (no sibling `node_modules` symlink needed).
3. For an individual package: `npm run type-check && npm test`.

> **DB-backed tests skip automatically** when `DATABASE_URL` is unset, so you can
> clone and validate immediately without Postgres/Redis.

## Hard local boundaries (do NOT cross during local dev/contribution)

These are enforced by policy and by the autonomous build. Never do any of the
following locally or in a PR:

- **No secrets / credentials**: no real API keys, Stripe keys, Telegram tokens,
  `JWT_SECRET`, seed phrases, private keys, or `.env` values. Mock flows cover
  billing/auth without real services.
- **No wallets / signing / on-chain actions**: no `Keypair` use, no
  `signTransaction`/`sendTransaction`, no transfers, mints, stakes, swaps,
  bridges, or any Solana transaction construction.
- **No live RPC / external network calls**: do not contact real Solana RPC
  endpoints, Helius, or any external service from tests or local runs. Use
  in-memory mocks/fixtures (e.g. `pg-mem` for the schema harness).
- **No production data / databases**: do not connect to or migrate a real
  database. The schema harness validates `schemas.sql` in-memory only.
- **No deployments**: do not run `npm run deploy` or any release step in a PR or
  local contribution flow.
- **No auth-contract / JWT-shape / `@solana/web3.js` / uuid-pin changes** unless
  explicitly approved.

If you need to demonstrate behavior, use generated fixtures, a test-only secret,
and in-memory primitives — never real material.

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

CI (`ci.yml`) runs `verify` (type-check, lint, tests, and PostgreSQL-gated Prisma
suites) for `shared` and the three bots, plus CodeQL code scanning and a
`security-check` job. All required checks must be green before merge; branch
protection gates auto-merge (nothing merges on red).

> **Local `npm audit` / `security-check` note:** on some machines a local npm
> mirror rewrites `package-lock.json` URLs, which can make `npm audit` error
> locally. That is a mirror artifact, not a real advisory — CI runs against the
> clean `registry.npmjs.org` lockfiles. **Never commit a mirror-rewritten
> lockfile**; `git checkout -- <package>/package-lock.json` restores it. See
> `docs/TROUBLESHOOTING.md` ("Local npm mirror rewrites lockfiles").

## Lockfiles

- Each package commits its own `package-lock.json` pinned to `registry.npmjs.org`.
- If a local `npm install` rewrites the `resolved` URLs (mirror), discard the
  change before committing (see above). Only commit a lockfile when you are
  intentionally changing dependencies.

## Code style

- Follow existing TypeScript / project conventions in each package.
- Run the narrowest relevant tests during development; run the full suite before pushing.
- Don't claim tests or CI passed unless they actually passed.
