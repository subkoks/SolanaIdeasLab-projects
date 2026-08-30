# JWT Token-Shape Migration Plan — SolanaIdeasLab-projects

Status: PLANNING-ONLY / READ-ONLY discovery. No source, tests, config, lockfiles,
schema, branches, or GitHub state were modified. This document is the deliverable.

Author: autonomous milestone (Hermes, hy3-free)
Date: 2026-08-30
Repo: SolanaIdeasLab-projects (local `main` = fe90873; upstream `origin/main` = e82f60f, 15+ commits ahead; not fast-forwarded in this session)

---

## 0. Executive Summary

The two JWT-issuing bots (`token-sniper-bot`, `token-safety-bot`) each define an
**independent, non-shared** access-token contract built on the legacy claim triple
`{ userId, walletAddress, subscriptionTier }`. They diverge in secret source, TTL,
refresh-token shape, and authorization middleware. There is currently **no shared
auth package in the production path**: `shared/auth/wallet-auth.ts` and
`shared/api/middleware.ts` are scaffolds (`verifyToken` returns null,
`createJWT` returns a literal) and are not imported by either bot's runtime.

The goal is a safe, versioned migration to a normalized contract
`{ sub, wallet, tier }` (plus optional `iat/exp/iss/aud/jti/tokenVersion`)
that (a) keeps every already-issued token valid until its natural expiry,
(b) never changes an authorization outcome, and (c) allows gradual adoption of a
single shared `AuthUser` model.

**Recommended strategy:** *Versioned normalized issuance + dual-read acceptance for
a bounded window, with claim-precedence enforcement and conflict rejection.*
No database migration is required — normalization happens in the verification layer
(claim → `AuthenticatedUser` mapping), not in persisted data.

**Headline risks (detailed in §9):**
1. The two bots are already divergent; a naive "shared" contract must reconcile
   refresh-token and TTL differences or it will itself become the new incompatibility.
2. Neither bot pins `algorithms: ['HS256']` in `jwt.verify` (algorithm-confusion / `none`
   exposure) nor validates `iss`/`aud`. This is a pre-existing security gap that the
   migration should fix as a hardening side-effect, not as a behavior change that can
   regress users.
3. `wallet-tracker-pro` does not currently verify JWTs in its runtime; it must not be
   forced onto the new contract until the shared lib is real (not scaffold).

---

## 1. Current-State Contract Inventory

### 1.1 token-sniper-bot
Source of truth: `src/middleware/auth.ts`, `src/services/database.ts`,
`src/config/environment.ts`.

- Signing lib: `jsonwebtoken` (v9.x).
- Access token claims (manually built in `generateToken`):
  `{ userId: string, walletAddress: string, subscriptionTier: string, iat, exp }`
  - `iat`/`exp` added manually; `exp` = now + 24h hardcoded (env `JWT_EXPIRES_IN`
    exists but is NOT applied in `generateToken`).
- Algorithm: `jwt.sign(payload, config.jwt.secret)` → HS256 default. **No `algorithms`
  pin in verify.** No `iss`/`aud`/`jti`/`tokenVersion`.
- Secret source: `config.jwt.secret = process.env.JWT_SECRET ?? "token-sniper-bot-dev-secret"`
  (default differs from safety-bot).
- Refresh token: `generateRefreshToken(userId)` → signed with **separate**
  `config.jwt.refreshSecret = process.env.JWT_REFRESH_SECRET` (no dev default → undefined
  in dev). Payload `{ userId, type: "refresh", iat, exp=7d }`. **Does NOT carry tier.**
  `verifyRefreshToken` re-verifies with refreshSecret, then DB lookup re-mints an access
  token with the user's *current* tier.
- Verification: `authMiddleware` does `jwt.verify(token, config.jwt.secret)` and maps
  `decoded.userId → req.user.id`, `walletAddress → walletAddress`,
  `subscriptionTier → subscriptionTier`.
- Authorization surface: `authMiddleware`, `premiumAuthMiddleware`
  (basic|pro|enterprise), `proAuthMiddleware` (pro|enterprise),
  `enterpriseAuthMiddleware`, `adminAuthMiddleware` (wallet allowlist via
  `config.auth.adminWalletAddresses`), `optionalAuthMiddleware` (silent fail-through),
  `rateLimitByTier`, `checkSubscriptionLimit`.
- `AuthenticatedRequest.user` shape: `{ id, walletAddress, subscriptionTier }`
  (inline interface; `subscriptionTier: string` unbranded).
