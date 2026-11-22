# Web3 compatibility plan — historical assessment and current state

This file records the 2026-08-31 compatibility assessment. It is historical:
the repository has since completed the Web3 v3 and Node 24 migrations, so the
old recommendation to retain `@solana/web3.js` v1 is superseded.

## Current state

As of the 2026-11-22 maintenance checkpoint:

| Package | Declared `@solana/web3.js` | Locked version | Node engine |
|---|---:|---:|---:|
| `shared` | `^3.2.1` | `3.2.1` | `>=24.0.0` |
| `token-safety-bot` | `^3.2.1` | `3.2.1` | `>=24.0.0` |
| `token-sniper-bot` | `^3.2.1` | `3.2.1` | `>=24.0.0` |
| `wallet-tracker-pro` | `^3.2.1` | `3.2.1` | `>=24.0.0` |

GitHub Actions selects Node 24 for package jobs. TypeScript remains on the
current v6 line; the TypeScript 7 migration is deferred until the typed lint
toolchain supports it.

## Completed migration work

- PR #390 extended Node 24 CI to Wallet and Sniper and raised Wallet's engine
  requirement; Sniper's Node `>=24` engine requirement was already raised in
  PR #367.
- PR #407 completed the Web3 v3 migration across Safety and Shared, including
  bigint signature timestamps and readonly RPC response types. PR #367 added
  Sniper-specific `Uint8Array` and readonly RPC response-shape coverage.
- Wallet and Sniper v3 dependency updates were merged through PRs #369 and #367,
  with their package-specific compatibility work completed before the combined
  migration.
- Prisma's vulnerable `effect` dependency is pinned to the reviewed patched
  version through the package overrides.

All current Solana RPC use remains read-only. No compatibility change in this
repository introduces transaction signing, submission, wallet-key handling, or
live-chain fixture behavior.

## Historical finding

The original assessment found only read-only `Connection`, `PublicKey`, and RPC
type usage. It recommended retaining v1 to avoid the then-unproven v3/module
format risk. That recommendation was appropriate only for the assessed snapshot
and must not be used to downgrade the current packages.

The earlier uuid non-reachability conclusion remains historical context, not a
dependency pin. Current dependency versions are defined by each package's
manifest and lockfile.

## Deferred work

- TypeScript 7 and TypeScript-ESLint major migration.
- Any future Web3 major upgrade beyond the locked v3 line.
- Any live RPC, signing, transaction, deployment, migration, or credential work,
  which remains outside this maintenance scope.

## Verification direction

After any future dependency change, run the affected package's frozen install,
type-check, lint, tests, build, production audit, and real fixture coverage.
Do not infer RPC compatibility from numeric mocks alone: include actual v3
response shapes at bigint, `Uint8Array`, and readonly API boundaries.
