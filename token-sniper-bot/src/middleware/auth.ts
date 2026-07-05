import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/environment'
import { logger } from '../utils/logger'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    walletAddress: string
    subscriptionTier: string
  }
}

export interface JWTPayload {
  userId: string
  walletAddress: string
  subscriptionTier: string
  iat: number
  exp: number
}

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      res.status(401).json({ error: 'Access token required' })
      return
    }

    // Skip auth in development if configured
    if (config.development.skipAuthInDev && config.server.host === 'localhost') {
      req.user = {
        id: 'dev-user',
        walletAddress: 'dev-wallet',
        subscriptionTier: 'enterprise'
      }
      next()
      return
    }

    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload
    req.user = {
      id: decoded.userId,
      walletAddress: decoded.walletAddress,
      subscriptionTier: decoded.subscriptionTier
    }

    next()
  } catch (error) {
    logger.error('Auth middleware error:', error)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export const premiumAuthMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  await authMiddleware(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const premiumTiers = ['basic', 'pro', 'enterprise']
    if (!premiumTiers.includes(req.user.subscriptionTier)) {
      res.status(403).json({ error: 'Premium subscription required' })
      return
    }

    next()
  })
}

export const proAuthMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  await authMiddleware(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const proTiers = ['pro', 'enterprise']
    if (!proTiers.includes(req.user.subscriptionTier)) {
      res.status(403).json({ error: 'Pro subscription required' })
      return
    }

    next()
  })
}

export const enterpriseAuthMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  await authMiddleware(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    if (req.user.subscriptionTier !== 'enterprise') {
      res.status(403).json({ error: 'Enterprise subscription required' })
      return
    }

    next()
  })
}

export const adminAuthMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  await authMiddleware(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    // Check if user is admin via configured wallet allowlist
    const adminWallets = config.auth.adminWalletAddresses

    if (adminWallets.length === 0) {
      res.status(503).json({ error: 'Admin wallets are not configured' })
      return
    }

    if (!adminWallets.includes(req.user.walletAddress)) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }

    next()
  })
}

export const generateToken = (user: { id: string; walletAddress: string; subscriptionTier: string }): string => {
  const payload: JWTPayload = {
    userId: user.id,
    walletAddress: user.walletAddress,
    subscriptionTier: user.subscriptionTier,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  }

  return jwt.sign(payload, config.jwt.secret)
}

export const generateRefreshToken = (userId: string): string => {
  const payload = {
    userId,
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  }

  return jwt.sign(payload, config.jwt.refreshSecret)
}

export const verifyRefreshToken = (token: string): { userId: string } => {
  const decoded = jwt.verify(token, config.jwt.refreshSecret) as any
  return { userId: decoded.userId }
}

export const optionalAuthMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload
      req.user = {
        id: decoded.userId,
        walletAddress: decoded.walletAddress,
        subscriptionTier: decoded.subscriptionTier
      }
    }

    next()
  } catch (error) {
    // Continue without authentication for optional auth
    next()
  }
}

export const rateLimitByTier = (req: AuthenticatedRequest): number => {
  if (!req.user) return 10 // Default limit for unauthenticated

  const limits = {
    free: 50,
    basic: 200,
    pro: 1000,
    enterprise: 10000
  }

  return limits[req.user.subscriptionTier as keyof typeof limits] || 50
}

export const checkSubscriptionLimit = (req: AuthenticatedRequest, resource: string, currentCount: number): boolean => {
  if (!req.user) return false

  const limits = {
    free: { alerts: 5, scans: 10, apiCalls: 100 },
    basic: { alerts: 25, scans: 100, apiCalls: 1000 },
    pro: { alerts: 100, scans: 500, apiCalls: 10000 },
    enterprise: { alerts: -1, scans: -1, apiCalls: -1 } // Unlimited
  }

  const userLimits = limits[req.user.subscriptionTier as keyof typeof limits]
  const limit = userLimits[resource as keyof typeof userLimits]

  // -1 means unlimited
  if (limit === -1) return true

  return currentCount < limit
}