- Issuance call sites: `src/services/database.ts` login (`generateToken` + refresh) and
  `refreshToken` (re-mint via `generateToken`).

### 1.2 token-safety-bot
Source of truth: `src/middleware/auth.ts`, `src/services/database.ts` +
`src/services/database-prisma.ts`, `src/types/auth.ts`, `src/config/environment.ts`.

- Signing lib: `jsonwebtoken` (v9.x).
- Access token claims (built in `createTokenPair`):
  `{ userId, walletAddress, subscriptionTier }` signed with `config.auth.jwtSecret`
  and `expiresIn: config.auth.accessTokenTtl`. `iat`/`exp` auto-added by the lib.
- Refresh token: **same secret and same full claim shape** as the access token
  (carries `subscriptionTier`), TTL `JWT_REFRESH_TTL ?? "7d"`. Refresh verification in
  `refreshAuth` re-verifies with `config.auth.jwtSecret` — i.e. the "refresh" token is
  structurally an access token.
- Algorithm: `jwt.sign(payload, config.auth.jwtSecret, { expiresIn })` → HS256 default.
  **No `algorithms` pin.** No `iss`/`aud`/`jti`/`tokenVersion`.
- Secret source: `config.auth.jwtSecret = process.env.JWT_SECRET ?? "token-safety-bot-dev-secret"`
  (different dev default from sniper; same env var name).
- TTL: access `JWT_ACCESS_TTL ?? "1h"`, refresh `JWT_REFRESH_TTL ?? "7d"`.
- Verification: `authMiddleware` maps `payload.userId/walletAddress/subscriptionTier`
  → `req.user` of type `AuthenticatedUser`.
- `AuthenticatedUser` (`src/types/auth.ts`): `{ id: string, walletAddress: string,
  subscriptionTier: SubscriptionTier }`; `SubscriptionTier = 'free'|'basic'|'pro'|'enterprise'`.
- Authorization surface: `authMiddleware`, `adminAuthMiddleware` (wallet allowlist via
  `config.auth.adminWalletAddresses: Set<string>`), `createScanLimitMiddleware`
  (uses `req.user.id` + `req.user.subscriptionTier` against `SCAN_LIMITS_BY_TIER`),
  `subscription-limits` util. **No premium/pro/enterprise tiers, no dual rate-limit,
  no optional-auth middleware** — these exist only in sniper.

### 1.3 wallet-tracker-pro
- No JWT issuance or verification in the runtime path. Next.js/Telegram app; uses DB
  `TelegramSubscriber.tier` (migration `20260706100000_subscriber_tier`). `package.json`
  lists `jsonwebtoken` as a dep but no auth code imports it for token sign/verify.
- `shared/api/middleware.ts` and `shared/auth/wallet-auth.ts` are **scaffolds** and are
  not wired into wallet-tracker's actual request handling.

### 1.4 shared/ (prototype, not production-wired)
- `shared/auth/wallet-auth.ts` defines `AuthUser { id, wallet, publicKey,
  subscriptionTier, createdAt, lastActive }` — note it already uses `wallet` (the
  normalized name), plus `publicKey`/`createdAt`/`lastActive` not present in either bot.
  `verifyToken`/`createJWT` are stubs.
- `shared/api/middleware.ts` `ApiMiddleware.authMiddleware()` is a stub
  (`verifyToken` returns null). Not imported by either bot.
- This is the natural home for the shared normalized parser and `AuthUser` type, but it
  must be promoted from scaffold to real implementation before wallet-tracker depends on it.

### 1.5 Inventory table (claims / signing / refresh)

| Aspect | token-sniper-bot | token-safety-bot | wallet-tracker-pro |
|---|---|---|---|
| Access claims | userId, walletAddress, subscriptionTier, iat, exp | userId, walletAddress, subscriptionTier, iat, exp | none |
| Algorithm | HS256 (unpinned) | HS256 (unpinned) | n/a |
| Secret env | JWT_SECRET (default token-sniper-bot-dev-secret) | JWT_SECRET (default token-safety-bot-dev-secret) | n/a |
| Secret equality | per-bot default differs | per-bot default differs | n/a |
| Access TTL | 24h hardcoded (JWT_EXPIRES_IN ignored) | JWT_ACCESS_TTL ?? 1h | n/a |
| Refresh token | separate secret + minimal payload (no tier) | same secret + full payload (has tier) | n/a |
| Refresh TTL | 7d | 7d | n/a |
| iss / aud / jti / version | none | none | n/a |
| alg pin in verify | NO | NO | n/a |
| AuthUser shape | {id,walletAddress,subscriptionTier} | {id,walletAddress,subscriptionTier} | uses shared AuthUser {id,wallet,...} (scaffold) |

