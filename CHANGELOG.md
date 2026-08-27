# Changelog

All notable changes to the SolanaIdeasLab monorepo are documented here. This
project follows a continuous-delivery model: `main` is kept green and
release-ready; tagged releases are cut from `main` when a stable milestone is
reached.

## 2026-08 (autonomous hardening batch)

- **`shared/` — real auth library.** Replaced the previously-insecure auth
  scaffold (`verifySignature` always `true`, `verifyToken` always `null`,
  `createJWT` returned a literal) with cryptographically correct
  implementations:
  - Ed25519 wallet-ownership proof via Node `crypto.verify`.
  - HS256 JWT (HMAC-SHA256) with expiry enforcement, timing-safe comparison,
    and a secret-length guard (rejects secrets shorter than 16 chars).
  - Express middleware (`authMiddleware`, `subscriptionMiddleware`,
    `rateLimitMiddleware`, `errorHandler`) + a tested `bot-auth` adapter and
    `ADOPTION.md` drop-in wiring guide.
  - Self-contained package (no external JWT dependency); 25 unit + integration
    tests; builds to `dist/`; ESLint-clean (flat config).
- **Open-redirect fix (`wallet-tracker-pro`).** `getSafeReturnUrl` previously
  accepted scheme-less strings (`ht!tp://…`, `//evil.com`) as relative paths,
  enabling an open-redirect. Now only same-origin absolute URLs or `/`-prefixed
  relative paths are allowed. Regression-tested.
- **Security-gate test parity** across all three bots: production-guard,
  wallet-signature validation, dashboard-access, valid-JWT + wrong-secret
  rejection, subscription-limit boundaries, Stripe tier-mapping, error
  factories.
- **Tooling/docs.** `scripts/test-all.sh` full local regression (no network);
  `SECURITY.md` filled with the real auth model + safe-redirect policy;
  SETUP.md / README updated.

## Prior state

- `shared/` existed as dead, insecure scaffolding imported by zero bots.
- Test suite baseline at session start: **107 passing**. After this batch:
  **149 passing**, all type-checks and lint clean across the monorepo.
