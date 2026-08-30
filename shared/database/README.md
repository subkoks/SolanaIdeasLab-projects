# Shared database schema — contract & test harness

This directory ships `schemas.sql`, a **template** DDL for SolanaIdeasLab
projects (users, subscriptions, api_keys, audit_logs). It is a reference
template, not a migration that runs against a live database. Each consumer
(token-safety-bot, token-sniper-bot, wallet-tracker-pro) keeps its own Prisma
schema; `schemas.sql` is the canonical contract those schemas and the shared
`SubscriptionTier` type should stay aligned with.

## Local schema harness (`tests/database-schema.test.ts`)

A **local-only** validation + smoke-test harness. No real database, no
credentials, no network, no migrations, no production data.

### What it validates (STATIC layer)
- The four core tables exist (`users`, `subscriptions`, `api_keys`, `audit_logs`).
- Column types / nullability:
  - `users.wallet_address` `VARCHAR(44) UNIQUE NOT NULL`
  - `users.email` `VARCHAR(255)` (nullable)
  - `users.subscription_tier` `VARCHAR(20)` with the
    `('free','basic','pro','enterprise')` CHECK and `DEFAULT 'free'`
  - `subscriptions.tier` `VARCHAR(20) NOT NULL` with the **same** CHECK enum
    (aligned with the `SubscriptionTier` type — see below)
  - `subscriptions.status` `VARCHAR(20) DEFAULT 'active'` with
    `('active','cancelled','expired')` CHECK
  - `api_keys.key_hash` `VARCHAR(64) UNIQUE NOT NULL`
- Foreign keys:
  - `subscriptions.user_id` → `users(id)` **ON DELETE CASCADE**
  - `api_keys.user_id` → `users(id)` **ON DELETE CASCADE**
  - `audit_logs.user_id` → `users(id)` **ON DELETE SET NULL**
- Performance indexes (`idx_users_wallet_address`, `idx_users_subscription_tier`,
  `idx_subscriptions_user_id`, `idx_subscriptions_status`, `idx_api_keys_user_id`,
  `idx_audit_logs_user_id`, `idx_audit_logs_created_at`).
- RLS is **ENABLED** on all four tables, and the RLS policies are present.

### What it validates (EXEC layer)
The DDL is executed in an in-memory Postgres (`pg-mem`, a pure-JS devDependency)
so real behavior is checked, not just text:
- a valid user insert succeeds with `subscription_tier` defaulting to `'free'`
  and `email` nullable and `created_at` populated;
- an invalid `users.subscription_tier` is rejected by the CHECK;
- a duplicate `wallet_address` is rejected by the UNIQUE constraint;
- `subscriptions` rows **cascade-delete** with their user;
- an invalid `subscriptions.tier` is rejected by the CHECK enum;
- `api_keys.key_hash` must be unique;
- `audit_logs.user_id` is **nulled (not deleted)** when its user is removed
  (verifies the SET NULL contract distinct from the subscriptions CASCADE).

### What it deliberately CANNOT validate (no Supabase `auth.uid()` context)
- **RLS enforcement / row-visibility behavior.** The shipped policies use
  Supabase's `auth.uid()` helper, which does not exist in vanilla Postgres or
  in `pg-mem`. The harness therefore:
  - **strips** the `CREATE POLICY ...;` and `ALTER TABLE ... ENABLE ROW LEVEL
    SECURITY` statements before executing the DDL in-memory, and
  - asserts the policies are *present* in the shipped text (so a regression that
    deletes a policy is caught),
  but it does **not** execute or assert the row-level filtering they enforce.
- **Runtime behavior of `auth.uid()`** (e.g., that a user only sees their own
  rows) is out of scope here.

### How to run RLS enforcement tests later (when a compatible context exists)
Do **not** fake `auth.uid()` behavior. When a genuine local Supabase-compatible
test environment is available (a real Supabase local dev stack, or Postgres
with the `auth.uid()` helper defined to read the current JWT/`role`), add a
separate `tests/rls-enforcement.test.ts` that:
1. Creates a test role / JWT representing a specific `wallet_address`.
2. Defines `auth.uid()` as that identity (via the platform's real mechanism).
3. Inserts rows for two distinct users and asserts `SELECT` only returns the
   calling user's rows for `users`, `subscriptions`, `api_keys`, `audit_logs`.
4. Asserts `UPDATE`/`DELETE` are scoped identically.

Until that environment exists, RLS *presence* is covered by this harness and RLS
*enforcement* is intentionally left unverified (per repo policy: no fake RLS
claims without a real auth context).

## Contract alignment rules
- `subscription_tier` / `subscriptions.tier` values are the single enum
  `'free' | 'basic' | 'pro' | 'enterprise'` (mirrored by the shared
  `SubscriptionTier` type). Any change to the enum must update the SQL CHECK,
  the type, and every consumer Prisma `subscriptionTier`/`tier` field together.
- `wallet_address` is a base58 Solana public key (≤ 44 chars) and maps to the
  shared `AuthUser.wallet` / `AuthUser.id` and the consumer `walletAddress`.