---

## 2. Compatibility Matrix by Bot / Consumer

Legend: L = legacy claim name (`userId`/`walletAddress`/`subscriptionTier`);
N = normalized (`sub`/`wallet`/`tier`). ✓ = consumes; — = not used.

| Consumer (file) | Reads user.id | Reads walletAddress | Reads subscriptionTier | JWT verify | Issues token | Notes |
|---|---|---|---|---|---|---|
| sniper src/middleware/auth.ts | ✓ | ✓ | ✓ | ✓ | ✓ | all tier gates + optionalAuth |
| sniper src/services/database.ts | — | ✓ | ✓ | (verify refresh) | ✓ | login + refresh re-mint |
| sniper src/index.ts routes | ✓ | — | —(via mid) | — | — | /users,/admin,/billing,/analyze,/alerts |
| sniper src/utils/billing.ts | (body userId) | — | (body tier) | — | — | tier from request body, not JWT |
| sniper tests/auth.test.ts | ✓ | ✓ | ✓ | ✓ | ✓ | asserts decoded legacy claims |
| safety src/middleware/auth.ts | ✓ | ✓ | ✓ | ✓ | — | verify-only middleware |
| safety src/services/database.ts + database-prisma.ts | — | ✓ | ✓ | ✓(refresh) | ✓ | createTokenPair login+refresh |
| safety src/middleware/scan-limit.ts | ✓ | — | ✓ | — | — | req.user.id + subscriptionTier |
| safety src/middleware/admin.ts | — | ✓ | — | — | — | wallet allowlist check |
| safety src/index.ts routes | ✓ | — | —(via mid) | — | — | /billing/checkout etc. |
| safety src/utils/billing.ts | (body userId) | — | (body tier) | — | — | tier from request body |
| safety tests/auth-middleware.test.ts | ✓ | ✓ | ✓ | ✓ | — | asserts dev-user legacy shape |
| shared/auth/wallet-auth.ts | ✓ | ✓(as `wallet`) | ✓ | stub | stub | prototype AuthUser uses `wallet` |
| shared/api/middleware.ts | ✓ | — | ✓ | stub | — | scaffold only |

Key: all authorization decisions ultimately read `req.user.{id,walletAddress,
subscriptionTier}`. The migration must keep that object populated identically regardless
of whether the underlying token used L or N claims, so downstream consumers do not change.

---

## 3. Recommended Target Contract

Normalized access-token payload (additive; backward-compatible superset where possible):

```
{
  // normalized (canonical) claims
  sub:            string,            // = legacy userId (authoritative user id)
  wallet:         string,            // = legacy walletAddress (Solana base58)
  tier:           'free'|'basic'|'pro'|'enterprise',  // = legacy subscriptionTier

  // hardening claims (recommended, opt-in per phase)
  iss:            'solanaideaslab',   // optional, must match if present
  aud:            <bot-audience>,     // optional, must match if present
  jti:            string,             // optional; enables revocation/observability
  tokenVersion:   1,                  // explicit migration marker (recommended)
  iat:            number,             // maintained
  exp:            number              // maintained
}
```

Refresh tokens: keep the bot-specific refresh mechanism, but standardize the payload to
carry the normalized triple plus a `type: 'refresh'` discriminator (sniper already has it;
safety must add it so refresh and access become distinguishable). Refresh secret handling
is unchanged (no value rotation — out of scope per hard boundaries).

`AuthenticatedUser` target (shared): `{ id, wallet, subscriptionTier, publicKey?,
createdAt?, lastActive? }` where `id = sub`, `wallet = wallet`, `subscriptionTier = tier`.
The middleware maps N→L names so every existing `req.user.walletAddress` /
`req.user.subscriptionTier` consumer keeps working with **zero changes**.

---

## 4. Token Versioning / Claim Precedence Decision

**Detection:** A token is "normalized" if it carries `sub` (and ideally `wallet`+`tier`).
A token is "legacy" if it carries `userId`. The presence of `tokenVersion` is advisory.

**Precedence (deterministic, enforced at parse time):**
1. Parse the token cryptographically first (`jwt.verify` with pinned
   `algorithms: ['HS256']` and secret). Reject on any verification failure (bad sig,
   expired, wrong alg, wrong secret).
