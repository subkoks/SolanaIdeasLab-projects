import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import jwt from 'jsonwebtoken'
import { config } from '../config/environment'
import type { AuthenticatedUser, SubscriptionTier } from '../types/auth'
import { logger } from '../utils/logger'
import type { SafetyScanResult } from './safety-scanner'

interface AlertRecord {
  active: boolean
  alertType: string
  createdAt: string
  criteria: Record<string, unknown>
  id: string
  tokenAddress: string
  userId: string
}

interface BlacklistedTokenRecord {
  createdAt: string
  evidence: unknown
  id: string
  reason: string
  tokenAddress: string
}

interface StoredScanRecord {
  createdAt: string
  id: string
  result: SafetyScanResult
  tokenAddress: string
  userId?: string
}

interface UserRecord extends AuthenticatedUser {
  createdAt: string
  lastLoginAt: string
  preferences: Record<string, unknown>
}

interface CacheEntry {
  expiresAt: number | null
  value: unknown
}

const normalizeTokenAddress = (tokenAddress: string): string =>
  tokenAddress.trim()

const getJwtExpiration = (value: string): jwt.SignOptions['expiresIn'] =>
  value as jwt.SignOptions['expiresIn']

const createTokenPair = (
  user: AuthenticatedUser,
): { refreshToken: string; token: string } => {
  const token = jwt.sign(
    {
      userId: user.id,
      walletAddress: user.walletAddress,
      subscriptionTier: user.subscriptionTier,
    },
    config.auth.jwtSecret,
    { expiresIn: getJwtExpiration(config.auth.accessTokenTtl) },
  )

  const refreshToken = jwt.sign(
    {
      userId: user.id,
      walletAddress: user.walletAddress,
      subscriptionTier: user.subscriptionTier,
    },
    config.auth.jwtSecret,
    { expiresIn: getJwtExpiration(config.auth.refreshTokenTtl) },
  )

  return { refreshToken, token }
}

const mapUser = (user: {
  createdAt: Date
  id: string
  lastLogin: Date | null
  preferences: unknown
  subscriptionTier: string
  walletAddress: string
}): UserRecord => ({
  id: user.id,
  walletAddress: user.walletAddress,
  subscriptionTier: user.subscriptionTier as SubscriptionTier,
  createdAt: user.createdAt.toISOString(),
  lastLoginAt: (user.lastLogin ?? user.createdAt).toISOString(),
  preferences: (user.preferences as Record<string, unknown> | null) ?? {},
})

export class PrismaDatabaseService {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly prisma: PrismaClient
  private connected = false

  constructor() {
    const adapter = new PrismaPg({ connectionString: config.database.url })
    this.prisma = new PrismaClient({ adapter })
  }

