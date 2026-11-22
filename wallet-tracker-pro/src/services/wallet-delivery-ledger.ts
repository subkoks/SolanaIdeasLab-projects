import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { WalletMovement } from './solana-watcher'
import { getWatchLimitForTier } from '../lib/watch-limits'

export const MAX_INGESTION_MOVEMENTS = 1000
export const MAX_OUTSTANDING_DELIVERIES_PER_WATCH = 2 * MAX_INGESTION_MOVEMENTS
export const DELIVERY_BATCH_SIZE = 50
export const DELIVERY_ACK_TIMEOUT_MS = 15_000
const STALE_CLAIM_MS = 10 * 60 * 1000
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export interface DeliveryWatch {
  id: string
  walletAddress: string
  lastSignature: string | null
  revision: number
  label: string | null
  subscriber: { id: string; chatId: string }
}

interface WatchRow {
  id: string
  walletAddress: string
  lastSignature: string | null
  revision: number
  label: string | null
  subscriberId: string
  chatId: string
}

export interface DeliveryClaim {
  id: string
  claimToken: string
  chatId: string
  message: string
}

export interface DeliveryReceipt { messageId: string }

export interface PreparedMovement extends WalletMovement {
  movementKey: string
  activityId: string
}

export class WalletIngestionError extends Error {
  constructor(public readonly code: 'invalid-batch' | 'conflicting-movement' | 'cursor-update-failed' | 'delivery-capacity') {
    super(`Wallet ingestion held: ${code}`)
    this.name = 'WalletIngestionError'
  }
}

const isBase58Bytes = (value: unknown, length: number, maxText: number): value is string => {
  if (typeof value !== 'string' || value.length < length || value.length > maxText) return false
  let integer = BigInt(0)
  for (const character of value) {
    const digit = BASE58.indexOf(character)
    if (digit < 0) return false
    integer = integer * BigInt(58) + BigInt(digit)
  }
  let bytes = 0
  while (integer > BigInt(0)) { bytes++; integer >>= BigInt(8) }
  for (const character of value) { if (character !== '1') break; bytes++ }
  return bytes === length
}

const identityId = (prefix: string, parts: Array<string>): string =>
  `${prefix}_${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`

export const prepareMovements = (
  walletAddress: string,
  movements: ReadonlyArray<WalletMovement>,
): Array<PreparedMovement> => {
  if (!isBase58Bytes(walletAddress, 32, 44) || !Array.isArray(movements) ||
    movements.length < 1 || movements.length > MAX_INGESTION_MOVEMENTS) {
    throw new WalletIngestionError('invalid-batch')
  }
  const unique = new Map<string, PreparedMovement>()
  for (const movement of movements) {
    if (!movement || !isBase58Bytes(movement.signature, 64, 88) ||
      typeof movement.summary !== 'string' || movement.summary.length < 1 || movement.summary.length > 1024) {
      throw new WalletIngestionError('invalid-batch')
    }
    let movementKey: string
    if (movement.tokenMint !== undefined) {
      if (!isBase58Bytes(movement.tokenMint, 32, 44) || movement.lamports !== null ||
        !['in', 'out'].includes(movement.direction)) throw new WalletIngestionError('invalid-batch')
      movementKey = `spl:${movement.tokenMint}`
    } else if (movement.lamports !== null) {
      if (typeof movement.lamports !== 'bigint' || movement.lamports === BigInt(0) ||
        movement.lamports < -(BigInt(2) ** BigInt(63)) || movement.lamports >= BigInt(2) ** BigInt(63) ||
        movement.direction !== (movement.lamports > BigInt(0) ? 'in' : 'out')) {
        throw new WalletIngestionError('invalid-batch')
      }
      movementKey = 'sol'
    } else {
      if (movement.direction !== 'unknown') throw new WalletIngestionError('invalid-batch')
      movementKey = 'unknown'
    }
    const key = JSON.stringify([movement.signature, movementKey])
    const previous = unique.get(key)
    if (previous && (previous.direction !== movement.direction || previous.lamports !== movement.lamports ||
      previous.tokenMint !== movement.tokenMint || previous.summary !== movement.summary)) {
      throw new WalletIngestionError('conflicting-movement')
    }
    unique.set(key, {
      ...movement,
      movementKey,
      activityId: identityId('wa1', [walletAddress, movement.signature, movementKey]),
    })
  }
  return Array.from(unique.values())
}

const boundedLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1 || limit > DELIVERY_BATCH_SIZE) {
    throw new WalletIngestionError('invalid-batch')
  }
  return limit
}

// Uses tagged parameters and v7 Prisma transaction APIs. No generated client refresh
// or database connection is needed to prepare/test this not-yet-activated schema.
export class WalletDeliveryLedger {
  constructor(private readonly prisma: PrismaClient) {}

  public async addWatch(subscriberId: string, walletAddress: string, label?: string): Promise<DeliveryWatch> {
    if (!subscriberId || !isBase58Bytes(walletAddress, 32, 44) ||
      (label !== undefined && (typeof label !== 'string' || label.length > 256))) {
      throw new WalletIngestionError('invalid-batch')
    }
    return this.prisma.$transaction(async (tx) => {
      // Every mutation/claim locks subscriber, then watch, then deliveries.
      const subscribers = await tx.$queryRaw<Array<{ id: string; chatId: string; tier: string }>>`
        SELECT "id", "chatId", "tier" FROM "TelegramSubscriber"
        WHERE "id" = ${subscriberId} AND "active" FOR UPDATE`
      const subscriber = subscribers[0]
      if (!subscriber) throw new WalletIngestionError('invalid-batch')
      const existing = await tx.$queryRaw<Array<WatchRow & { active: boolean }>>`
        SELECT "id", "walletAddress", "lastSignature", "revision", "label", "subscriberId", "active"
        FROM "WalletWatch" WHERE "subscriberId" = ${subscriberId} AND "walletAddress" = ${walletAddress}
        FOR UPDATE`
      const previous = existing[0]
      const nextLabel = label ?? previous?.label ?? null
      if (!previous?.active) {
        const counts = await tx.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::integer AS "count" FROM "WalletWatch" WHERE "subscriberId" = ${subscriberId} AND "active"`
        const limit = getWatchLimitForTier(subscriber.tier)
        if (counts[0]!.count >= limit) throw new Error(`Watch limit reached (${limit} on ${subscriber.tier} tier)`)
      }
      const changed = previous && (!previous.active || previous.label !== nextLabel)
      const rows = await tx.$queryRaw<Array<WatchRow>>`
        INSERT INTO "WalletWatch" ("id", "subscriberId", "walletAddress", "label", "updatedAt")
        VALUES (${`ww1_${randomUUID()}`}, ${subscriberId}, ${walletAddress}, ${nextLabel}, CURRENT_TIMESTAMP)
        ON CONFLICT ("subscriberId", "walletAddress") DO UPDATE SET
          "label" = EXCLUDED."label", "active" = true,
          "lastSignature" = "WalletWatch"."lastSignature",
          "revision" = "WalletWatch"."revision" + ${changed ? 1 : 0}, "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "id", "walletAddress", "lastSignature", "revision", "label", "subscriberId"`
      const watch = rows[0]!
      if (changed) {
        await tx.$executeRaw`
          UPDATE "WalletDelivery" SET "status" = 'cancelled', "failureCode" = 'watch-changed', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "watchId" = ${watch.id} AND "status" = 'pending'`
      }
      return { id: watch.id, walletAddress: watch.walletAddress, lastSignature: watch.lastSignature,
        revision: watch.revision, label: watch.label, subscriber: { id: subscriber.id, chatId: subscriber.chatId } }
    })
  }

  public async listWatches(afterId = '', limit = DELIVERY_BATCH_SIZE): Promise<Array<DeliveryWatch>> {
    const rows = await this.prisma.$queryRaw<Array<WatchRow>>`
      SELECT w."id", w."walletAddress", w."lastSignature", w."revision", w."label",
        w."subscriberId", s."chatId"
      FROM "WalletWatch" w JOIN "TelegramSubscriber" s ON s."id" = w."subscriberId"
      WHERE w."active" AND s."active" AND w."id" > ${afterId}
      ORDER BY w."id" ASC LIMIT ${boundedLimit(limit)}`
    return rows.map(({ subscriberId, chatId, ...watch }) => ({
      ...watch, subscriber: { id: subscriberId, chatId },
    }))
  }

  public async ingest(
    watch: DeliveryWatch,
    movements: ReadonlyArray<WalletMovement>,
    cursor?: string | null,
  ): Promise<'ingested' | 'stale'> {
    const prepared = movements.length === 0
      ? []
      : prepareMovements(watch.walletAddress, movements)
    const nextCursor = cursor === undefined
      ? movements[movements.length - 1]?.signature ?? null
      : cursor
    if (!watch.id || !watch.subscriber.id || !Number.isSafeInteger(watch.revision) || watch.revision < 0 ||
      (watch.lastSignature !== null && !isBase58Bytes(watch.lastSignature, 64, 88)) ||
      !isBase58Bytes(nextCursor, 64, 88) ||
      prepared.some((movement) => movement.signature === watch.lastSignature)) {
      throw new WalletIngestionError('invalid-batch')
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock + compare before any write. A stale reader, unwatch/re-watch or changed
      // subscriber cannot advance this cursor or enqueue a stale notification.
      const subscribers = await tx.$queryRaw<Array<{ chatId: string }>>`
        SELECT "chatId" FROM "TelegramSubscriber" WHERE "id" = ${watch.subscriber.id}
          AND "chatId" = ${watch.subscriber.chatId} AND "active" FOR UPDATE`
      if (!subscribers.length) return 'stale'
      const locked = await tx.$queryRaw<Array<WatchRow>>`
        SELECT "id", "walletAddress", "lastSignature", "revision", "label", "subscriberId"
        FROM "WalletWatch" WHERE "id" = ${watch.id} AND "walletAddress" = ${watch.walletAddress}
          AND "subscriberId" = ${watch.subscriber.id} AND "revision" = ${watch.revision}
          AND "lastSignature" IS NOT DISTINCT FROM ${watch.lastSignature}::text AND "active" FOR UPDATE`
      const current = locked[0]
      if (!current) return 'stale'

      if (prepared.length > 0) {
        const values = Prisma.join(prepared.map((movement) => Prisma.sql`(
          ${movement.activityId}::text, ${watch.walletAddress}::text, ${movement.signature}::text,
          ${movement.movementKey}::text, ${movement.direction}::text, ${movement.lamports}::bigint,
          ${movement.tokenMint ?? null}::text, ${movement.summary}::text)`))
        // The legacy outbox deduplicated per watch even when its activity row
        // belonged to another wallet. Preserve that delivery history separately.
        const noLegacyNotification = Prisma.sql`NOT EXISTS (
          SELECT 1 FROM "WalletNotification" n WHERE n."watchId" = ${watch.id}
            AND n."signature" = v."signature"
        )`
        const capacity = await tx.$queryRaw<Array<{ outstanding: number; incoming: number }>>(Prisma.sql`
          SELECT (SELECT COUNT(*)::integer FROM "WalletDelivery" WHERE "watchId" = ${watch.id}
            AND "status" IN ('pending', 'dispatching', 'uncertain')) AS "outstanding",
            COUNT(*)::integer AS "incoming" FROM (VALUES ${values}) v
              ("id", "walletAddress", "signature", "movementKey", "direction", "lamports", "tokenMint", "summary")
          WHERE NOT EXISTS (SELECT 1 FROM "WalletActivityEvent" legacy WHERE legacy."walletAddress" = v."walletAddress"
            AND legacy."signature" = v."signature" AND legacy."identityVersion" = 0)
            AND ${noLegacyNotification}
            AND NOT EXISTS (SELECT 1 FROM "WalletDelivery" d WHERE d."watchId" = ${watch.id}
              AND d."signature" = v."signature" AND d."movementKey" = v."movementKey")`)
        if (capacity[0]!.outstanding + capacity[0]!.incoming > MAX_OUTSTANDING_DELIVERIES_PER_WATCH) {
          throw new WalletIngestionError('delivery-capacity')
        }

        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "WalletActivityEvent"
            ("id", "walletAddress", "signature", "movementKey", "direction", "lamports", "tokenMint", "summary", "identityVersion")
          SELECT v.*, 1 FROM (VALUES ${values}) v
            ("id", "walletAddress", "signature", "movementKey", "direction", "lamports", "tokenMint", "summary")
          WHERE NOT EXISTS (SELECT 1 FROM "WalletActivityEvent" legacy
            WHERE legacy."walletAddress" = v."walletAddress" AND legacy."signature" = v."signature"
              AND legacy."identityVersion" = 0)
          ON CONFLICT ("walletAddress", "signature", "movementKey") DO NOTHING`)

        // DO NOTHING is idempotent only if the immutable movement payload agrees.
        const conflicts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT a."id" FROM "WalletActivityEvent" a JOIN (VALUES ${values}) v
            ("id", "walletAddress", "signature", "movementKey", "direction", "lamports", "tokenMint", "summary")
            ON a."walletAddress" = v."walletAddress" AND a."signature" = v."signature" AND a."movementKey" = v."movementKey"
          WHERE a."identityVersion" = 1 AND (a."direction" IS DISTINCT FROM v."direction"
            OR a."lamports" IS DISTINCT FROM v."lamports" OR a."tokenMint" IS DISTINCT FROM v."tokenMint"
            OR a."summary" IS DISTINCT FROM v."summary") LIMIT 1`)
        if (conflicts.length) throw new WalletIngestionError('conflicting-movement')

        const deliveries = Prisma.join(prepared.map((movement) => {
          const label = current.label ? `[${current.label.slice(0, 256).replace(/[\r\n]/g, ' ')}] ` : ''
          const message = [`${label}Wallet activity`, `Wallet: ${watch.walletAddress}`,
            movement.summary, `Signature: ${movement.signature}`].join('\n')
          return Prisma.sql`(${identityId('wd1', [watch.id, movement.signature, movement.movementKey])}::text,
            ${movement.signature}::text, ${movement.movementKey}::text, ${message}::text)`
        }))
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "WalletDelivery" ("id", "watchId", "watchRevision", "activityId", "signature", "movementKey", "chatId", "message")
          SELECT v."id", ${watch.id}, ${watch.revision}, a."id", v."signature", v."movementKey", ${subscribers[0]!.chatId}, v."message"
          FROM (VALUES ${deliveries}) v ("id", "signature", "movementKey", "message")
          JOIN "WalletActivityEvent" a ON a."walletAddress" = ${watch.walletAddress}
            AND a."signature" = v."signature" AND a."movementKey" = v."movementKey" AND a."identityVersion" = 1
          WHERE NOT EXISTS (SELECT 1 FROM "WalletActivityEvent" legacy
            WHERE legacy."walletAddress" = a."walletAddress" AND legacy."signature" = a."signature" AND legacy."identityVersion" = 0)
            AND ${noLegacyNotification}
          ON CONFLICT ("watchId", "signature", "movementKey") DO NOTHING`)
      }
      const updated = await tx.$executeRaw`
        UPDATE "WalletWatch" SET "lastSignature" = ${nextCursor}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${watch.id}`
      if (updated !== 1) throw new WalletIngestionError('cursor-update-failed')
      return 'ingested'
    }, { maxWait: 5000, timeout: 15000 })
  }

  public async removeWatch(subscriberId: string, walletAddress: string): Promise<{ count: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "TelegramSubscriber" WHERE "id" = ${subscriberId} FOR UPDATE`
      const watches = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "WalletWatch" SET "active" = false, "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "subscriberId" = ${subscriberId} AND "walletAddress" = ${walletAddress} AND "active"
        RETURNING "id"`
      for (const watch of watches) {
        await tx.$executeRaw`
          UPDATE "WalletDelivery" SET "status" = 'cancelled', "failureCode" = 'watch-stopped', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "watchId" = ${watch.id} AND "status" = 'pending'`
      }
      return { count: watches.length }
    })
  }

  public async listPendingIds(limit = DELIVERY_BATCH_SIZE): Promise<Array<string>> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "WalletDelivery" WHERE "status" = 'pending'
      ORDER BY "createdAt" ASC, "id" ASC LIMIT ${boundedLimit(limit)}`
    return rows.map((row) => row.id)
  }

  public async claim(id: string): Promise<DeliveryClaim | null> {
    const claimToken = randomUUID()
    return this.prisma.$transaction(async (tx) => {
      const owners = await tx.$queryRaw<Array<{ watchId: string; subscriberId: string }>>`
        SELECT d."watchId", w."subscriberId" FROM "WalletDelivery" d
        JOIN "WalletWatch" w ON w."id" = d."watchId" WHERE d."id" = ${id} AND d."status" = 'pending'`
      const owner = owners[0]
      if (!owner) return null
      const subscribers = await tx.$queryRaw<Array<{ chatId: string; active: boolean }>>`
        SELECT "chatId", "active" FROM "TelegramSubscriber" WHERE "id" = ${owner.subscriberId} FOR SHARE`
      const watches = await tx.$queryRaw<Array<{ revision: number; active: boolean }>>`
        SELECT "revision", "active" FROM "WalletWatch" WHERE "id" = ${owner.watchId}
          AND "subscriberId" = ${owner.subscriberId} FOR SHARE`
      const rows = await tx.$queryRaw<Array<{ id: string; watchId: string; watchRevision: number; chatId: string; message: string }>>`
        SELECT "id", "watchId", "watchRevision", "chatId", "message" FROM "WalletDelivery"
        WHERE "id" = ${id} AND "status" = 'pending' FOR UPDATE`
      const delivery = rows[0]
      if (!delivery) return null
      const subscriber = subscribers[0]
      const watch = watches[0]
      if (!watch?.active || !subscriber?.active || watch.revision !== delivery.watchRevision ||
        subscriber.chatId !== delivery.chatId || owner.watchId !== delivery.watchId) {
        await tx.$executeRaw`
          UPDATE "WalletDelivery" SET "status" = 'cancelled', "failureCode" = 'watch-inactive-or-changed', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${id} AND "status" = 'pending'`
        return null
      }
      const claimed = await tx.$executeRaw`
        UPDATE "WalletDelivery" SET "status" = 'dispatching', "claimToken" = ${claimToken},
          "claimedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id} AND "status" = 'pending'`
      if (claimed !== 1) return null
      return { id, claimToken, chatId: delivery.chatId, message: delivery.message }
    })
  }

  public async isClaimCurrent(claim: DeliveryClaim): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT d."id" FROM "WalletDelivery" d JOIN "WalletWatch" w ON w."id" = d."watchId"
      JOIN "TelegramSubscriber" s ON s."id" = w."subscriberId"
      WHERE d."id" = ${claim.id} AND d."claimToken" = ${claim.claimToken} AND d."status" = 'dispatching'
        AND w."active" AND s."active" AND w."revision" = d."watchRevision" AND s."chatId" = d."chatId"`
    return rows.length === 1
  }

  public async markSent(claim: DeliveryClaim, receipt: DeliveryReceipt): Promise<boolean> {
    if (!/^[1-9][0-9]{0,19}$/.test(receipt.messageId)) throw new WalletIngestionError('invalid-batch')
    return (await this.prisma.$executeRaw`
      UPDATE "WalletDelivery" SET "status" = 'sent', "telegramMessageId" = ${receipt.messageId},
        "sentAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${claim.id} AND "claimToken" = ${claim.claimToken} AND "status" = 'dispatching'`) === 1
  }

  public async markUncertain(claim: DeliveryClaim, reason: 'send-or-ack-failed' | 'watch-changed'): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "WalletDelivery" SET "status" = 'uncertain', "uncertainAt" = CURRENT_TIMESTAMP,
        "failureCode" = ${reason}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${claim.id} AND "claimToken" = ${claim.claimToken} AND "status" = 'dispatching'`
  }

  public async recoverInterruptedClaims(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "WalletDelivery" SET "status" = 'uncertain', "uncertainAt" = CURRENT_TIMESTAMP,
        "failureCode" = 'interrupted-claim', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" IN (SELECT "id" FROM "WalletDelivery" WHERE "status" = 'dispatching'
        AND "claimedAt" < CURRENT_TIMESTAMP - ${STALE_CLAIM_MS} * INTERVAL '1 millisecond'
        ORDER BY "claimedAt" ASC, "id" ASC LIMIT ${DELIVERY_BATCH_SIZE} FOR UPDATE SKIP LOCKED)
        AND "status" = 'dispatching'`
  }

