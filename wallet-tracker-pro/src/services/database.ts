import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from '../lib/config'
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
    maxWatches = 10,
  ) {
    const subscriber = await this.upsertSubscriber(chatId)
    const activeCount = await this.prisma.walletWatch.count({
      where: { subscriberId: subscriber.id, active: true },
    })

    if (activeCount >= maxWatches) {
      throw new Error(`Watch limit reached (${maxWatches})`)
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
