import type { NextFunction, Response } from 'express'
import type { AuthenticatedRequest } from '../types/auth'
import {
  countScansSince,
  isWithinScanLimit,
  SCAN_LIMITS_BY_TIER,
  startOfUtcDay,
} from '../utils/subscription-limits'
import type { DatabaseService } from '../services/database'

export const createScanLimitMiddleware =
  (databaseService: DatabaseService) =>
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      next()
      return
    }

    const scans = await databaseService.getUserScans(req.user.id)
    const usedToday = countScansSince(scans, req.user.id, startOfUtcDay())
    const tier = req.user.subscriptionTier

    if (!isWithinScanLimit(tier, usedToday)) {
      res.status(429).json({
        error: 'Daily scan limit reached for your subscription tier',
        limit: SCAN_LIMITS_BY_TIER[tier],
        tier,
        usedToday,
      })
      return
    }

    next()
  }