  public async getHoldCounts(): Promise<{ uncertain: number; dispatching: number }> {
    const rows = await this.prisma.$queryRaw<Array<{ status: string; count: number }>>`
      SELECT "status", COUNT(*)::integer AS "count" FROM "WalletDelivery"
      WHERE "status" IN ('uncertain', 'dispatching') GROUP BY "status"`
    return { uncertain: rows.find((row) => row.status === 'uncertain')?.count ?? 0,
      dispatching: rows.find((row) => row.status === 'dispatching')?.count ?? 0 }
  }
}

export interface DeliveryStore {
  listPendingIds(): Promise<Array<string>>
  claim(id: string): Promise<DeliveryClaim | null>
  isClaimCurrent(claim: DeliveryClaim): Promise<boolean>
  markSent(claim: DeliveryClaim, receipt: DeliveryReceipt): Promise<boolean>
  markUncertain(claim: DeliveryClaim, reason: 'send-or-ack-failed' | 'watch-changed'): Promise<void>
  recoverInterruptedClaims(): Promise<void>
}

const awaitReceipt = async (
  notify: () => Promise<DeliveryReceipt>,
): Promise<DeliveryReceipt> => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      // Schedule before calling notify so even a synchronous throw is held.
      Promise.resolve().then(notify),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Delivery acknowledgement timed out')), DELIVERY_ACK_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

export const dispatchPendingDeliveries = async (
  ledger: DeliveryStore,
  notify: (chatId: string, message: string) => Promise<DeliveryReceipt>,
): Promise<void> => {
  await ledger.recoverInterruptedClaims()
  const pending = await ledger.listPendingIds()
  for (const id of pending) {
    const claim = await ledger.claim(id)
    if (!claim) continue
    try {
      if (!await ledger.isClaimCurrent(claim)) {
        await ledger.markUncertain(claim, 'watch-changed')
        continue
      }
      const receipt = await awaitReceipt(() => notify(claim.chatId, claim.message))
      if (!receipt || typeof receipt.messageId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(receipt.messageId) ||
        !await ledger.markSent(claim, receipt)) throw new Error('Delivery acknowledgement unavailable')
    } catch {
      // Includes a rejected send, lost Telegram acknowledgement and lost DB ack.
      // If this write also fails the durable dispatching claim remains non-retryable.
      await ledger.markUncertain(claim, 'send-or-ack-failed')
    }
  }
}
