import type { NextFunction, Response } from 'express'
import { config } from '../config/environment'
import type { AuthenticatedRequest } from '../types/auth'
import { authMiddleware } from './auth'

export const adminAuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  authMiddleware(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    if (config.auth.adminWalletAddresses.size === 0) {
      res.status(503).json({ error: 'Admin wallets are not configured' })
      return
    }

    if (!config.auth.adminWalletAddresses.has(req.user.walletAddress)) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }

    next()
  })
}
