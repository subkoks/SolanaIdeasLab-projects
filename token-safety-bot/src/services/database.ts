import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { config } from '../config/environment'
import type { AuthenticatedUser, SubscriptionTier } from '../types/auth'
import { logger } from '../utils/logger'
import type { SafetyScanResult } from './safety-scanner'

interface UserRecord extends AuthenticatedUser {
  createdAt: string
  lastLoginAt: string
  preferences: Record<string, unknown>
}

interface AlertRecord {
  id: string
  userId: string
  tokenAddress: string
  alertType: string
  criteria: Record<string, unknown>
  active: boolean
  createdAt: string
}

interface BlacklistedTokenRecord {
  id: string
  tokenAddress: string
  reason: string
  evidence: unknown
  createdAt: string
}

interface StoredScanRecord {
  id: string
  userId?: string
  tokenAddress: string
  result: SafetyScanResult
  createdAt: string
}

interface CacheEntry {
  expiresAt: number | null
  value: unknown
}

interface PersistedDatabaseState {
  alerts: Array<AlertRecord>
  blacklistedTokens: Array<BlacklistedTokenRecord>
  scans: Array<StoredScanRecord>
  users: Array<UserRecord>
  version: number
}

const STORE_VERSION = 1

const nowIsoString = (): string => new Date().toISOString()

const normalizeTokenAddress = (tokenAddress: string): string => tokenAddress.trim()

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

export class DatabaseService {
  private readonly alerts = new Map<string, AlertRecord>()
  private readonly blacklistedTokens = new Map<string, BlacklistedTokenRecord>()
  private readonly cache = new Map<string, CacheEntry>()
  private readonly scans = new Array<StoredScanRecord>()
  private readonly storageFilePath: string
  private readonly users = new Map<string, UserRecord>()
  private connected = false
  private persistQueue: Promise<void> = Promise.resolve()

  constructor(storageFilePath: string = config.database.storageFilePath) {
    this.storageFilePath = storageFilePath
  }

  public async connect(): Promise<void> {
    await this.loadStateFromDisk()
    this.connected = true
  }

  public async disconnect(): Promise<void> {
    await this.persistState()
    this.connected = false
  }

  public async healthCheck(): Promise<boolean> {
    return this.connected
  }

  public async authenticateWallet(
    walletAddress: string,
    _signature: string,
  ): Promise<{ refreshToken: string; token: string; user: AuthenticatedUser }> {
    const normalizedWalletAddress = walletAddress.trim()

    if (!normalizedWalletAddress) {
      throw new Error('Wallet address is required')
    }

    const existingUser = Array.from(this.users.values()).find(
      (user) => user.walletAddress === normalizedWalletAddress,
    )
    const timestamp = nowIsoString()

    const user: UserRecord = existingUser ?? {
      id: randomUUID(),
      walletAddress: normalizedWalletAddress,
      subscriptionTier: 'free',
      createdAt: timestamp,
      lastLoginAt: timestamp,
      preferences: {},
    }

    user.lastLoginAt = timestamp
    this.users.set(user.id, user)
    await this.persistState()

    return {
      ...createTokenPair(user),
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        subscriptionTier: user.subscriptionTier,
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

    const user = this.users.get(payload.userId)

    if (!user) {
      throw new Error('User not found')
    }

    return createTokenPair(user)
  }

  public async getUserAlerts(userId: string): Promise<Array<AlertRecord>> {
    return Array.from(this.alerts.values())
      .filter((alert) => alert.userId === userId && alert.active)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  public async createAlert(
    userId: string,
    alertData: {
      alertType: string
      criteria?: Record<string, unknown>
      tokenAddress: string
    },
  ): Promise<AlertRecord> {
    const alert: AlertRecord = {
      id: randomUUID(),
      userId,
      tokenAddress: normalizeTokenAddress(alertData.tokenAddress),
      alertType: alertData.alertType,
      criteria: alertData.criteria ?? {},
      active: true,
      createdAt: nowIsoString(),
    }

    this.alerts.set(alert.id, alert)
    await this.persistState()
    return alert
  }

  public async deleteAlert(userId: string, alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId)

    if (!alert || alert.userId !== userId) {
      throw new Error('Alert not found')
    }

    this.alerts.delete(alertId)
    await this.persistState()
  }

  public async deleteAlertsForToken(
    userId: string,
    tokenAddress: string,
  ): Promise<void> {
    const normalizedTokenAddress = normalizeTokenAddress(tokenAddress)
    let didDelete = false

    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.userId === userId && alert.tokenAddress === normalizedTokenAddress) {
        this.alerts.delete(alertId)
        didDelete = true
      }
    }

