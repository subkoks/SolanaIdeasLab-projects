// Invoked only by scripts/test-delivery-postgres.cjs, never by the ordinary suite.
// This file deliberately imports no application configuration or environment loader.
import assert from 'node:assert/strict'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { Client } from 'pg'
import type { PrismaClient as InstalledPrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  WalletDeliveryLedger, dispatchPendingDeliveries, MAX_INGESTION_MOVEMENTS,
  MAX_OUTSTANDING_DELIVERIES_PER_WATCH, DELIVERY_BATCH_SIZE,
} from '../src/services/wallet-delivery-ledger'
import { fixtureBase58, movement, wallet } from './helpers/wallet-delivery'
import { getWatchLimitForTier } from '../src/lib/watch-limits'

const fixtureDirectory = process.argv[2] ?? ''
const ciDatabaseUrl = process.env.WALLET_DELIVERY_CI_DATABASE_URL ?? ''
const fixtureMode = fixtureDirectory.length > 0
assert.ok(fixtureMode !== Boolean(ciDatabaseUrl), 'Select exactly one Wallet delivery database mode')

let connectionString: string
let packageDirectory: string
let generatedClient: string | undefined
if (fixtureMode) {
  assert.equal(dirname(fixtureDirectory), realpathSync('/tmp'))
  assert.match(basename(fixtureDirectory), /^wallet-delivery-fixture-[A-Za-z0-9]+$/)
  const directory = statSync(fixtureDirectory)
  assert.equal(directory.mode & 0o777, 0o700)
  assert.equal(directory.uid, process.getuid?.())
  const receipt = JSON.parse(readFileSync(join(fixtureDirectory, 'receipt.json'), 'utf8'))
  assert.equal(receipt.fixtureDirectory, fixtureDirectory)
  assert.equal(receipt.started, true)
  assert.equal(receipt.role, 'wallet_fixture')
  assert.equal(receipt.database, 'wallet_delivery_fixture')
  assert.equal(receipt.listenAddresses, '')
  assert.equal(receipt.socketDirectory, join(fixtureDirectory, 'socket'))
  connectionString = `postgresql://wallet_fixture@localhost:55439/wallet_delivery_fixture?host=${encodeURIComponent(receipt.socketDirectory)}`
  packageDirectory = receipt.packageDirectory
  generatedClient = receipt.generatedClient
  if (generatedClient) {
    assert.match(generatedClient, /^\/private\/tmp\/wallet-delivery-validation-[A-Za-z0-9]+\/generated$/)
  }
} else {
  const url = new URL(ciDatabaseUrl)
  assert.ok(url.protocol === 'postgres:' || url.protocol === 'postgresql:')
  assert.match(url.pathname, /\/wallet_delivery_ci$/)
  connectionString = ciDatabaseUrl
  packageDirectory = resolve(process.cwd())
}
const PrismaClient: typeof InstalledPrismaClient = require(generatedClient ?? '@prisma/client').PrismaClient
const pg = new Client({ connectionString, application_name: 'wallet_fixture_controller' })
const first = new PrismaClient({ adapter: new PrismaPg({ connectionString, application_name: 'wallet_fixture_first', max: 3 }) })
const second = new PrismaClient({ adapter: new PrismaPg({ connectionString, application_name: 'wallet_fixture_second', max: 3 }) })
const ledger = new WalletDeliveryLedger(first)
const competitor = new WalletDeliveryLedger(second)
assert.equal(packageDirectory, resolve(process.cwd()))
const baseline = readFileSync(join(packageDirectory, 'prisma/migrations/20260705230000_init/migration.sql'), 'utf8')
const tiers = readFileSync(join(packageDirectory, 'prisma/migrations/20260706100000_subscriber_tier/migration.sql'), 'utf8')
const notifications = readFileSync(join(packageDirectory, 'prisma/migrations/20261117030000_wallet_notification_outbox/migration.sql'), 'utf8')
const draft = readFileSync(join(packageDirectory, 'prisma/drafts/20261030010000_wallet_delivery_ledger.sql'), 'utf8')
const signature = (value: number) => fixtureBase58(value, 64)
const count = async (table: 'WalletActivityEvent' | 'WalletDelivery') => {
  // Only a fixed internal allowlist is interpolated; all data uses parameters.
  const query = table === 'WalletActivityEvent' ? 'SELECT COUNT(*)::integer AS count FROM "WalletActivityEvent"'
    : 'SELECT COUNT(*)::integer AS count FROM "WalletDelivery"'
  return (await pg.query<{ count: number }>(query)).rows[0]!.count
}
const events = () => pg.query('SELECT * FROM "WalletActivityEvent" ORDER BY "id"')
const deliveries = () => pg.query('SELECT * FROM "WalletDelivery" ORDER BY "id"')
const reset = async () => {
  await pg.query('DELETE FROM "WalletDelivery"; DELETE FROM "WalletActivityEvent"; DELETE FROM "WalletWatch"; DELETE FROM "TelegramSubscriber"')
}
const subscriber = async (id = 'subscriber-1', chatId = '101', tier = 'enterprise') => {
  await pg.query('INSERT INTO "TelegramSubscriber" ("id", "chatId", "tier", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)', [id, chatId, tier])
}
const setup = async () => {
  await reset()
  await subscriber()
  return ledger.addWatch('subscriber-1', wallet, 'Synthetic fixture')
}
const currentWatch = async () => (await ledger.listWatches())[0]!
const waitForLock = async (application: string) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    // pg_stat_activity caches a statistics snapshot inside the lock-holder's
    // transaction. Refresh it so the next queued connection is observable.
    await pg.query('SELECT pg_stat_clear_snapshot()')
    const rows = await pg.query('SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type=\'Lock\' AND state=\'active\'', [application])
    if (rows.rowCount) return
    await delay(10)
  }
  throw new Error(`Synthetic fixture lock was not reached: ${application}`)
}
const dispatchWithoutPacing = (
  store: Parameters<typeof dispatchPendingDeliveries>[0],
  notify: Parameters<typeof dispatchPendingDeliveries>[1],
) => dispatchPendingDeliveries(store, notify, {
  minChatIntervalMs: 0,
  chatLastSentAt: new Map(),
})

