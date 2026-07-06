import type { SubscriptionTier } from '../types/auth'
import {
  SCAN_LIMITS_BY_TIER,
  countScansSince,
  isWithinScanLimit,
  startOfUtcDay,
} from './subscription-limits'

export const getScanQuota = (
  tier: SubscriptionTier,
  scans: ReadonlyArray<{ createdAt: string; userId?: string }>,
  userId: string,
  now = new Date(),
) => {
  const since = startOfUtcDay(now)
  const usedToday = countScansSince(scans, userId, since)
  const limit = SCAN_LIMITS_BY_TIER[tier]
  const unlimited = limit === -1

  return {
    tier,
    limit,
    usedToday,
    remaining: unlimited ? -1 : Math.max(limit - usedToday, 0),
    resetsAt: new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      ),
    ).toISOString(),
    withinLimit: isWithinScanLimit(tier, usedToday),
  }
}