  public async connect(): Promise<void> {
    await this.prisma.$connect()
    this.connected = true
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
    this.connected = false
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return this.connected
    } catch (error) {
      logger.error('Prisma health check failed', { error })
      return false
    }
  }

  public async authenticateWallet(
    walletAddress: string,
    signature: string,
    message?: string,
  ): Promise<{ refreshToken: string; token: string; user: AuthenticatedUser }> {
    const normalizedWalletAddress = walletAddress.trim()

    if (!normalizedWalletAddress) {
      throw new Error('Wallet address is required')
    }

    if (!config.auth.skipWalletSignatureVerify) {
      if (!message?.trim()) {
        throw new Error('Signed message is required')
      }

      const { verifyWalletSignature } = await import('../utils/wallet-signature')

      if (!verifyWalletSignature(normalizedWalletAddress, message, signature)) {
        throw new Error('Invalid wallet signature')
      }
    }

    const user = await this.prisma.user.upsert({
      where: { walletAddress: normalizedWalletAddress },
      update: { lastLogin: new Date() },
      create: {
        walletAddress: normalizedWalletAddress,
        subscriptionTier: 'free',
        isActive: true,
      },
    })

    const mapped = mapUser(user)

    return {
      ...createTokenPair(mapped),
      user: {
        id: mapped.id,
        walletAddress: mapped.walletAddress,
        subscriptionTier: mapped.subscriptionTier,
      },
    }
  }

  public async refreshToken(
    refreshToken: string,
  ): Promise<{ refreshToken: string; token: string }> {
    const payload = jwt.verify(refreshToken, config.auth.jwtSecret) as {
      userId: string
      walletAddress: string
      subscriptionTier: SubscriptionTier
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    })

    if (!user || !user.isActive) {
      throw new Error('User not found')
    }

    return createTokenPair(mapUser(user))
  }

  public async getUserAlerts(userId: string): Promise<Array<AlertRecord>> {
    const alerts = await this.prisma.tokenAlert.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'desc' },
    })

    return alerts.map((alert) => ({
      id: alert.id,
      userId: alert.userId,
      tokenAddress: alert.tokenAddress,
      alertType: alert.alertType,
      criteria: (alert.criteria as Record<string, unknown>) ?? {},
      active: alert.active,
      createdAt: alert.createdAt.toISOString(),
    }))
  }

  public async createAlert(
    userId: string,
    alertData: {
      alertType: string
      criteria?: Record<string, unknown>
      tokenAddress: string
    },
  ): Promise<AlertRecord> {
    const alert = await this.prisma.tokenAlert.create({
      data: {
        userId,
        tokenAddress: normalizeTokenAddress(alertData.tokenAddress),
        alertType: alertData.alertType,
        criteria: (alertData.criteria ?? {}) as Prisma.InputJsonValue,
        active: true,
      },
    })

    return {
      id: alert.id,
      userId: alert.userId,
      tokenAddress: alert.tokenAddress,
      alertType: alert.alertType,
      criteria: (alert.criteria as Record<string, unknown>) ?? {},
      active: alert.active,
      createdAt: alert.createdAt.toISOString(),
    }
  }

  public async deleteAlert(userId: string, alertId: string): Promise<void> {
    const result = await this.prisma.tokenAlert.deleteMany({
      where: { id: alertId, userId },
    })

    if (result.count === 0) {
      throw new Error('Alert not found')
    }
  }

  public async deleteAlertsForToken(
    userId: string,
    tokenAddress: string,
  ): Promise<void> {
    await this.prisma.tokenAlert.deleteMany({
      where: {
        userId,
        tokenAddress: normalizeTokenAddress(tokenAddress),
      },
    })
  }

  public async getUserProfile(userId: string): Promise<{
    alerts: Array<AlertRecord>
    id: string
    preferences: Record<string, unknown>
    recentScans: Array<StoredScanRecord>
    subscriptionTier: SubscriptionTier
    walletAddress: string
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new Error('User not found')
    }

    const mapped = mapUser(user)
    const recentScans = await this.getUserScans(userId)

    return {
      id: mapped.id,
      walletAddress: mapped.walletAddress,
      subscriptionTier: mapped.subscriptionTier,
      preferences: mapped.preferences,
      alerts: await this.getUserAlerts(userId),
      recentScans: recentScans.slice(0, 10),
    }
  }

  public async updateUserProfile(
    userId: string,
    profileData: { preferences?: Record<string, unknown> },
  ): Promise<UserRecord> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: (profileData.preferences ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    })

    return mapUser(user)
  }

  public async getUserScans(userId: string): Promise<Array<StoredScanRecord>> {
    const scans = await this.prisma.tokenAnalysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    return scans.map((scan) => ({
      id: scan.id,
      userId: scan.userId ?? undefined,
      tokenAddress: scan.tokenAddress,
      result: scan.result as unknown as SafetyScanResult,
      createdAt: scan.createdAt.toISOString(),
    }))
  }

  public async saveScan(
    tokenAddress: string,
    result: SafetyScanResult,
    userId?: string,
  ): Promise<void> {
    await this.prisma.tokenAnalysis.create({
      data: {
        tokenAddress: normalizeTokenAddress(tokenAddress),
        userId,
        result: result as unknown as Prisma.InputJsonValue,
      },
    })
  }

  public async getLatestScan(
    tokenAddress: string,
  ): Promise<SafetyScanResult | null> {
    const scan = await this.prisma.tokenAnalysis.findFirst({
      where: { tokenAddress: normalizeTokenAddress(tokenAddress) },
      orderBy: { createdAt: 'desc' },
    })

    return scan ? (scan.result as unknown as SafetyScanResult) : null
  }

  public async upgradeSubscription(
    userId: string,
    tier: SubscriptionTier,
  ): Promise<UserRecord> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: tier },
    })

    return mapUser(user)
  }

  public async syncSubscriptionFromStripe(
    userId: string,
    tier: SubscriptionTier,
    _stripeSubscriptionId: string | null,
    status: 'active' | 'cancelled',
  ): Promise<UserRecord> {
    const effectiveTier = status === 'active' ? tier : 'free'

    const existing = await this.prisma.user.findUnique({ where: { id: userId } })

    const user = existing
      ? await this.prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: effectiveTier },
        })
      : await this.prisma.user.create({
          data: {
            id: userId,
            walletAddress: userId,
            subscriptionTier: effectiveTier,
          },
        })

    return mapUser(user)
  }

  public async getUserStats(): Promise<{
    active: number
    premium: number
    total: number
  }> {
    const [total, premium] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { subscriptionTier: { not: 'free' } },
      }),
    ])

    return { total, active: total, premium }
  }

  public async getAlertStats(): Promise<{ active: number; total: number }> {
    const [total, active] = await Promise.all([
      this.prisma.tokenAlert.count(),
      this.prisma.tokenAlert.count({ where: { active: true } }),
    ])

    return { total, active }
  }

  public async getScanStats(): Promise<{
    averageScore: number
    total: number
  }> {
    const scans = await this.prisma.tokenAnalysis.findMany({
      select: { result: true },
    })

    if (scans.length === 0) {
      return { averageScore: 0, total: 0 }
    }

    const totalScore = scans.reduce((sum, scan) => {
      const result = scan.result as unknown as SafetyScanResult
      return sum + (result.overallScore ?? 0)
    }, 0)

    return {
      total: scans.length,
      averageScore: Math.round(totalScore / scans.length),
    }
  }

  public async getDetectionStats(): Promise<{
    dangerous: number
    risky: number
    total: number
  }> {
    const scans = await this.prisma.tokenAnalysis.findMany({
      select: { result: true },
    })

    let dangerous = 0
    let risky = 0

    for (const scan of scans) {
      const result = scan.result as unknown as SafetyScanResult
      if (result.safetyLevel === 'dangerous') {
        dangerous += 1
      } else if (result.safetyLevel === 'risky') {
        risky += 1
      }
    }

    return { total: scans.length, dangerous, risky }
  }

  public async getScanAccuracy(): Promise<number> {
    return 0
  }

  public async getAverageScanTime(): Promise<number> {
    const scans = await this.prisma.tokenAnalysis.findMany({
      select: { result: true },
    })

    if (scans.length === 0) {
      return 0
    }

    const totalScanTime = scans.reduce((sum, scan) => {
      const result = scan.result as unknown as SafetyScanResult
      return sum + (result.scanTime ?? 0)
    }, 0)

    return Math.round(totalScanTime / scans.length)
  }

  public async getDetectionRate(): Promise<number> {
    const stats = await this.getDetectionStats()

    if (stats.total === 0) {
      return 0
    }

    return Math.round(((stats.dangerous + stats.risky) / stats.total) * 100)
  }

  public async getFalsePositiveRate(): Promise<number> {
    return 0
  }

  public async getAllScans(): Promise<Array<StoredScanRecord>> {
    const scans = await this.prisma.tokenAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return scans.map((scan) => ({
      id: scan.id,
      userId: scan.userId ?? undefined,
      tokenAddress: scan.tokenAddress,
      result: scan.result as unknown as SafetyScanResult,
      createdAt: scan.createdAt.toISOString(),
    }))
  }

  public async blacklistToken(
    tokenAddress: string,
    reason: string,
    evidence: unknown,
  ): Promise<BlacklistedTokenRecord> {
    const record = await this.prisma.blacklistedToken.upsert({
      where: { tokenAddress: normalizeTokenAddress(tokenAddress) },
      update: { reason, evidence: evidence as object | undefined },
      create: {
        tokenAddress: normalizeTokenAddress(tokenAddress),
        reason,
        evidence: evidence as object | undefined,
      },
    })

    return {
      id: record.id,
      tokenAddress: record.tokenAddress,
      reason: record.reason,
      evidence: record.evidence,
      createdAt: record.createdAt.toISOString(),
    }
  }

  public async getBlacklistedToken(
    tokenAddress: string,
  ): Promise<BlacklistedTokenRecord | null> {
    const record = await this.prisma.blacklistedToken.findUnique({
      where: { tokenAddress: normalizeTokenAddress(tokenAddress) },
    })

    if (!record) {
      return null
    }

    return {
      id: record.id,
      tokenAddress: record.tokenAddress,
      reason: record.reason,
      evidence: record.evidence,
      createdAt: record.createdAt.toISOString(),
    }
  }

  public async getBlacklistedTokens(): Promise<Array<BlacklistedTokenRecord>> {
    const records = await this.prisma.blacklistedToken.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return records.map((record) => ({
      id: record.id,
      tokenAddress: record.tokenAddress,
      reason: record.reason,
      evidence: record.evidence,
      createdAt: record.createdAt.toISOString(),
    }))
  }

  public async setCache(
    key: string,
    value: unknown,
    ttlMs?: number,
  ): Promise<void> {
    const expiresAt = typeof ttlMs === 'number' ? Date.now() + ttlMs : null
    this.cache.set(key, { expiresAt, value })
  }

  public async getCache<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.cache.delete(key)
      return null
    }

    return entry.value as T
  }

  public async deleteCache(key: string): Promise<void> {
    this.cache.delete(key)
  }

  public seedUser(user: AuthenticatedUser): void {
    void this.prisma.user
      .upsert({
        where: { walletAddress: user.walletAddress },
        update: {
          subscriptionTier: user.subscriptionTier,
        },
        create: {
          id: user.id,
          walletAddress: user.walletAddress,
          subscriptionTier: user.subscriptionTier,
          isActive: true,
        },
      })
      .then(() => {
        logger.info('Seeded user into Postgres store', { userId: user.id })
      })
      .catch((error) => {
        logger.error('Failed to seed user into Postgres store', {
          userId: user.id,
          error,
        })
      })
  }
}
