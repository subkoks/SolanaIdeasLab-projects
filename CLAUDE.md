# CLAUDE.md — SolanaIdeasLab-projects

Companion code repo to [`subkoks/SolanaIdeasLab`](https://github.com/subkoks/SolanaIdeasLab):
the parent holds planning/ideas docs, this one holds the runnable Solana
subprojects. Each subproject is an **independent TypeScript package** with its
own `package.json`, lockfile, and `node_modules` — there is no root workspace.

## Subprojects

| Dir | What | Stack |
|-----|------|-------|
| `token-safety-bot/` | Token safety analysis — rug detection, contract scanning, risk scoring | TS + jest |
| `token-sniper-bot/` | Real-time launch detection, risk scoring, whale alerts | TS + jest + Prisma |
| `wallet-tracker-pro/` | Wallet tracking, behavioral analytics, copy-trading insights, portfolio | Next.js + Prisma + jest |
| `shared/` | Cross-project library: auth, db schemas, API patterns, UI primitives, deployment | docs/templates |

## Working in a subproject

Each is built/tested on its own. `cd` into the package first:

```bash
cd token-safety-bot
npm install
npm run dev          # local run
npm run build        # tsc / next build
npm test             # jest (test:coverage, test:watch also available)
npm run lint         # eslint  (lint:fix to autofix)
npm run type-check   # tsc --noEmit
npm run security-check
```

`token-sniper-bot` and `wallet-tracker-pro` add Prisma DB scripts:
`npm run db:migrate | db:generate | db:studio` (wallet-tracker-pro also
`db:seed`, `db:setup`, analytics/cache tooling and `npm run deploy`).

## Conventions

- TypeScript: `camelCase`, strict types, validate external/RPC input with Zod at boundaries.
- Solana: prefer `@solana/kit` for new RPC/tx code; isolate legacy `@solana/web3.js` behind a compat layer; simulate user-facing txns before send.
- **Trading safety:** keep research / simulation / live execution separated; enforce slippage limits, position caps, cooldowns, circuit breakers. Never frame speculative logic as guaranteed profit.
- **Secrets:** RPC URLs, keypairs, API keys live in per-package `.env*` — never commit. Treat wallet keys and signing as maximally sensitive; no key material in VCS or logs.
- Tests: jest, colocated `tests/` / `*.test.ts`; prioritize failure modes.
- One logical change per commit; `type(scope): description`; feature branches only.

## CI

`@claude` mentions invoke the agent; every PR gets an automatic Claude review.
Same-repo PRs auto-merge once required checks pass. Dependabot enabled
(`.github/dependabot.yml`). `node_modules/`, `dist/`, and `.env*` are gitignored.