2. If BOTH `sub` and `userId` are present:
   - If `sub === userId` AND `wallet === walletAddress` AND `tier === subscriptionTier`
     (when both present): treat as normalized; map.
   - If they **disagree on any authorization-relevant field** (id, wallet, or tier):
     **REJECT** the token (ambiguous/forged). Never merge conflicting values.
3. If only normalized claims present (`sub`/`wallet`/`tier`): use them.
4. If only legacy claims present (`userId`/`walletAddress`/`subscriptionTier`): map
   `userId→id`, `walletAddress→wallet`, `subscriptionTier→tier`.
5. If neither set is present, or the present set is missing `id`/`wallet`/`tier`
   (after mapping): **REJECT** (incomplete token).
6. `iss`/`aud`, when present in the token, MUST match configured values; mismatch → reject.
   When absent, accept (preserves legacy tokens that have no iss/aud).

This rule guarantees: no privilege escalation via claim injection, no silent downgrade,
and identical authorization outcome for a token that round-trips L↔N.

---

## 5. Phased Rollout Plan

### Phase 0 — Discovery baseline (this document)
- Inventory complete. No code changes. Establish test fixtures (legacy token samples,
  expected user objects) as the regression baseline.

### Phase 1 — Compatibility parser / mapping (dual-read, NO issuance change)
- Add a single shared `parseAuthToken(decoded): AuthenticatedUser` (in `shared/auth` or
  per-bot mirror) implementing §4 precedence.
- Wire `authMiddleware` in both bots to call the parser; the `req.user` object is
  unchanged (same field names), so consumers are untouched.
- Pin `algorithms: ['HS256']` in `jwt.verify`. Add `iss`/`aud` validation ONLY when the
  token carries them (non-breaking).
- Tests: legacy acceptance, normalized acceptance, dual-claim parity, conflicting-claim
  rejection, missing-claim rejection, wrong-algorithm rejection.
- **Exit gate (§10) must be met before Phase 2.**

### Phase 2 — Dual-read validation (observability)
- Ship Phase 1 to staging/prod behind no behavior change. Log which format each verified
  token used (`legacy` vs `normalized`) and precedence outcomes. Monitor for anomalies
  for >= 1 full refresh cycle (≥7d) to confirm no authorization gaps.
- No token-writing behavior changes yet.

### Phase 3 — Versioned issuance (optional dual-write or N-only issuance)
- Begin emitting tokens with normalized claims (`sub`/`wallet`/`tier`) AND keep legacy
  claims present too (dual-write) OR emit N-only once dual-read is proven.
  Recommendation: **dual-write** (both L and N present) during the transition so any
  not-yet-updated verifier still works; remove legacy claims only in Phase 7 after
  explicit approval.
- Add `tokenVersion: 1` and (optional) `iss`/`aud`/`jti`. Keep TTL behavior identical.
- For safety-bot refresh tokens: add `type: 'refresh'` discriminator so refresh ≠ access.
- For sniper: refresh re-mint already re-derives tier from DB — unaffected.

### Phase 4 — Consumer migration
- Switch `AuthenticatedUser`/`AuthenticatedRequest` to the normalized field names
  (`wallet` etc.) project-by-project, updating the parser mapping so `req.user.wallet`
  and `req.user.walletAddress` both resolve (deprecation alias) until Phase 7.
- Migrate billing/scan-limit/admin consumers to normalized names incrementally.
- `wallet-tracker-pro` adopts the shared (now-real) `AuthUser` only after `shared/` is
  promoted from scaffold — separate sub-task, not blocking.

### Phase 5 — Observability & verification
- Dashboards: % legacy vs normalized, rejection reasons, conflict-rejection count
  (should be ~0), expired, wrong-alg. Alert on any conflict-rejection spike.

### Phase 6 — Deprecation criteria
- Remove legacy-only issuance when: (a) ≤ X% (e.g. <1%) of daily verified tokens are
  legacy-format, sustained for ≥ refresh window; (b) no conflict-rejections; (c) all
  consumers migrated. **Requires your explicit approval (§11).**

### Phase 7 — Legacy support removal (ONLY after approval)
- Drop legacy claim mapping from the parser; reject tokens lacking normalized claims.
- Remove dual-write.

---

## 6. Detailed Rollback Plan

Guiding principle: **verification stays dual-read throughout the migration window; only
issuance is risky.** Rollback is therefore mostly about issuance.

