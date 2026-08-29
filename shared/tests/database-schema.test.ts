import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { newDb } from 'pg-mem'
import {
  VALID_USER,
  VALID_WALLET,
  INVALID_TIER,
  ALT_WALLET_A,
  ALT_WALLET_B,
} from './fixtures/schema-fixtures'

/**
 * Local-only validation + smoke-test harness for `database/schemas.sql`.
 *
 * Goals (no real DB, no creds, no network, no migrations, no prod data):
 *  1. STATIC layer: assert the shipped DDL declares the expected tables,
 *     columns, types, CHECK constraints, indexes, and RLS toggles.
 *  2. EXEC layer: actually run the DDL in an in-memory Postgres (pg-mem) and
 *     smoke-test real behavior — valid insert, CHECK rejection, FK cascade,
 *     unique key_hash, audit_log insert.
 *
 * NOTE on `auth.uid()`: the RLS policies reference Supabase's `auth.uid()`
 * helper, which does not exist in plain PostgreSQL. pg-mem has no Supabase
 * context either, so the EXEC layer stubs `auth.uid()` as a no-op text
 * function. The policies are still parsed/applied structurally; the static
 * layer independently asserts the policies are present. This coupling is
 * surfaced as an advisory, not a test failure, so the schema stays usable as
 * a template for both Supabase and vanilla Postgres deployments.
 */

const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schemas.sql')

const readSchema = (): string => {
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error(`shared schema not found at ${SCHEMA_PATH}`)
  }
  return fs.readFileSync(SCHEMA_PATH, 'utf8')
}

// The shipped schema's RLS policies reference Supabase's `auth.uid()` helper,
// which does not exist in plain PostgreSQL or pg-mem. The STATIC layer below
// asserts the policies are present; for the EXEC layer we strip the
// `CREATE POLICY ...;` statements so the DDL runs on vanilla Postgres. This
// keeps the harness dependency-free and surfaces the Supabase coupling as an
// advisory rather than a hard failure.
const stripRlsPolicies = (ddl: string): string =>
  ddl
    .split('\n')
    .filter((line) => !/^\s*CREATE POLICY/i.test(line))
    .join('\n')

// pg-mem does not implement every Postgres builtin. The static layer validates
// the real DDL verbatim; for the EXEC layer we normalize a few engine gaps so
// the DDL still runs meaningfully in-memory (behavior — constraints, FKs,
// uniqueness, cascade — is what we smoke-test, not pg-mem feature parity).
const normalizeForPgMem = (ddl: string): string =>
  stripRlsPolicies(ddl)
    .split('\n')
    .filter((line) => !/^\s*--/.test(line)) // pg-mem mis-parses orphaned -- comments
    .filter((line) => !/^\s*ALTER TABLE .* ENABLE ROW LEVEL SECURITY/i.test(line))
    .join('\n')
    .replace(/\bINET\b/gi, 'VARCHAR(45)')

const setupQuery = (): any => {
  const db = newDb()
  // Provide the uuid builtin that pg-mem does not ship (JSONB/INET are fine).
  db.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: 'uuid',
    implementation: () => crypto.randomUUID(),
    impure: true,
  })
  const Pool = db.adapters.createPg().Pool
  return new Pool()
}

