# Adopting `@solanaideaslab/shared` in a bot

This guide shows how to replace a bot's bespoke auth middleware with the
canonical shared module. **Read-only reference for a reviewable PR** — nothing
here changes bot behavior until you wire it in.

## Why
`shared` provides real Ed25519 challenge verification and HS256 JWT (verified,
not stubbed), plus `authMiddleware`, `subscriptionMiddleware`, `rateLimitMiddleware`,
and an `errorHandler`. Adopting it removes duplicate, divergent auth code and
guarantees one vetted implementation.

## Prerequisites
- `shared/` is built (`tsc -p tsconfig.json` → `dist/`) or installed as a
  workspace/registry dependency.
- The bot supplies a strong `JWT_SECRET` (>= 16 chars). `WalletAuth` refuses to
  start with a shorter secret.

## Wiring steps (example: token-safety-bot)
1. Add the dependency (workspace link or published package):
   ```jsonc
   // token-safety-bot/package.json
   "dependencies": { "@solanaideaslab/shared": "file:../shared" }
   ```
2. Create a single adapter module in the bot:
   ```ts
   import { Connection } from '@solana/web3.js'
   import { WalletAuth, ApiMiddleware } from '@solanaideaslab/shared'
   import { toBotUser } from '@solanaideaslab/shared/adapters/bot-auth'
   import type { AuthenticatedRequest, AuthenticatedUser } from '../types/auth'

   const auth = new WalletAuth(
     new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'),
     process.env.JWT_SECRET!,
   )

   // Drop-in replacement for the existing authMiddleware signature (req,res,next).
   export const authMiddleware = (
     req: AuthenticatedRequest,
     res: Response,
     next: NextFunction,
   ): void => {
     // Preserve the existing dev bypass for local development.
     if (config.development.skipAuthInDev) {
       req.user = { id: 'dev-user', walletAddress: 'dev-wallet', subscriptionTier: 'enterprise' }
       next(); return
     }
     ApiMiddleware.authMiddleware((t) => {
       const u = auth.verifyToken(t)
       return u ? toBotUser(u) as unknown as AuthenticatedUser : null
     })(req, res, next)
   }
   ```
3. Keep the existing `skipAuthInDev` guard intact (do **not** weaken it).
4. Replace `jsonwebtoken` minting in the login/refresh flow to use
   `auth.createJWT(toBotUser(user))` so tokens are verifiable by `verifyToken`.
5. Add/keep tests: the shared suite already covers verification; add a bot-level
   test asserting `authMiddleware` 401s without a token and 200s with one.

## Notes
- The shared JWT payload uses `wallet` (base58) + `tier`. The adapter
  (`adapters/bot-auth.ts`) maps it to the bot's `walletAddress` field, so route
  handlers need no change.
- Do not delete the bot's `production-guard` — keep that safety net; the shared
  `WalletAuth` secret-length check is a second layer, not a replacement.
- This is a behavior-preserving refactor; cover it with the existing
  `tests/auth-middleware.test.ts` + a new `tests/shared-auth.test.ts`.