- **Rollback of Phase 1 (parser/precedence):** revert to current `authMiddleware`. Legacy
  tokens and any already-issued dual-write tokens remain valid because legacy claims are
  still emitted by the last issuance code. No user is invalidated.
- **Rollback of Phase 3 (versioned/dual-write issuance):** revert issuer to legacy-only
  (`generateToken`/`createTokenPair` stop adding `sub`/`wallet`/`tier`). Because the
  verifier stayed dual-read (never removed), already-issued normalized/dual-write tokens
  continue to be accepted until their natural expiry (24h access / 7d refresh). No
  legitimate user is logged out by the rollback itself.
- **Critical constraint:** do NOT remove dual-read acceptance (Phase 7) until the maximum
  token lifetime of all in-flight tokens has elapsed. Removing acceptance before then
  would invalidate still-valid legacy/dual tokens → forced re-login. Phase 7 is gated.
- **Secret/key rollback:** none — secret sources are unchanged; no rotation.
- **DB rollback:** none — no schema change; mapping is in code.
- **Validation of rollback:** after reverting, replay the Phase 1 test matrix; all legacy
  fixtures must still pass.

---

## 7. Test Matrix (must all pass before any issuance change)

| # | Test | Expected |
|---|---|---|
| T1 | Legacy token accepted (sniper shape) | 200, req.user populated |
| T2 | Legacy token accepted (safety shape) | 200, req.user populated |
| T3 | Normalized token accepted (sub/wallet/tier) | 200, identical req.user to legacy equivalent |
| T4 | Dual-claim parity (L==N, consistent) | accepted, normalized values used |
| T5 | Dual-claim conflict (id mismatch) | 401 rejected |
| T6 | Dual-claim conflict (tier mismatch) | 401 rejected |
| T7 | Missing id | 401 rejected |
| T8 | Missing wallet | 401 rejected |
| T9 | Missing tier | 401 rejected |
| T10 | Expired token | 401 rejected |
| T11 | Tampered signature | 401 rejected |
| T12 | Wrong algorithm (`none`/RS*) | 401 rejected (alg pin) |
| T13 | Wrong secret | 401 rejected |
| T14 | Wrong iss (when iss enforced) | 401 rejected |
| T15 | Wrong aud (when aud enforced) | 401 rejected |
| T16 | Refresh compatibility (legacy refresh → new access) | re-mint works, tier from DB |
| T17 | Refresh compatibility (normalized refresh) | works |
| T18 | Authorization parity (premium/pro/enterprise/admin/scan-limit) | identical outcome L vs N |
| T19 | Rollback behavior (verifier dual-read after issuer revert) | legacy tokens still accepted |
| T20 | optionalAuthMiddleware silent fail-through | unchanged |
| T21 | dev bypass (skipAuthInDev) | unchanged enterprise identity |

---

## 8. Security Analysis

- **Algorithm confusion (HIGH, pre-existing):** both bots call `jwt.verify(token, secret)`
  without `algorithms: ['HS256']`. A token signed `alg: "none"` or an asymmetric alg
  could be accepted if the lib permitted it. jsonwebtoken v9 rejects `none` by default and
  requires a key for asymmetric, but the unpinned option is still a latent confusion risk.
  Fix as part of Phase 1 (hardening, non-breaking for valid tokens).
- **No iss/aud (MEDIUM):** tokens are not audience-scoped; a token minted by one bot
  (same `JWT_SECRET`) could be replayed against the other. Pinning per-bot `aud` is
  recommended but must be additive (accept tokens lacking aud during transition).
- **Long-lived refresh (MEDIUM):** 7d refresh, no `jti`/revocation list in sniper
  (safety has `blacklistedTokens`). Adding `jti` enables future revocation; not required
  for this migration.
- **Forgery / conflicting claims (addressed by §4):** dual-claim conflict → reject,
  no merge. Prevents claim-injection privilege escalation.
- **Tier integrity:** tier always sourced from the verified token (or DB on refresh),
  never from request body (billing uses body tier only to *create* a checkout session,
  not to authorize). Confirmed safe.
- **Secret exposure:** out of scope; no secret/key is read, printed, or rotated in this
  plan. Issuance changes use the existing secret source unchanged.

---

## 9. Concrete File-Level Implementation Checklist (future phases)

