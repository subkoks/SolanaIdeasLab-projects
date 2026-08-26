import { Request, Response, NextFunction } from 'express'
import { AuthUser } from '../auth/wallet-auth'

export interface AuthenticatedRequest extends Request {
  user?: AuthUser
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

export class ApiMiddleware {
  /**
   * Bearer-token authentication. Resolves the user via the injected
   * `verifyToken` callback (typically `WalletAuth.verifyToken`). Returns 401
   * when the token is missing or invalid.
   */
  static authMiddleware(verifyToken: (token: string) => AuthUser | null) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const header = req.headers.authorization
        if (!header || !header.startsWith('Bearer ')) {
          return res.status(401).json({
            success: false,
            error: 'No token provided',
            timestamp: new Date().toISOString(),
          })
        }

        const token = header.slice('Bearer '.length).trim()
        const user = verifyToken(token)

        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'Invalid token',
            timestamp: new Date().toISOString(),
          })
        }

        req.user = user
        next()
      } catch (error) {
        res.status(401).json({
          success: false,
          error: 'Authentication failed',
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  static subscriptionMiddleware(requiredTier: string) {
    const tierHierarchy: string[] = ['free', 'basic', 'pro', 'enterprise']
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          timestamp: new Date().toISOString(),
        })
      }

      const userTierIndex = tierHierarchy.indexOf(req.user.subscriptionTier)
      const requiredTierIndex = tierHierarchy.indexOf(requiredTier)

      if (userTierIndex < 0 || requiredTierIndex < 0 || userTierIndex < requiredTierIndex) {
        return res.status(403).json({
          success: false,
          error: `Requires ${requiredTier} subscription or higher`,
          timestamp: new Date().toISOString(),
        })
      }

      next()
    }
  }

  static rateLimitMiddleware(maxRequests: number, windowMs: number) {
    const requests = new Map<string, { count: number; resetTime: number }>()

    return (req: Request, res: Response, next: NextFunction) => {
      const clientId = (req.ip as string) || 'unknown'
      const now = Date.now()
      const clientData = requests.get(clientId)

      if (!clientData || now > clientData.resetTime) {
        requests.set(clientId, { count: 1, resetTime: now + windowMs })
        return next()
      }

      if (clientData.count >= maxRequests) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          timestamp: new Date().toISOString(),
        })
      }

      clientData.count++
      next()
    }
  }

  static errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
    // Never leak internal error details in production.
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      timestamp: new Date().toISOString(),
    })
  }
}

export const createApiResponse = <T>(
  success: boolean,
  data?: T,
  error?: string,
  message?: string,
): ApiResponse<T> => {
  return {
    success,
    data,
    error,
    message,
    timestamp: new Date().toISOString(),
  }
}