    if (didDelete) {
      await this.persistState()
    }
  }

  public async getUserProfile(
    userId: string,
  ): Promise<{
    alerts: Array<AlertRecord>
    id: string
    preferences: Record<string, unknown>
    recentScans: Array<StoredScanRecord>
    subscriptionTier: SubscriptionTier
    walletAddress: string
  }> {
    const user = this.users.get(userId)

    if (!user) {
      throw new Error('User not found')
    }

    return {
      id: user.id,
      walletAddress: user.walletAddress,
      subscriptionTier: user.subscriptionTier,
      preferences: user.preferences,
      alerts: await this.getUserAlerts(userId),
      recentScans: this.scans
        .filter((scan) => scan.userId === userId)
        .slice(-10)
        .reverse(),
    }
  }

  public async updateUserProfile(
    userId: string,
    profileData: { preferences?: Record<string, unknown> },
  ): Promise<UserRecord> {
    const user = this.users.get(userId)

    if (!user) {
      throw new Error('User not found')
    }

    user.preferences = profileData.preferences ?? user.preferences
    this.users.set(user.id, user)
    await this.persistState()
    return user
  }

  public async getUserScans(userId: string): Promise<Array<StoredScanRecord>> {
    return this.scans
      .filter((scan) => scan.userId === userId)
      .slice()
      .reverse()
  }

  public async saveScan(
    tokenAddress: string,
    result: SafetyScanResult,
    userId?: string,
  ): Promise<void> {
    this.scans.push({
      id: randomUUID(),
      userId,
      tokenAddress: normalizeTokenAddress(tokenAddress),
      result,
      createdAt: nowIsoString(),
    })

    await this.persistState()
  }

  public async getLatestScan(
    tokenAddress: string,
  ): Promise<SafetyScanResult | null> {
    const normalizedTokenAddress = normalizeTokenAddress(tokenAddress)

    for (let index = this.scans.length - 1; index >= 0; index -= 1) {
      const scan = this.scans[index]

      if (scan.tokenAddress === normalizedTokenAddress) {
        return scan.result
      }
    }

    return null
  }

  public async upgradeSubscription(
    userId: string,
    tier: SubscriptionTier,
  ): Promise<UserRecord> {
    const user = this.users.get(userId)

    if (!user) {
      throw new Error('User not found')
    }

    user.subscriptionTier = tier
    this.users.set(user.id, user)
    await this.persistState()
    return user
  }

  public async getUserStats(): Promise<{
    active: number
    premium: number
    total: number
  }> {
    const users = Array.from(this.users.values())
    const premiumCount = users.filter(
      (user) => user.subscriptionTier !== 'free',
    ).length

    return {
      total: users.length,
      active: users.length,
      premium: premiumCount,
    }
  }

  public async getAlertStats(): Promise<{ active: number; total: number }> {
    const alerts = Array.from(this.alerts.values())

    return {
      total: alerts.length,
      active: alerts.filter((alert) => alert.active).length,
    }
  }

  public async getScanStats(): Promise<{
    averageScore: number
    total: number
  }> {
    if (this.scans.length === 0) {
      return { averageScore: 0, total: 0 }
    }

    const totalScore = this.scans.reduce(
      (sum, scan) => sum + scan.result.overallScore,
      0,
    )

    return {
      total: this.scans.length,
      averageScore: Math.round(totalScore / this.scans.length),
    }
  }

  public async getDetectionStats(): Promise<{
    dangerous: number
    risky: number
    total: number
  }> {
    const dangerous = this.scans.filter(
      (scan) => scan.result.safetyLevel === 'dangerous',
    ).length
    const risky = this.scans.filter(
      (scan) => scan.result.safetyLevel === 'risky',
    ).length

    return {
      total: this.scans.length,
      dangerous,
      risky,
    }
  }

  public async getScanAccuracy(): Promise<number> {
    return 0
  }

  public async getAverageScanTime(): Promise<number> {
    if (this.scans.length === 0) {
      return 0
    }

    const totalScanTime = this.scans.reduce(
      (sum, scan) => sum + scan.result.scanTime,
      0,
    )
    return Math.round(totalScanTime / this.scans.length)
  }

  public async getDetectionRate(): Promise<number> {
    if (this.scans.length === 0) {
      return 0
    }

    const flagged = this.scans.filter(
      (scan) =>
        scan.result.safetyLevel === 'dangerous' ||
        scan.result.safetyLevel === 'risky',
    ).length
    return Math.round((flagged / this.scans.length) * 100)
  }

  public async getFalsePositiveRate(): Promise<number> {
    return 0
  }

  public async getAllScans(): Promise<Array<StoredScanRecord>> {
    return this.scans.slice().reverse()
  }

  public async blacklistToken(
    tokenAddress: string,
    reason: string,
    evidence: unknown,
  ): Promise<BlacklistedTokenRecord> {
    const record: BlacklistedTokenRecord = {
      id: randomUUID(),
      tokenAddress: normalizeTokenAddress(tokenAddress),
      reason,
      evidence,
      createdAt: nowIsoString(),
    }

    this.blacklistedTokens.set(record.id, record)
    await this.persistState()
    return record
  }

  public async getBlacklistedToken(
    tokenAddress: string,
  ): Promise<BlacklistedTokenRecord | null> {
    const normalizedTokenAddress = normalizeTokenAddress(tokenAddress)

    const matchingTokens = Array.from(this.blacklistedTokens.values())
      .filter((record) => record.tokenAddress === normalizedTokenAddress)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

    return matchingTokens[0] ?? null
  }

  public async getBlacklistedTokens(): Promise<Array<BlacklistedTokenRecord>> {
    return Array.from(this.blacklistedTokens.values()).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    )
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
    if (this.users.has(user.id)) {
      return
    }

    this.users.set(user.id, {
      ...user,
      createdAt: nowIsoString(),
      lastLoginAt: nowIsoString(),
      preferences: {},
    })

    void this.persistState()
    logger.info('Seeded user into persistent store', { userId: user.id })
  }

  private getSerializedState(): PersistedDatabaseState {
    return {
      version: STORE_VERSION,
      users: Array.from(this.users.values()),
      alerts: Array.from(this.alerts.values()),
      blacklistedTokens: Array.from(this.blacklistedTokens.values()),
      scans: this.scans,
    }
  }

  private async loadStateFromDisk(): Promise<void> {
    await mkdir(path.dirname(this.storageFilePath), { recursive: true })

    let rawStore: string

    try {
      rawStore = await readFile(this.storageFilePath, 'utf-8')
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException

      if (fileError.code === 'ENOENT') {
        return
      }

      throw error
    }

    try {
      const parsed = JSON.parse(rawStore) as Partial<PersistedDatabaseState>

      if (
        parsed.version !== STORE_VERSION ||
        !Array.isArray(parsed.users) ||
        !Array.isArray(parsed.alerts) ||
        !Array.isArray(parsed.blacklistedTokens) ||
        !Array.isArray(parsed.scans)
      ) {
        logger.warn('Skipping store hydration due to incompatible store format', {
          storageFilePath: this.storageFilePath,
        })
        return
      }

      this.users.clear()
      this.alerts.clear()
      this.blacklistedTokens.clear()
      this.scans.length = 0

      for (const user of parsed.users) {
        this.users.set(user.id, user)
      }

      for (const alert of parsed.alerts) {
        this.alerts.set(alert.id, alert)
      }

      for (const token of parsed.blacklistedTokens) {
        this.blacklistedTokens.set(token.id, token)
      }

      this.scans.push(...parsed.scans)

      logger.info('Loaded persistent database state', {
        storageFilePath: this.storageFilePath,
        users: this.users.size,
        alerts: this.alerts.size,
        blacklistedTokens: this.blacklistedTokens.size,
        scans: this.scans.length,
      })
    } catch (error) {
      const corruptStorePath = `${this.storageFilePath}.corrupt-${Date.now()}`
      await rename(this.storageFilePath, corruptStorePath)
      logger.error('Persistent store was invalid JSON and has been rotated', {
        error,
        storageFilePath: this.storageFilePath,
        corruptStorePath,
      })
    }
  }

  private async persistState(): Promise<void> {
    this.persistQueue = this.persistQueue
      .then(async () => {
        const payload = JSON.stringify(this.getSerializedState(), null, 2)
        await mkdir(path.dirname(this.storageFilePath), { recursive: true })
        await writeFile(this.storageFilePath, payload, 'utf-8')
      })
      .catch((error) => {
        logger.error('Failed to persist database state', {
          error,
          storageFilePath: this.storageFilePath,
        })
      })

    await this.persistQueue
  }
}
