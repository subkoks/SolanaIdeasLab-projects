# AUTONOMOUS_PROGRESS.md — SolanaIdeasLab-projects

Convention: untracked planning artifact at repo root. Updated at session end.

## Session: 2026-08-30 — JWT Token-Shape Migration (READ-ONLY / PLANNING-ONLY)

### Repo state reconciled (no branch changes, no destructive commands)
- Local `main` = fe90873; `origin/main` = e82f60f (15+ commits ahead; fetch only).
- Working tree clean, no stashes, one worktree (main).
- Local `security/replay-safe-auth-billing` = f9b88fbe (independent; equals local main).

### Milestone outcome
- Completed full read-only discovery of the JWT token lifecycle across both issuing bots
  and all consumers. Deliverable: `JWT_MIGRATION_PLAN.md` (root).
- **Key findings:**
  - token-sniper-bot and token-safety-bot have DIVERGENT JWT contracts:
    secret defaults differ, access TTL differs (24h hardcoded vs 1h env), refresh-token
    shape differs (sniper: separate secret + minimal payload; safety: same secret + full
    payload), and authorization middleware sets differ (sniper has premium/pro/enterprise/
    optional/rate-limit; safety has scan-limit/admin only).
  - Neither bot pins `algorithms` in `jwt.verify`, and neither sets `iss`/`aud`/`jti`/
    `tokenVersion` or uses `sub`. Pre-existing algorithm-confusion exposure.
  - `shared/` (`wallet-auth.ts`, `api/middleware.ts`) is a SCAFFOLD and NOT in the
    production path; `shared/auth/wallet-auth.ts` already prototypes a normalized `AuthUser`
    using `wallet` (the target name). `wallet-tracker-pro` does not verify JWTs in runtime.
- **Recommended strategy:** versioned normalized issuance (`sub`/`wallet`/`tier`) +
  dual-read acceptance with deterministic claim precedence and conflict rejection.
  No DB migration needed (mapping is in code). Rollback = revert issuer only; verifier
  stays dual-read so in-flight tokens remain valid until natural expiry.

### Next milestone (blocked on approval — see JWT_MIGRATION_PLAN.md §11)
- Phase 1 (compatibility parser + alg pin) requires explicit approval of the 6 open
  decisions. No implementation performed this session (planning-only).

### Hard boundaries honored
- No source/tests/config/lockfile/schema/branch/GitHub changes.
- No secrets, keys, or credentials read or revealed.
- No external services, RPC, wallets, or transactions.
