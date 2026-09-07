# Dependency Remediation Assessment (read-only) — 2026-09-03
Status: ASSESSMENT ONLY. No merges performed. No package/lockfile/code changes.
No second approval granted; this is the assessment, not authorization to merge.

## Advisory reach (verified via npm ls, no package/lockfile edits)

| Package | Affected packages (verified) | Reachability | Dependabot fix (unmerged) |
|---|---|---|---|
| fast-uri 3.0.0-3.1.5 (GHSA-5jgf-p345-68v8 / 4 related) | token-safety-bot (3.1.5), token-sniper-bot (3.1.5); wallet-tracker (3.1.6 — out of range) | Transitive via @prisma/streams-local → ajv (dev-time / build; not runtime txn path) | #235 (sniper), #236 (safety), #237 (tracker → isolated 3.1.7) |
| mysql2 <=3.23.0 (GHSA-3f6p-5ww8-9rcr / 2 related) | token-safety-bot: mysql2@3.15.3 via prisma | Runtime DB connection only (prisma); no web-facing exposure | None isolated; only covered by broad PR #232/#234 groups |

## Key observations
- `npm audit --omit=dev --audit-level=high` fails with endpoint error (400 Bad Request at pkgs.safetycli.com / npm mirror endpoint) — this is the CI "security-check" failure mechanism, separate from advisory resolution.
- Related Dependabot PRs #232-#234 are open but deliberately unmerged; they are potential remediation candidates, not a completed fix.
- PR #232 (#233, #234) broad "npm-minor-patch" group is over-inclusive (would bump unrelated packages; PR notes `audit fix --force` proposes `prisma@6.19.3` which is breaking vs current `prisma@7.9.1`).
- Isolated PR #235/#236 (fast-uri 3.1.7) is non-breaking and lowest-risk candidate for manual approval; PR #237 for wallet-tracker may be redundant (already at 3.1.6).
- No mysql2 isolated bump PR exists; any mysql2 fix requires the broad group or manual resolution.

## Hard-boundary confirmation
- No @solana/web3.js change (remains ^1.95.0).
- No uuid version change (9.0.1 advisory non-actionable; non-reachable via @solana/web3.js).
- No PR #231 change; feature branch `feat/jwt-phase1-safety-bot-dual-read` untouched.
- No Dependabot PR merged or modified.
- No source/test/CI/manifest/lockfile/system/config changed.

## Next approval gate (before any merge action)
Requires second explicit user approval. Once granted, lowest-risk sequence:
1. Approve isolated fast-uri bumps (#235, #236) only — non-breaking.
2. Evaluate mysql2 separately; do NOT approve broad group #232/#233/#234 without explicit acceptance of `prisma` bump risk.
3. Confirm `npm audit` endpoint recovery post-merge.