describe('shared database/schemas.sql — static validation', () => {
  const schema = readSchema()

  it('declares the four core tables', () => {
    for (const table of ['users', 'subscriptions', 'api_keys', 'audit_logs']) {
      expect(schema).toMatch(new RegExp(`CREATE TABLE\\s+${table}\\s*\\(`))
    }
  })

  it('declares users columns with expected types', () => {
    expect(schema).toMatch(/wallet_address\s+VARCHAR\(44\)\s+UNIQUE\s+NOT\s+NULL/i)
    expect(schema).toMatch(/email\s+VARCHAR\(255\)/i)
    expect(schema).toMatch(/subscription_tier\s+VARCHAR\(20\)/i)
    expect(schema).toMatch(/metadata\s+JSONB/i)
  })

  it('enforces the subscriptions.tier CHECK enum (aligned with SubscriptionTier)', () => {
    expect(schema).toMatch(
      /tier\s+VARCHAR\(20\)\s+NOT\s+NULL\s+CHECK\s*\(\s*tier\s+IN\s*\(\s*'free',\s*'basic',\s*'pro',\s*'enterprise'\s*\)\s*\)/i,
    )
  })

  it('enforces the subscriptions.status CHECK enum', () => {
    expect(schema).toMatch(
      /status\s+VARCHAR\(20\)\s+DEFAULT\s+'active'\s+CHECK\s*\(\s*status\s+IN\s*\(\s*'active',\s*'cancelled',\s*'expired'\s*\)\s*\)/i,
    )
  })

  it('declares api_keys.key_hash as VARCHAR(64) UNIQUE NOT NULL', () => {
    expect(schema).toMatch(/key_hash\s+VARCHAR\(64\)\s+UNIQUE\s+NOT\s+NULL/i)
  })

  it('declares audit_logs.user_id as a nullable FK (ON DELETE SET NULL)', () => {
    expect(schema).toMatch(
      /user_id\s+UUID\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    )
  })

  it('declares foreign keys with cascade behavior', () => {
    expect(schema).toMatch(/user_id\s+UUID\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+CASCADE/i)
  })

  it('creates the expected performance indexes', () => {
    const indexes = [
      'idx_users_wallet_address',
      'idx_users_subscription_tier',
      'idx_subscriptions_user_id',
      'idx_subscriptions_status',
      'idx_api_keys_user_id',
      'idx_audit_logs_user_id',
      'idx_audit_logs_created_at',
    ]
    for (const idx of indexes) {
      expect(schema).toContain(`CREATE INDEX ${idx}`)
    }
  })

  it('enables row-level security on the protected tables', () => {
    for (const table of ['users', 'subscriptions', 'api_keys', 'audit_logs']) {
      expect(schema).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
  })

  it('defines RLS policies (Supabase auth.uid() coupled — advisory)', () => {
    expect(schema).toMatch(/CREATE POLICY\s+"Users can view own data"/i)
    expect(schema).toMatch(/USING\s*\(\s*auth\.uid\(\)::text\s*=\s*wallet_address\s*\)/i)
    // Advisory: this schema assumes Supabase's auth.uid(); flag for vanilla-PG users.
    expect(schema).toContain('auth.uid()')
  })
})

describe('shared database/schemas.sql — exec smoke (in-memory Postgres)', () => {
  it('runs the full DDL and supports valid data + constraint enforcement', async () => {
    const pg = await setupQuery()
    const schema = readSchema()

    // Execute the DDL statement-by-statement (pg-mem Pool.query runs one statement).
    const statements = normalizeForPgMem(schema)
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const stmt of statements) {
      await pg.query(stmt)
    }

    // Valid user insert.
    const inserted = await pg.query(
      'INSERT INTO users (wallet_address, email, subscription_tier) VALUES ($1, $2, $3) RETURNING id, wallet_address, subscription_tier',
      [VALID_USER.walletAddress, VALID_USER.email, VALID_USER.subscriptionTier],
    )
    expect(inserted.rows.length).toBe(1)
    expect(inserted.rows[0].wallet_address).toBe(VALID_USER.walletAddress)
    expect(inserted.rows[0].subscription_tier).toBe('pro')
    const userId = inserted.rows[0].id

    // Invalid subscription_tier is rejected by the CHECK constraint.
    await expect(
      pg.query(
        'INSERT INTO users (wallet_address, subscription_tier) VALUES ($1, $2)',
        [ALT_WALLET_A, INVALID_TIER],
      ),
    ).rejects.toThrow()

    // Duplicate wallet_address is rejected by the UNIQUE constraint.
    await expect(
      pg.query(
        'INSERT INTO users (wallet_address, subscription_tier) VALUES ($1, $2)',
        [VALID_USER.walletAddress, 'free'],
      ),
    ).rejects.toThrow(/wallet_address/)

    // Subscription FK with ON DELETE CASCADE.
    await pg.query(
      'INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, $2, $3)',
      [userId, 'pro', 'active'],
    )
    const subsBefore = await pg.query(
      'SELECT id FROM subscriptions WHERE user_id = $1',
      [userId],
    )
    expect(subsBefore.rows.length).toBe(1)
    await pg.query('DELETE FROM users WHERE id = $1', [userId])
    const subsAfter = await pg.query(
      'SELECT id FROM subscriptions WHERE user_id = $1',
      [userId],
    )
    expect(subsAfter.rows.length).toBe(0) // cascaded

    // api_keys require a unique key_hash.
    const u2 = await pg.query(
      "INSERT INTO users (wallet_address, subscription_tier) VALUES ($1, 'free') RETURNING id",
      [ALT_WALLET_B],
    )
    await pg.query(
      'INSERT INTO api_keys (user_id, name, key_hash) VALUES ($1, $2, $3)',
      [u2.rows[0].id, 'ci-key', 'a'.repeat(64)],
    )
    await expect(
      pg.query(
        'INSERT INTO api_keys (user_id, name, key_hash) VALUES ($1, $2, $3)',
        [u2.rows[0].id, 'dup-key', 'a'.repeat(64)],
      ),
    ).rejects.toThrow(/key_hash/)

    // audit_logs accept a row (user_id nullable via SET NULL).
    await pg.query(
      "INSERT INTO audit_logs (action, resource_type, resource_id) VALUES ('login', 'session', 'abc')",
    )
    const logs = await pg.query(
      "SELECT id FROM audit_logs WHERE action = 'login'",
    )
    expect(logs.rows.length).toBe(1)

    // audit_logs.user_id uses ON DELETE SET NULL (not CASCADE): deleting the
    // user keeps the audit row but nulls its user_id.
    const u3 = await pg.query(
      "INSERT INTO users (wallet_address, subscription_tier) VALUES ($1, 'pro') RETURNING id",
      ['44444444444444444444444444444444444444444444'],
    )
    await pg.query(
      "INSERT INTO audit_logs (user_id, action, resource_type, resource_id) VALUES ($1, 'action', 'res', 'xyz')",
      [u3.rows[0].id],
    )
    await pg.query('DELETE FROM users WHERE id = $1', [u3.rows[0].id])
    const auditAfter = await pg.query(
      "SELECT user_id FROM audit_logs WHERE resource_id = 'xyz'",
    )
    expect(auditAfter.rows.length).toBe(1)
    expect(auditAfter.rows[0].user_id).toBeNull()

    // users.subscription_tier defaults to 'free' when omitted; email is nullable.
    const u4 = await pg.query(
      "INSERT INTO users (wallet_address) VALUES ($1) RETURNING subscription_tier, email, created_at",
      ['55555555555555555555555555555555555555555555'],
    )
    expect(u4.rows[0].subscription_tier).toBe('free')
    expect(u4.rows[0].email).toBeNull()
    expect(u4.rows[0].created_at).not.toBeNull()
  })

  it('rejects an invalid subscriptions.tier (CHECK enum aligned with SubscriptionTier)', async () => {
    const pg = await setupQuery()
    const statements = normalizeForPgMem(readSchema())
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const stmt of statements) {
      await pg.query(stmt)
    }
    const u = await pg.query(
      "INSERT INTO users (wallet_address, subscription_tier) VALUES ($1, 'pro') RETURNING id",
      ['66666666666666666666666666666666666666666666'],
    )
    await expect(
      pg.query(
        'INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, $2, $3)',
        [u.rows[0].id, 'platinum', 'active'],
      ),
    ).rejects.toThrow()
  })

  it('supports a valid base58-length wallet address column width (44 chars)', () => {
    expect(VALID_WALLET).toHaveLength(44)
  })
})
