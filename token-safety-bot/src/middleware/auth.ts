import type { NextFunction, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/environment'
import type { AuthenticatedRequest, AuthenticatedUser, SubscriptionTier } from '../types/auth'
import { logger } from '../utils/logger'

interface AccessTokenPayload {
  userId: string
  walletAddress: string
  subscriptionTier: SubscriptionTier
}

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null
  }

  return authorizationHeader.slice('Bearer '.length).trim()
}

const getDevelopmentUser = (): AuthenticatedUser => ({
  id: 'dev-user',
  walletAddress: 'dev-wallet',
  subscriptionTier: 'enterprise',
})

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const token = getBearerToken(req.headers.authorization)

  if (!token) {
    res.status(401).json({ error: 'Access token required' })
    return
  }

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as AccessTokenPayload
    req.user = {
      id: payload.userId,
      walletAddress: payload.walletAddress,
      subscriptionTier: payload.subscriptionTier,
    }
    next()
  } catch (error) {
    if (config.development.skipAuthInDev) {
      req.user = getDevelopmentUser()
      next()
      return
    }

    logger.error('Authentication failed', { error })
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
