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

## Local development (no network install)

The package reuses a sibling bot's installed `node_modules` via a symlink so
that `@solana/web3.js` and `express` resolve without a separate install:

```bash
cd shared
ln -sfn ../token-safety-bot/node_modules ./node_modules
node ../token-safety-bot/node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   # type-check
node ../token-safety-bot/node_modules/jest/bin/jest.js --rootDir .                   # tests
node ../token-safety-bot/node_modules/typescript/bin/tsc -p tsconfig.json           # build -> dist/
```

## Tests

`auth/wallet-auth.test.ts` and `api/middleware.test.ts` cover:

- Ed25519 challenge acceptance/rejection (valid wallet vs. attacker key).
- JWT round-trip, tamper rejection, expiry rejection, wrong-secret rejection.
- Middleware 401 (missing/invalid token), 403 (insufficient tier), 429 (rate
  limit), and 200 happy path.

All tests use generated, in-memory keypairs and a test-only secret — **no real
keys, secrets, or network calls**.
