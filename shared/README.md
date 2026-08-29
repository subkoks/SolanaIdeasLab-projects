# @solanaideaslab/shared

Canonical, reusable auth + API middleware for the SolanaIdeasLab bots.
Designed to be the single source of truth for wallet-ownership proof and
request authorization so individual bots do not re-implement (and silently
weaken) security-critical logic.

## What it provides

- `auth/wallet-auth.ts` — `WalletAuth`
  - `authenticateWallet(wallet)` — off-chain wallet-ownership proof: the client
    signs a timestamped challenge; the server verifies the **Ed25519**
    signature against the claimed Solana public key (real `crypto.verify`, no
    placeholder `return true`).
  - `createJWT(user)` / `verifyToken(token)` — **real HS256 JWT** (HMAC-SHA256
    via Node `crypto`), with expiry enforcement and constant-time signature
    comparison. No external JWT dependency.
  - Rejects a trivial/empty `jwtSecret` at construction.
- `api/middleware.ts` — `ApiMiddleware`
  - `authMiddleware(verifyToken)` — Bearer-token auth (401 on missing/invalid).
  - `subscriptionMiddleware(tier)` — tier-gate (403 below required tier).
  - `rateLimitMiddleware(max, window)` — in-memory fixed-window limiter (429).
  - `errorHandler` — never leaks internal error text in production.
  - `createApiResponse(...)` — consistent envelope.

## Security posture

- Signature verification is **cryptographically real** — an attacker cannot
  forge a login by presenting someone else's public key.
- JWTs are signed with an operator-supplied secret; verify uses a
  timing-safe comparison and rejects expired/tampered tokens.
- The `jwtSecret` must be provided by the consuming service (env/config). The
  library refuses to start with a secret shorter than 16 characters.

## Local development (self-contained)

`shared/` is a **self-contained package** with its own `package.json`,
`package-lock.json`, and `tsconfig.json`. Install and run it standalone — no
sibling symlink required (the older "symlink a bot's node_modules" approach is
obsolete and was removed because it hid missing devDependencies):

```bash
cd shared
npm install            # installs shared's own devDependencies
npm run type-check     # tsc --noEmit
npm test               # jest (includes the local schema harness)
npm run lint           # eslint
npm run build          # tsc -p tsconfig.json -> dist/
```

`dist/` is gitignored. Consumers (the bots) depend on `shared` via
`"@solanaideaslab/shared": "file:../shared"` and build `dist/` through their own
`build:shared` pre-hook, so `shared/dist` need not exist in the repo.

## Tests

`auth/wallet-auth.test.ts` and `api/middleware.test.ts` cover:

- Ed25519 challenge acceptance/rejection (valid wallet vs. attacker key).
- JWT round-trip, tamper rejection, expiry rejection, wrong-secret rejection.
- Middleware 401 (missing/invalid token), 403 (insufficient tier), 429 (rate
  limit), and 200 happy path.

All tests use generated, in-memory keypairs and a test-only secret — **no real
keys, secrets, or network calls**.