const main = async () => {
  await pg.connect()
  await first.$connect()
  await second.$connect()
  try {
    if (fixtureMode) {
      await test('fixture is PostgreSQL 16 on a private Unix socket with TCP disabled', async () => {
        assert.match((await pg.query('SELECT version()')).rows[0].version, /^PostgreSQL 16\./)
        assert.equal((await pg.query('SHOW listen_addresses')).rows[0].listen_addresses, '')
        assert.equal((await pg.query('SELECT inet_server_addr() AS address')).rows[0].address, null)
      })

      await test('target client production read paths remain compatible with baseline-only schema while disabled', async () => {
        const { DatabaseService } = require('../src/services/database') as typeof import('../src/services/database')
        const { WALLET_DELIVERY_SCHEMA_VERIFIED } = require('../src/lib/wallet-delivery-gate') as typeof import('../src/lib/wallet-delivery-gate')
        assert.equal(WALLET_DELIVERY_SCHEMA_VERIFIED, false)
        await pg.query(baseline)
        await pg.query(tiers)
        await subscriber('subscriber-1', '101', 'free')
        await pg.query('INSERT INTO "WalletWatch" ("id", "subscriberId", "walletAddress", "updatedAt") VALUES (\'baseline-watch\', \'subscriber-1\', $1, CURRENT_TIMESTAMP)', [wallet])
        await pg.query('INSERT INTO "WalletActivityEvent" ("id", "walletAddress", "signature", "direction", "lamports", "summary") VALUES (\'baseline-event\', $1, $2, \'in\', 12, \'Synthetic baseline activity\')', [wallet, signature(1)])
        const database = new DatabaseService(first)
        assert.deepEqual(await database.getSubscriberLimits('101'), { tier: 'free', limit: 3, used: 1, remaining: 2 })
        await database.upsertSubscriber('101', 'Synthetic fixture')
        await database.setSubscriberTier('101', 'pro')
        assert.equal((await database.getSubscriberLimits('101'))!.tier, 'pro')
        assert.equal((await database.getRecentActivity(wallet))[0]!.id, 'baseline-event')
        assert.equal((await database.listWatches('101'))[0]!.id, 'baseline-watch')
        assert.deepEqual(await database.getDashboardStats(), { subscribers: 1, watches: 1, events: 1 })
        assert.equal((await database.getAnalyticsOverview()).uniqueActiveWallets, 1)
        assert.equal((await database.getTopActiveWallets())[0]!.walletAddress, wallet)
        assert.equal((await database.getActivityBreakdown(wallet)).total, 1)
        assert.equal((await database.getActivityTimeline(wallet)).length, 1)
        assert.equal((await database.getWalletBehaviorSummary(wallet)).totalEvents, 1)
        assert.deepEqual(await database.getTokenMintBreakdown(wallet), [])
        assert.equal((await database.getWalletPortfolioSummary(wallet)).pricingMode, 'mock')
        await assert.rejects(database.addWatch('101', wallet), /disabled pending reviewed migration/)
        assert.equal((await pg.query('SELECT COUNT(*)::integer AS count FROM information_schema.columns WHERE table_schema=\'public\' AND column_name IN (\'revision\', \'movementKey\', \'identityVersion\')')).rows[0].count, 0)
        await pg.query('DELETE FROM "WalletActivityEvent"; DELETE FROM "WalletWatch"; DELETE FROM "TelegramSubscriber"')
      })

      await test('draft migration preserves every legacy ID and payload and enqueues no history', async () => {
        await pg.query(notifications)
        await pg.query(`INSERT INTO "WalletActivityEvent" ("id", "walletAddress", "signature", "direction", "lamports", "tokenMint", "summary", "observedAt")
          VALUES ('legacy-sol', $1, $2, 'out', -19, NULL, 'Original native payload', '2026-01-01T00:00:00'),
          ('legacy-spl', $1, $3, 'in', NULL, $4, NULL, '2026-01-02T00:00:00')`,
        [wallet, signature(1), signature(2), fixtureBase58(2, 32)])
        const before = (await pg.query('SELECT "id", "walletAddress", "signature", "direction", "lamports"::text, "tokenMint", "summary", "observedAt"::text FROM "WalletActivityEvent" ORDER BY "id"')).rows
        await pg.query(draft)
        const after = (await pg.query('SELECT "id", "walletAddress", "signature", "direction", "lamports"::text, "tokenMint", "summary", "observedAt"::text FROM "WalletActivityEvent" ORDER BY "id"')).rows
        assert.deepEqual(after, before)
        for (const row of (await events()).rows) {
          assert.equal(row.movementKey, `legacy:${row.id}`)
          assert.equal(row.identityVersion, 0)
        }
        assert.equal(await count('WalletDelivery'), 0)
        await subscriber()
        const watch = await ledger.addWatch('subscriber-1', wallet)
        await ledger.ingest(watch, [movement({ signature: signature(1) }),
          movement({ signature: signature(1), lamports: null, tokenMint: fixtureBase58(3, 32) }),
          movement({ signature: signature(3) })])
        assert.equal(await count('WalletActivityEvent'), 5)
        assert.equal(await count('WalletDelivery'), 3)
        assert.equal((await currentWatch()).lastSignature, signature(3))
      })
    }

    await test('migration failure rolls back schema, legacy payload, and old unique index atomically', async () => {
      await pg.query('CREATE SCHEMA rollback_fixture; SET search_path TO rollback_fixture')
      try {
        await pg.query(baseline)
        await pg.query(tiers)
        await pg.query(notifications)
        await pg.query('INSERT INTO "WalletActivityEvent" ("id", "walletAddress", "signature", "direction", "summary") VALUES ($1, $2, $3, $4, $5)', ['rollback-legacy', wallet, signature(9), 'unknown', 'Unchanged'])
        await pg.query('CREATE TABLE "WalletDelivery" ("sentinel" TEXT)')
        await assert.rejects(pg.query(draft), /already exists/)
        await pg.query('ROLLBACK')
        assert.equal((await pg.query('SELECT COUNT(*)::integer AS count FROM information_schema.columns WHERE table_schema=\'rollback_fixture\' AND column_name IN (\'movementKey\', \'identityVersion\', \'revision\')')).rows[0].count, 0)
        assert.equal((await pg.query('SELECT COUNT(*)::integer AS count FROM pg_indexes WHERE schemaname=\'rollback_fixture\' AND indexname=\'WalletActivityEvent_signature_key\'')).rows[0].count, 1)
        assert.deepEqual((await pg.query('SELECT "id", "summary" FROM "WalletActivityEvent"')).rows, [{ id: 'rollback-legacy', summary: 'Unchanged' }])
      } finally { await pg.query('SET search_path TO public') }
    })

    await test('same signature preserves each wallet, SOL movement, mint, subscriber, and immutable snapshot', async () => {
      const watch = await setup()
      await subscriber('subscriber-2', '202')
      const otherSubscriber = await ledger.addWatch('subscriber-2', wallet, 'Other label')
      const otherWallet = await ledger.addWatch('subscriber-1', fixtureBase58(2, 32))
      const movements = [movement(), movement({ lamports: null, tokenMint: fixtureBase58(3, 32) }),
        movement({ lamports: null, tokenMint: fixtureBase58(4, 32) })]
      assert.equal(await ledger.ingest(watch, movements), 'ingested')
      assert.equal(await ledger.ingest(otherSubscriber, movements), 'ingested')
      assert.equal(await ledger.ingest(otherWallet, movements), 'ingested')
      assert.equal(await count('WalletActivityEvent'), 6)
      assert.equal(await count('WalletDelivery'), 9)
      const snapshots = (await deliveries()).rows
      assert.equal(new Set(snapshots.map((row) => row.id)).size, 9)
      assert.equal(snapshots.filter((row) => row.chatId === '202').length, 3)
      assert.ok(snapshots.filter((row) => row.chatId === '202').every((row) => row.message.includes('[Other label]')))
      assert.equal(await ledger.ingest(watch, movements), 'stale')
      assert.deepEqual((await deliveries()).rows, snapshots)
    })

    await test('behavior summary normalizes signed outflows without changing legacy rows', async () => {
      const watch = await setup()
      await ledger.ingest(watch, [movement({
        signature: signature(6),
        direction: 'out',
        lamports: BigInt(-5),
        summary: 'Synthetic SOL out',
      })])
      await pg.query(`INSERT INTO "WalletActivityEvent"
        ("id", "walletAddress", "signature", "movementKey", "direction", "lamports", "summary")
        VALUES ('legacy-out', $1, $2, 'legacy:legacy-out', 'out', 3, 'Legacy SOL out')`,
      [wallet, signature(7)])
      const { DatabaseService } = require('../src/services/database') as typeof import('../src/services/database')
      const database = new DatabaseService(first)
      const summary = await database.getWalletBehaviorSummary(wallet)
      assert.equal(summary.outCount, 2)
      assert.equal(summary.avgOutLamports, '4')
      assert.equal(summary.netLamports, '-8')
    })

    await test('recent activity uses persisted order when observation timestamps tie', async () => {
      await setup()
      const observedAt = '2026-01-01T00:00:00.000Z'
      await pg.query(`INSERT INTO "WalletActivityEvent"
        ("id", "walletAddress", "signature", "movementKey", "identityVersion",
          "direction", "summary", "transactionOrder", "observedAt")
        VALUES
          ('order-two', $1, $2, 'sol', 1, 'in', 'Second', 2, $4),
          ('order-zero', $1, $3, 'sol', 1, 'in', 'First', 0, $4),
          ('order-one', $1, $5, 'sol', 1, 'in', 'Middle', 1, $4)`,
      [wallet, signature(20), signature(21), observedAt, signature(22)])
      const { DatabaseService } = require('../src/services/database') as typeof import('../src/services/database')
      const database = new DatabaseService(first)
      const recent = await database.getRecentActivity(wallet, 3)
      assert.deepEqual(recent.map((row) => row.id), [
        'order-two',
        'order-one',
        'order-zero',
      ])
    })

    await test('verified history with no movements advances only the current cursor', async () => {
      const watch = await setup()
      const next = signature(8)
      assert.equal(await ledger.ingest(watch, [], next), 'ingested')
      assert.equal(await ledger.ingest(watch, [], signature(9)), 'stale')
      const [updated] = await ledger.listWatches()
      assert.equal(updated?.lastSignature, next)
      assert.equal(await count('WalletActivityEvent'), 0)
      assert.equal(await count('WalletDelivery'), 0)
    })

    await test('matching duplicates are idempotent, conflicting payload rolls back every new row and cursor', async () => {
      const watch = await setup()
      await ledger.ingest(watch, [movement(), movement()])
      assert.equal(await count('WalletActivityEvent'), 1)
      assert.equal(await count('WalletDelivery'), 1)
      const before = await currentWatch()
      await subscriber('subscriber-2', '202')
      const other = await ledger.addWatch('subscriber-2', wallet)
      await assert.rejects(ledger.ingest(other, [movement({ signature: signature(2) }), movement({ summary: 'Conflicting payload' })]), /conflicting-movement/)
      assert.equal(await count('WalletActivityEvent'), 1)
      assert.equal(await count('WalletDelivery'), 1)
      assert.equal((await ledger.listWatches()).find((row) => row.id === other.id)!.lastSignature, null)
      assert.equal((await ledger.listWatches()).find((row) => row.id === before.id)!.lastSignature, before.lastSignature)
    })

    for (const changed of ['cursor', 'revision', 'wallet', 'subscriber', 'chat', 'subscriber-inactive', 'watch-inactive'] as const) {
      await test(`stale ${changed} snapshot makes zero activity, delivery, or cursor writes`, async () => {
        const watch = await setup()
        if (changed === 'cursor') watch.lastSignature = signature(9)
        if (changed === 'revision') watch.revision++
        if (changed === 'wallet') watch.walletAddress = fixtureBase58(2, 32)
        if (changed === 'subscriber') watch.subscriber.id = 'nonexistent-subscriber'
        if (changed === 'chat') await pg.query('UPDATE "TelegramSubscriber" SET "chatId"=\'202\' WHERE "id"=\'subscriber-1\'')
        if (changed === 'subscriber-inactive') await pg.query('UPDATE "TelegramSubscriber" SET "active"=false WHERE "id"=\'subscriber-1\'')
        if (changed === 'watch-inactive') await pg.query('UPDATE "WalletWatch" SET "active"=false WHERE "id"=$1', [watch.id])
        assert.equal(await ledger.ingest(watch, [movement()]), 'stale')
        assert.equal(await count('WalletActivityEvent'), 0)
        assert.equal(await count('WalletDelivery'), 0)
        assert.equal((await pg.query('SELECT "lastSignature" FROM "WalletWatch" WHERE "id"=$1', [watch.id])).rows[0].lastSignature, null)
      })
    }

    await test('cursor write failure rolls back both activity and delivery inserts', async () => {
      const watch = await setup()
      await pg.query(`CREATE FUNCTION fixture_reject_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-cursor-write-failed'; END $$;
        CREATE TRIGGER fixture_cursor_failure BEFORE UPDATE OF "lastSignature" ON "WalletWatch" FOR EACH ROW EXECUTE FUNCTION fixture_reject_cursor()`)
      try {
        await assert.rejects(ledger.ingest(watch, [movement()]), /fixture-cursor-write-failed/)
        assert.equal(await count('WalletActivityEvent'), 0)
        assert.equal(await count('WalletDelivery'), 0)
        assert.equal((await currentWatch()).lastSignature, null)
      } finally { await pg.query('DROP TRIGGER fixture_cursor_failure ON "WalletWatch"; DROP FUNCTION fixture_reject_cursor()') }
    })

    await test('two concurrent ingesters commit exactly one cursor transition and one delivery', async () => {
      const watch = await setup()
      const outcomes = await Promise.all([ledger.ingest(watch, [movement()]), competitor.ingest(watch, [movement()])])
      assert.deepEqual(outcomes.sort(), ['ingested', 'stale'])
      assert.equal(await count('WalletActivityEvent'), 1)
      assert.equal(await count('WalletDelivery'), 1)
      assert.equal((await currentWatch()).lastSignature, signature(1))
    })

    await test('legacy notifications suppress replay for their watch without suppressing missing activity', async () => {
      const otherWalletWatch = await setup()
      const watchedWallet = fixtureBase58(2, 32)
      const watch = await ledger.addWatch(otherWalletWatch.subscriber.id, watchedWallet)
      const signatures = [signature(2), signature(3), signature(4)]
      await pg.query(
        `INSERT INTO "WalletActivityEvent" ("id", "walletAddress", "signature", "direction", "movementKey", "identityVersion")
         VALUES ('old-delivered', $1, $2, 'unknown', 'legacy:old-delivered', 0),
           ('old-claimed', $1, $3, 'unknown', 'legacy:old-claimed', 0),
           ('old-pending', $1, $4, 'unknown', 'legacy:old-pending', 0)`,
        [otherWalletWatch.walletAddress, ...signatures],
      )
      await pg.query(
        `INSERT INTO "WalletNotification" ("id", "watchId", "signature", "message", "deliveredAt", "claimedAt", "claimToken")
         VALUES ('sent', $1, $2, 'Sent fixture', CURRENT_TIMESTAMP, NULL, NULL),
           ('claimed', $1, $3, 'Claimed fixture', NULL, CURRENT_TIMESTAMP, 'fixture-claim'),
           ('pending', $1, $4, 'Pending fixture', NULL, NULL, NULL)`,
        [watch.id, ...signatures],
      )
      const fresh = signature(5)
      const batch = [...signatures, fresh].map((value) => movement({ signature: value }))
      assert.equal(await ledger.ingest(watch, batch), 'ingested')
      const activity = (await events()).rows.filter((event) => event.walletAddress === watchedWallet)
      assert.deepEqual(activity.map((event) => event.signature).sort(), [...signatures, fresh].sort())
      assert.deepEqual((await deliveries()).rows.map((delivery) => delivery.signature), [fresh])
      assert.equal((await ledger.listWatches()).find((item) => item.id === watch.id)?.lastSignature, fresh)
    })

    await test('legacy history suppresses only the watch that owns its notification', async () => {
      const first = await setup()
      await subscriber('subscriber-2', '202')
      const second = await ledger.addWatch('subscriber-2', wallet)
      const signatureValue = signature(7)
      await pg.query(
        `INSERT INTO "WalletActivityEvent"
          ("id", "walletAddress", "signature", "direction", "movementKey", "identityVersion")
         VALUES ('shared-legacy', $1, $2, 'unknown', 'legacy:shared-legacy', 0)`,
        [wallet, signatureValue],
      )
      await pg.query(
        `INSERT INTO "WalletNotification"
          ("id", "watchId", "signature", "message", "deliveredAt")
         VALUES ('shared-sent', $1, $2, 'Already delivered', CURRENT_TIMESTAMP)`,
        [first.id, signatureValue],
      )
      const batch = [movement({ signature: signatureValue })]
      assert.equal(await ledger.ingest(first, batch), 'ingested')
      assert.equal(await ledger.ingest(second, batch), 'ingested')
      const rows = (await deliveries()).rows
      assert.equal(rows.length, 1)
      assert.equal(rows[0]!.watchId, second.id)
      assert.equal(rows[0]!.signature, signatureValue)
    })

    await test('two independent claimers grant exactly one permanent dispatch claim', async () => {
      const watch = await setup()
      await ledger.ingest(watch, [movement()])
      const id = (await ledger.listPendingIds())[0]!
      const claims = await Promise.all([ledger.claim(id), competitor.claim(id)])
      assert.equal(claims.filter(Boolean).length, 1)
      const claim = claims.find((row) => row !== null)!
      assert.equal(await ledger.claim(id), null)
      assert.equal(await ledger.markSent({ ...claim, claimToken: 'wrong-token' }, { messageId: '42' }), false)
      assert.equal(await ledger.markSent(claim, { messageId: '42' }), true)
      assert.equal(await ledger.claim(id), null)
      assert.equal((await deliveries()).rows[0].status, 'sent')
    })

    await test('explicit Telegram rate limits become delayed pending work', async () => {
      const watch = await setup()
      await ledger.ingest(watch, [movement()])
      const id = (await ledger.listPendingIds())[0]!
      const claim = (await ledger.claim(id))!
      await ledger.markRateLimited(claim, 50)
      assert.equal((await ledger.listPendingIds()).length, 0)
      assert.equal((await deliveries()).rows[0].status, 'pending')
      assert.equal((await deliveries()).rows[0].failureCode, 'telegram-rate-limited')
      await delay(60)
      assert.deepEqual(await ledger.listPendingIds(), [id])
      assert.ok(await ledger.claim(id))
    })

    await test('dispatch preserves input transaction order when timestamps tie', async () => {
      const watch = await setup()
      const orderedSignatures = [signature(11), signature(12), signature(13)]
      await ledger.ingest(watch, orderedSignatures.map((value) => movement({
        signature: value,
      })))
      const messages: string[] = []
      for (const id of await ledger.listPendingIds()) {
        const claim = await ledger.claim(id)
        assert.ok(claim)
        messages.push(claim.message)
      }
      assert.deepEqual(
        messages.map((message) => orderedSignatures.find((value) => message.includes(value))),
        orderedSignatures,
      )
    })

    await test('watch mutations preserve outstanding legacy notification records for reconciliation', async () => {
      const watch = await setup()
      await pg.query(
        `INSERT INTO "WalletNotification" ("id", "watchId", "signature", "message", "claimedAt", "claimToken")
         VALUES ('legacy-pending', $1, $2, 'Pending fixture', NULL, NULL),
           ('legacy-claimed', $1, $3, 'Claimed fixture', CURRENT_TIMESTAMP, 'fixture-claim')`,
        [watch.id, signature(8), signature(9)],
      )
      const readLegacy = () => pg.query(
        'SELECT * FROM "WalletNotification" WHERE "watchId" = $1 ORDER BY "id"', [watch.id],
      )
      const before = (await readLegacy()).rows
      await ledger.addWatch(watch.subscriber.id, wallet, 'Changed fixture label')
      assert.equal((await ledger.removeWatch(watch.subscriber.id, wallet)).count, 1)
      assert.deepEqual((await readLegacy()).rows, before)
    })

    await test('a label-only edit keeps already-enqueued delivery snapshots eligible', async () => {
      const watch = await setup()
      await ledger.ingest(watch, [movement()])
      const id = (await ledger.listPendingIds())[0]!
      const relabeled = await ledger.addWatch(
        watch.subscriber.id,
        wallet,
        'Changed fixture label',
      )
      assert.equal(relabeled.revision, watch.revision)
      const claim = await ledger.claim(id)
      assert.ok(claim)
      assert.match(claim.message, /^\[Synthetic fixture\]/)
    })

    await test('unwatch preserves audited claims, cancels pending only, and re-watch preserves cursor without replay', async () => {
      const watch = await setup()
      await ledger.ingest(watch, [1, 2, 3, 4].map((value) => movement({ signature: signature(value) })))
      const ids = await ledger.listPendingIds()
      const sent = (await ledger.claim(ids[0]!))!
      const uncertain = (await ledger.claim(ids[1]!))!
      const dispatching = (await ledger.claim(ids[2]!))!
      await ledger.markSent(sent, { messageId: '42' })
      await ledger.markUncertain(uncertain, 'send-or-ack-failed')
      assert.deepEqual(await ledger.removeWatch('subscriber-1', wallet), { count: 1 })
      assert.equal(await ledger.isClaimCurrent(dispatching), false)
      assert.deepEqual((await deliveries()).rows.map((row) => row.status).sort(), ['cancelled', 'dispatching', 'sent', 'uncertain'])
      await assert.rejects(pg.query('DELETE FROM "WalletWatch" WHERE "id"=$1', [watch.id]), /foreign key constraint/)
      await assert.rejects(pg.query('DELETE FROM "WalletActivityEvent"'), /foreign key constraint/)
      const resumed = await ledger.addWatch('subscriber-1', wallet)
      assert.equal(resumed.id, watch.id)
      assert.equal(resumed.lastSignature, signature(4))
      assert.equal(resumed.revision, watch.revision + 2)
      assert.equal(await ledger.ingest(watch, [movement({ signature: signature(5) })]), 'stale')
      assert.equal(await ledger.ingest(resumed, [movement({ signature: signature(5) })]), 'ingested')
      assert.equal((await ledger.listPendingIds()).length, 1)
      assert.equal(await count('WalletDelivery'), 5)
    })

    await test('repeated watch at its tier capacity is idempotent, and concurrent additions respect the limit', async () => {
      await reset()
      await subscriber('subscriber-1', '101', 'free')
      const limit = getWatchLimitForTier('free')
      for (let index = 1; index < limit; index++) await ledger.addWatch('subscriber-1', fixtureBase58(index, 32))
      const results = await Promise.allSettled([ledger.addWatch('subscriber-1', fixtureBase58(8, 32)), competitor.addWatch('subscriber-1', fixtureBase58(9, 32))])
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
      const existing = (await ledger.listWatches()).find((row) => row.walletAddress === wallet)!
      assert.equal((await ledger.addWatch('subscriber-1', wallet)).revision, existing.revision)
      assert.equal((await ledger.listWatches()).length, limit)
    })

    await test('unwatch queued first commits successfully and a competing claim cannot send', async () => {
      const watch = await setup()
      await ledger.ingest(watch, [movement()])
      const id = (await ledger.listPendingIds())[0]!
      await pg.query('BEGIN; SELECT "id" FROM "TelegramSubscriber" WHERE "id"=\'subscriber-1\' FOR UPDATE')
      let removal!: ReturnType<WalletDeliveryLedger['removeWatch']>
      let claim!: ReturnType<WalletDeliveryLedger['claim']>
      try {
        removal = ledger.removeWatch('subscriber-1', wallet)
        void removal.catch(() => {})
        await waitForLock('wallet_fixture_first')
        claim = competitor.claim(id)
        void claim.catch(() => {})
        await waitForLock('wallet_fixture_second')
      } finally {
        await pg.query('COMMIT')
        await Promise.allSettled([removal, claim].filter(Boolean))
      }
      assert.deepEqual(await removal, { count: 1 })
      assert.equal(await claim, null)
      let sends = 0
      await dispatchWithoutPacing(competitor, async () => { sends++; return { messageId: '42' } })
      assert.equal(sends, 0)
      assert.equal((await deliveries()).rows[0].status, 'cancelled')
    })

    await test('claim queued first and competing unwatch both finish without deadlock; changed claim remains held', async () => {
      const watch = await setup()
      await ledger.ingest(watch, [movement()])
      const id = (await ledger.listPendingIds())[0]!
      await pg.query('BEGIN; SELECT "id" FROM "TelegramSubscriber" WHERE "id"=\'subscriber-1\' FOR UPDATE')
      let claim!: ReturnType<WalletDeliveryLedger['claim']>
      let removal!: ReturnType<WalletDeliveryLedger['removeWatch']>
      try {
        claim = competitor.claim(id)
        void claim.catch(() => {})
        await waitForLock('wallet_fixture_second')
        removal = ledger.removeWatch('subscriber-1', wallet)
        void removal.catch(() => {})
        await waitForLock('wallet_fixture_first')
      } finally {
        await pg.query('COMMIT')
        await Promise.allSettled([removal, claim].filter(Boolean))
      }
      const claimed = (await claim)!
      assert.ok(claimed)
      assert.deepEqual(await removal, { count: 1 })
      assert.equal(await competitor.isClaimCurrent(claimed), false)
      await competitor.markUncertain(claimed, 'watch-changed')
      assert.equal((await deliveries()).rows[0].status, 'uncertain')
      assert.equal(await competitor.claim(id), null)
    })

    await test('rejected or lost sends, stale claims, and lost DB ACKs never replay automatically', async () => {
      for (const failure of ['rejected-send', 'lost-db-ack'] as const) {
        const watch = await setup()
        await ledger.ingest(watch, [movement()])
        let sends = 0
        const store = failure === 'lost-db-ack' ? {
          listPendingIds: () => ledger.listPendingIds(), claim: (id: string) => ledger.claim(id),
          isClaimCurrent: (claim: Parameters<WalletDeliveryLedger['isClaimCurrent']>[0]) => ledger.isClaimCurrent(claim),
          markSent: async () => { throw new Error('Synthetic lost DB ACK') },
          markUncertain: (claim: Parameters<WalletDeliveryLedger['markUncertain']>[0], reason: Parameters<WalletDeliveryLedger['markUncertain']>[1]) => ledger.markUncertain(claim, reason),
          markRateLimited: (claim: Parameters<WalletDeliveryLedger['markRateLimited']>[0], retryAfterMs: number) => ledger.markRateLimited(claim, retryAfterMs),
          recoverInterruptedClaims: () => ledger.recoverInterruptedClaims(),
        } : ledger
        const notify = async () => { sends++; if (failure === 'rejected-send') throw new Error('Synthetic send rejection'); return { messageId: '42' } }
        await dispatchWithoutPacing(store, notify)
        await dispatchWithoutPacing(store, notify)
        assert.equal(sends, 1)
        assert.equal((await deliveries()).rows[0].status, 'uncertain')
      }
      const watch = await setup()
      await ledger.ingest(watch, [movement(), movement({ signature: signature(2) })])
      const ids = await ledger.listPendingIds()
      await ledger.claim(ids[0]!)
      await ledger.claim(ids[1]!)
      await pg.query('UPDATE "WalletDelivery" SET "claimedAt"=CURRENT_TIMESTAMP - INTERVAL \'11 minutes\' WHERE "id"=$1', [ids[0]])
      await competitor.recoverInterruptedClaims()
      assert.deepEqual(await ledger.getHoldCounts(), { uncertain: 1, dispatching: 1 })
      assert.equal((await ledger.listPendingIds()).length, 0)
      assert.equal(await ledger.claim(ids[0]!), null)
      assert.equal(await ledger.claim(ids[1]!), null)
    })

    await test('dispatch reads a bounded batch and drains the remainder without new ingestion', async () => {
      const watch = await setup()
      await ledger.ingest(watch, Array.from({ length: DELIVERY_BATCH_SIZE + 1 }, (_, index) => movement({ signature: signature(index + 1) })))
      let sends = 0
      const notify = async () => ({ messageId: String(++sends) })
      await dispatchWithoutPacing(ledger, notify)
      assert.equal(sends, DELIVERY_BATCH_SIZE)
      assert.equal((await ledger.listPendingIds()).length, 1)
      await dispatchWithoutPacing(ledger, notify)
      assert.equal(sends, DELIVERY_BATCH_SIZE + 1)
      assert.equal((await ledger.listPendingIds()).length, 0)
    })

    await test('outstanding capacity is exact, transactional under competing ingests, and includes uncertain claims', async () => {
      let watch = await setup()
      for (let offset = 0; offset < MAX_OUTSTANDING_DELIVERIES_PER_WATCH - 1; offset += MAX_INGESTION_MOVEMENTS) {
        const size = Math.min(MAX_INGESTION_MOVEMENTS, MAX_OUTSTANDING_DELIVERIES_PER_WATCH - 1 - offset)
        await ledger.ingest(watch, Array.from({ length: size }, (_, index) => movement({ signature: signature(offset + index + 1) })))
        watch = await currentWatch()
      }
      const outcomes = await Promise.all([ledger.ingest(watch, [movement({ signature: signature(5001) })]),
        competitor.ingest(watch, [movement({ signature: signature(5002) })])])
      assert.deepEqual(outcomes.sort(), ['ingested', 'stale'])
      assert.equal(await count('WalletDelivery'), MAX_OUTSTANDING_DELIVERIES_PER_WATCH)
      const before = await currentWatch()
      await assert.rejects(ledger.ingest(before, [movement({ signature: signature(6001) })]), /delivery-capacity/)
      assert.equal(await count('WalletActivityEvent'), MAX_OUTSTANDING_DELIVERIES_PER_WATCH)
      assert.equal((await currentWatch()).lastSignature, before.lastSignature)
      const ids = await ledger.listPendingIds()
      const held = (await ledger.claim(ids[0]!))!
      await ledger.markUncertain(held, 'send-or-ack-failed')
      const inFlight = (await ledger.claim(ids[1]!))!
      await assert.rejects(ledger.ingest(before, [movement({ signature: signature(6001) })]), /delivery-capacity/)
      await ledger.markSent(inFlight, { messageId: '42' })
      assert.equal(await ledger.ingest(before, [movement({ signature: signature(6001) })]), 'ingested')
      assert.equal(await count('WalletDelivery'), MAX_OUTSTANDING_DELIVERIES_PER_WATCH + 1)
      assert.deepEqual(await ledger.getHoldCounts(), { uncertain: 1, dispatching: 0 })
    })
  } finally {
    await first.$disconnect()
    await second.$disconnect()
    await pg.end()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
