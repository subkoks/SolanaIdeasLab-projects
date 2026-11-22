import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import { config } from '../lib/config'
import { estimateUsdFromSol, lamportsToSol } from '../lib/portfolio'
import { getSolUsdPrice } from '../lib/sol-price'
import { getWatchLimitForTier, isValidSubscriberTier } from '../lib/watch-limits'
import { logger } from '../lib/logger'
import { WalletDeliveryLedger } from './wallet-delivery-ledger'
import { assertWalletDeliveryReady } from '../lib/wallet-delivery-gate'

const movementKeyFor = (input: {
  lamports?: bigint
  tokenMint?: string
}): string => input.tokenMint
  ? `spl:${input.tokenMint}`
  : input.lamports === undefined
    ? 'unknown'
    : 'sol'

export class DatabaseService {
  private readonly prisma: PrismaClient
  public readonly deliveryLedger: WalletDeliveryLedger

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: config.database.url }) })
    this.deliveryLedger = new WalletDeliveryLedger(this.prisma)
  }

  public async connect(): Promise<void> {
    await this.prisma.$connect()
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
  }

  public async upsertSubscriber(chatId: string, username?: string) {
    return this.prisma.telegramSubscriber.upsert({
      where: { chatId },
      update: { username, active: true },
      create: { chatId, username, active: true },
    })
  }

  public async addWatch(
    chatId: string,
    walletAddress: string,
    label?: string,
  ) {
    assertWalletDeliveryReady()
    const subscriber = await this.upsertSubscriber(chatId)
    return this.deliveryLedger.addWatch(subscriber.id, walletAddress, label)
  }

  public async removeWatch(chatId: string, walletAddress: string) {
    assertWalletDeliveryReady()
    const subscriber = await this.prisma.telegramSubscriber.findUnique({
      where: { chatId },
    })

    if (!subscriber) {
      return null
    }

    return this.deliveryLedger.removeWatch(subscriber.id, walletAddress)
  }

  public async listWatches(chatId: string) {
    const subscriber = await this.prisma.telegramSubscriber.findUnique({
      where: { chatId },
      include: {
        watches: {
          where: { active: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, subscriberId: true, walletAddress: true, label: true, lastSignature: true,
            active: true, createdAt: true, updatedAt: true },
        },
      },
    })

    return subscriber?.watches ?? []
  }

  // Legacy notification-outbox API. Production ingestion and delivery use
  // deliveryLedger; these methods remain only for historical regression coverage.
  public async listActiveWatches() {
    return this.prisma.walletWatch.findMany({
      where: { active: true },
      include: { subscriber: true },
    })
  }

  public async updateWatchCursor(watchId: string, lastSignature: string) {
    return this.prisma.walletWatch.update({
      where: { id: watchId },
      data: { lastSignature },
    })
  }

  public async resetWatchCursor(watchId: string) {
    return this.prisma.walletWatch.update({
      where: { id: watchId },
      data: { lastSignature: null },
    })
  }

  public async recordActivity(input: {
    walletAddress: string
    signature: string
    direction: string
    lamports?: bigint
    tokenMint?: string
    summary?: string
  }) {
    const movementKey = movementKeyFor(input)
    return this.prisma.walletActivityEvent.upsert({
      where: {
        walletAddress_signature_movementKey: {
          walletAddress: input.walletAddress,
          signature: input.signature,
          movementKey,
        },
      },
      update: {},
      create: { ...input, movementKey },
    })
  }

  public async commitWatchProgress(input: {
    watchId: string
    cursor: string
    movements: Array<{
      walletAddress: string
      signature: string
      direction: string
      lamports?: bigint
      tokenMint?: string
      summary?: string
    }>
    notifications: Array<{
      signature: string
      message: string
    }>
  }) {
    return this.prisma.$transaction(async (transaction) => {
      if (input.movements.length > 0) {
        await transaction.walletActivityEvent.createMany({
          data: input.movements.map((movement) => ({
            ...movement,
            movementKey: movementKeyFor(movement),
          })),
          skipDuplicates: true,
        })
      }
      if (input.notifications.length > 0) {
        await transaction.walletNotification.createMany({
          data: input.notifications.map((notification) => ({
            watchId: input.watchId,
            ...notification,
          })),
          skipDuplicates: true,
        })
      }
      return transaction.walletWatch.update({
        where: { id: input.watchId },
        data: { lastSignature: input.cursor },
      })
    })
  }

  public async claimPendingNotifications(
    watchId: string,
    leaseMs = 5 * 60 * 1000,
    limit = 20,
  ) {
    const now = new Date()
    const staleBefore = new Date(now.getTime() - Math.max(1, leaseMs))
    const claimable = {
      deliveredAt: null,
      OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
    }

    return this.prisma.$transaction(async (transaction) => {
      const candidates = await transaction.walletNotification.findMany({
        where: { watchId, ...claimable },
        orderBy: { createdAt: 'asc' },
        take: Math.max(1, limit),
      })
      const claimed = []

      for (const notification of candidates) {
        const claimToken = randomUUID()
        const result = await transaction.walletNotification.updateMany({
          where: { id: notification.id, ...claimable },
          data: { claimedAt: now, claimToken },
        })
        if (result.count === 1) {
          claimed.push({ ...notification, claimedAt: now, claimToken })
        }
      }

      return claimed
    })
  }

  public async markNotificationDelivered(
    notificationId: string,
    claimToken: string,
  ) {
    return this.prisma.walletNotification.updateMany({
      where: {
        id: notificationId,
        claimToken,
        deliveredAt: null,
      },
      data: {
        deliveredAt: new Date(),
        claimedAt: null,
        claimToken: null,
      },
    })
  }

  public async releaseNotificationClaim(
    notificationId: string,
    claimToken: string,
  ) {
    return this.prisma.walletNotification.updateMany({
      where: {
        id: notificationId,
        claimToken,
        deliveredAt: null,
      },
      data: {
        claimedAt: null,
        claimToken: null,
      },
    })
  }
  public async getRecentActivity(walletAddress: string, limit = 5) {
    return this.prisma.walletActivityEvent.findMany({
      where: { walletAddress },
      select: { id: true, walletAddress: true, signature: true, direction: true, lamports: true,
        tokenMint: true, summary: true, observedAt: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    })
  }

  public async getActivityBreakdown(walletAddress: string) {
    const events = await this.prisma.walletActivityEvent.findMany({
      where: { walletAddress },
      select: { direction: true },
    })

    const breakdown = { in: 0, out: 0, unknown: 0 }

    for (const event of events) {
      if (event.direction === 'in') {
        breakdown.in += 1
      } else if (event.direction === 'out') {
        breakdown.out += 1
      } else {
        breakdown.unknown += 1
      }
    }

    return {
      total: events.length,
      ...breakdown,
    }
  }

  public async getActivityTimeline(walletAddress: string, days = 14) {
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - days)

    const events = await this.prisma.walletActivityEvent.findMany({
      where: {
        walletAddress,
        observedAt: { gte: since },
      },
      select: { observedAt: true, direction: true },
      orderBy: { observedAt: 'asc' },
    })

    const buckets = new Map<string, { date: string; in: number; out: number }>()

    for (const event of events) {
      const date = event.observedAt.toISOString().slice(0, 10)
      const bucket = buckets.get(date) ?? { date, in: 0, out: 0 }

      if (event.direction === 'in') {
        bucket.in += 1
      } else if (event.direction === 'out') {
        bucket.out += 1
      }

      buckets.set(date, bucket)
    }

    return Array.from(buckets.values())
  }

  public async getDashboardStats() {
    const [subscribers, watches, events] = await Promise.all([
      this.prisma.telegramSubscriber.count({ where: { active: true } }),
      this.prisma.walletWatch.count({ where: { active: true } }),
      this.prisma.walletActivityEvent.count(),
    ])

    return { subscribers, watches, events }
  }

  public async getAnalyticsOverview() {
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [eventsLast24h, eventsLast7d, activeWallets, watches, totalEvents] =
      await Promise.all([
        this.prisma.walletActivityEvent.count({
          where: { observedAt: { gte: dayAgo } },
        }),
        this.prisma.walletActivityEvent.count({
          where: { observedAt: { gte: weekAgo } },
        }),
        this.prisma.walletActivityEvent.groupBy({
          by: ['walletAddress'],
          where: { observedAt: { gte: weekAgo } },
        }),
        this.prisma.walletWatch.count({ where: { active: true } }),
        this.prisma.walletActivityEvent.count(),
      ])

    const uniqueActiveWallets = activeWallets.length
    const avgEventsPerWatch =
      watches > 0 ? Math.round((totalEvents / watches) * 10) / 10 : 0

    return {
      eventsLast24h,
      eventsLast7d,
      uniqueActiveWallets,
      avgEventsPerWatch,
    }
  }

  public async getTopActiveWallets(limit = 5) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const grouped = await this.prisma.walletActivityEvent.groupBy({
      by: ['walletAddress'],
      where: { observedAt: { gte: weekAgo } },
      _count: { _all: true },
      orderBy: { _count: { walletAddress: 'desc' } },
      take: limit,
    })

    return grouped.map((row) => ({
      walletAddress: row.walletAddress,
      eventCount: row._count._all,
    }))
  }

  public async getWalletBehaviorSummary(walletAddress: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const events = await this.prisma.walletActivityEvent.findMany({
      where: { walletAddress, observedAt: { gte: since } },
      select: { direction: true, lamports: true },
    })

    let inCount = 0
    let outCount = 0
    let inLamports = BigInt(0)
    let outLamports = BigInt(0)

    for (const event of events) {
      if (event.direction === 'in') {
        inCount += 1
        inLamports += event.lamports ?? BigInt(0)
      } else if (event.direction === 'out') {
        outCount += 1
        outLamports += event.lamports ?? BigInt(0)
      }
    }

    const total = events.length
    const netLamports = inLamports - outLamports

    return {
      days,
      totalEvents: total,
      inCount,
      outCount,
      inOutRatio: outCount > 0 ? Math.round((inCount / outCount) * 100) / 100 : inCount,
      avgInLamports: inCount > 0 ? (inLamports / BigInt(inCount)).toString() : '0',
      avgOutLamports: outCount > 0 ? (outLamports / BigInt(outCount)).toString() : '0',
      netLamports: netLamports.toString(),
    }
  }

  public async getTokenMintBreakdown(walletAddress: string, limit = 10) {
    const events = await this.prisma.walletActivityEvent.findMany({
      where: {
        walletAddress,
        tokenMint: { not: null },
      },
      select: { tokenMint: true },
    })

    const counts = new Map<string, number>()

    for (const event of events) {
      const mint = event.tokenMint
      if (!mint) {
        continue
      }
      counts.set(mint, (counts.get(mint) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([tokenMint, eventCount]) => ({ tokenMint, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, limit)
  }

  public async getSubscriberLimits(chatId: string) {
    const subscriber = await this.prisma.telegramSubscriber.findUnique({
      where: { chatId },
      include: {
        watches: {
          where: { active: true },
          select: { id: true },
        },
      },
    })

    if (!subscriber) {
      return null
    }

    const limit = getWatchLimitForTier(subscriber.tier)

    return {
      tier: subscriber.tier,
      limit,
      used: subscriber.watches.length,
      remaining: Math.max(limit - subscriber.watches.length, 0),
    }
  }

  public async setSubscriberTier(chatId: string, tier: string) {
    if (!isValidSubscriberTier(tier)) {
      throw new Error(`Invalid tier: ${tier}`)
    }

    return this.prisma.telegramSubscriber.update({
      where: { chatId },
      data: { tier },
    })
  }

  public async getWalletPortfolioSummary(walletAddress: string, days = 30) {
    const behavior = await this.getWalletBehaviorSummary(walletAddress, days)
    const tokenMints = await this.getTokenMintBreakdown(walletAddress, 20)
    const netSol = lamportsToSol(behavior.netLamports)
    const { priceUsd: solUsdPrice, source: pricingMode } = await getSolUsdPrice()

    return {
      days,
      uniqueTokens: tokenMints.length,
      netSol,
      estimatedNetUsd: estimateUsdFromSol(Math.abs(netSol), solUsdPrice),
      netDirection: netSol >= 0 ? 'inflow' : 'outflow',
      pricingMode,
      solUsdPrice,
      topTokens: tokenMints.slice(0, 5),
      behavior,
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return true
    } catch (error) {
      logger.error('Database health check failed', { error })
      return false
    }
  }
}
