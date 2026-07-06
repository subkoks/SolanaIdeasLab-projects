import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from '../lib/config'
import { estimateUsdFromSol, lamportsToSol } from '../lib/portfolio'
import { getWatchLimitForTier, isValidSubscriberTier } from '../lib/watch-limits'
import { logger } from '../lib/logger'

export class DatabaseService {
  private readonly prisma: PrismaClient

  constructor() {
    const adapter = new PrismaPg({ connectionString: config.database.url })
    this.prisma = new PrismaClient({ adapter })
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
    const subscriber = await this.upsertSubscriber(chatId)
    const maxWatches = getWatchLimitForTier(subscriber.tier)
    const activeCount = await this.prisma.walletWatch.count({
      where: { subscriberId: subscriber.id, active: true },
    })

    if (activeCount >= maxWatches) {
      throw new Error(
        `Watch limit reached (${maxWatches} on ${subscriber.tier} tier)`,
      )
    }

    return this.prisma.walletWatch.upsert({
      where: {
        subscriberId_walletAddress: {
          subscriberId: subscriber.id,
          walletAddress,
        },
      },
      update: { label, active: true },
      create: {
        subscriberId: subscriber.id,
        walletAddress,
        label,
        active: true,
      },
    })
  }

  public async removeWatch(chatId: string, walletAddress: string) {
    const subscriber = await this.prisma.telegramSubscriber.findUnique({
      where: { chatId },
    })

    if (!subscriber) {
      return null
    }

    return this.prisma.walletWatch.updateMany({
      where: {
        subscriberId: subscriber.id,
        walletAddress,
        active: true,
      },
      data: { active: false },
    })
  }

  public async listWatches(chatId: string) {
    const subscriber = await this.prisma.telegramSubscriber.findUnique({
      where: { chatId },
      include: {
        watches: {
          where: { active: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    return subscriber?.watches ?? []
  }

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

  public async recordActivity(input: {
    walletAddress: string
    signature: string
    direction: string
    lamports?: bigint
    tokenMint?: string
    summary?: string
  }) {
    try {
      return await this.prisma.walletActivityEvent.create({
        data: input,
      })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        return null
      }
      throw error
    }
  }

  public async getRecentActivity(walletAddress: string, limit = 5) {
    return this.prisma.walletActivityEvent.findMany({
      where: { walletAddress },
      orderBy: { observedAt: 'desc' },
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
    const solUsdPrice = config.analytics.mockSolUsdPrice

    return {
      days,
      uniqueTokens: tokenMints.length,
      netSol,
      estimatedNetUsd: estimateUsdFromSol(Math.abs(netSol), solUsdPrice),
      netDirection: netSol >= 0 ? 'inflow' : 'outflow',
      pricingMode: 'mock',
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