token-sniper-bot:
- [ ] src/middleware/auth.ts — add `parseAuthToken` precedence; pin `algorithms`;
  keep `AuthenticatedRequest.user` field names; `generateToken`/`generateRefreshToken`
  add normalized claims in Phase 3; add `type:'refresh'` already present.
- [ ] src/services/database.ts — issuance call sites use new token builder; refresh
  re-mint unchanged (tier from DB).
- [ ] src/config/environment.ts — NO secret value change; optionally add `jwt.aud`/
  `jwt.iss` config (additive).
- [ ] tests/auth.test.ts — extend with T3–T19.

token-safety-bot:
- [ ] src/middleware/auth.ts — use `parseAuthToken`; pin `algorithms`.
- [ ] src/types/auth.ts — evolve `AuthenticatedUser` to normalized names (with alias).
- [ ] src/services/database.ts + database-prisma.ts — `createTokenPair` add normalized
  claims + `type:'refresh'` discriminator; refresh verification unchanged secret.
- [ ] src/middleware/scan-limit.ts, admin.ts — switch to normalized field reads (alias
  keeps compatibility).
- [ ] tests/auth-middleware.test.ts — extend with T3–T19.

shared/:
- [ ] shared/auth/wallet-auth.ts — promote `AuthUser` + add real `parseAuthToken`/
  `verifyToken` (currently stub). This becomes the shared normalized parser.
- [ ] shared/api/middleware.ts — promote stub only if/when wallet-tracker adopts it.

wallet-tracker-pro:
- [ ] No runtime JWT today. Adopt shared (real) AuthUser in a later, separate milestone
  after `shared/` is promoted. Not blocking.

---

## 10. Release / Monitoring Criteria (gate before any token-WRITING change)

All must hold before Phase 3 (issuance) begins:
1. Phase 1 + Phase 2 shipped; dual-read verifier in prod ≥ 7 days (one full refresh cycle).
2. Test matrix T1–T21 green in CI on a clean isolated install.
3. Conflict-rejection count ≈ 0 in observability (no legitimate dual-claim conflicts).
4. Zero authorization-parity regressions (T18) across premium/pro/enterprise/admin/scan-limit.
5. `algorithms` pin verified to reject `none`/asymmetric (T12) without rejecting any
   production legacy token.
6. Rollback rehearsed: issuer reverted in staging, legacy fixtures still accepted (T19).
7. No DB migration performed; mapping confined to code.
8. Documentation (`docs/`) updated for new env vars (iss/aud) if added.

---

## 11. Unresolved Decisions Requiring Your Explicit Approval

1. **Dual-write vs N-only issuance in Phase 3.** Recommended: dual-write (both L+N
   present) for the transition window; remove legacy only in Phase 7.
2. **Per-bot `aud`/`iss` enforcement.** Recommend additive (accept tokens lacking them
   during transition; enforce only when present). Approve enabling `iss`/`aud` emission?
3. **Whether to add `jti`** for future revocation/observability now, or defer.
4. **Refactor safety-bot refresh to carry `type:'refresh'`** (currently structurally an
   access token) — changes refresh token shape; needs approval since it touches the
   refresh contract.
5. **Shared package ownership:** promote `shared/auth` from scaffold to the real home of
   `parseAuthToken` + `AuthUser`, consumed by both bots (currently each bot duplicates
   the parser). This is the cleanest path to a single contract but is a larger refactor.
6. **Phase 6 deprecation threshold** (e.g. <1% legacy tokens for ≥7d) and the explicit
   go/no-go to enter Phase 7 (legacy removal).

---

## 12. Repo-State Reconciliation (read-only, performed this session)

- Local `main` = fe90873; `origin/main` = e82f60f (15+ commits ahead; `git fetch`
  succeeded; **no fast-forward / checkout performed**).
- Working tree clean; no stashes; one worktree (main). No destructive commands run.
- Local branch `security/replay-safe-auth-billing` = f9b88fbe (independent of this work;
  equals local main, no ahead diff). Not modified.
- Relevant origin feature branches observed (not checked out):
  `feat/shared-wallet-auth-token-safety`, `feat/shared-schema-contract`,
  `feat/shared-schema-harness`, `feat/release-readiness-docs`,
  `feat/stripe-webhook-idempotency-review`. None alter the JWT claim *shape* beyond the
  shared-wallet-auth scaffold already reviewed; confirm before Phase 5 if any get merged.
- `AUTONOMOUS_PROGRESS.md` / `AUTONOMOUS_HANDOFF.md` did not exist at repo root; created
  by this session (untracked planning artifacts).
