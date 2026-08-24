import type { SubscriptionTier } from '../types/auth'

export class ScanLimitExceededError extends Error {
  public readonly limit: number
  public readonly usedToday: number

  constructor(limit: number, usedToday: number) {
    super('Daily scan limit reached for your subscription tier')
    this.name = 'ScanLimitExceededError'
    this.limit = limit
    this.usedToday = usedToday
  }
}

export const SCAN_LIMITS_BY_TIER: Record<SubscriptionTier, number> = {
  free: 10,
  basic: 100,
  pro: 500,
  enterprise: -1,
}

export const countScansSince = (
  scans: ReadonlyArray<{ createdAt: string; userId?: string }>,
  userId: string,
  since: Date,
): number =>
  scans.filter(
    (scan) =>
      scan.userId === userId && new Date(scan.createdAt).getTime() >= since.getTime(),
  ).length

export const isWithinScanLimit = (
  tier: SubscriptionTier,
  scanCount: number,
): boolean => {
  const limit = SCAN_LIMITS_BY_TIER[tier]
  return limit === -1 || scanCount < limit
}

export const startOfUtcDay = (now = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
