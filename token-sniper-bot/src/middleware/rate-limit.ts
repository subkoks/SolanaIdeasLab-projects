import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'
import { config } from '../config/environment'
import { logger } from '../utils/logger'

// Create a store for rate limiting
const store = new Map<string, { count: number; resetTime: number }>()

// Generic rate limiter
export const createRateLimiter = (options: {
  windowMs: number
  maxRequests: number
  message?: string
  keyGenerator?: (req: Request) => string
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.maxRequests,
    message: {
      success: false,
      error: options.message || 'Too many requests',
      statusCode: 429,
      retryAfter: Math.ceil(options.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || ((req: Request) => {
      return req.ip || req.connection.remoteAddress || 'unknown'
    }),
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.url,
        userAgent: req.get('User-Agent'),
        userId: (req as any).user?.id
      })

      res.status(429).json({
        success: false,
        error: options.message || 'Too many requests',
        statusCode: 429,
        retryAfter: Math.ceil(options.windowMs / 1000),
        timestamp: new Date().toISOString()
      })
    }
  })
}

// Global rate limiter for all requests
export const globalRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  maxRequests: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later'
})

// API rate limiter for API endpoints
export const apiRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  maxRequests: config.rateLimit.maxRequests,
  message: 'API rate limit exceeded, please try again later'
})

// Telegram bot rate limiter
export const telegramRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.telegramWindowMs,
  maxRequests: config.rateLimit.telegramMaxRequests,
  message: 'Too many bot commands, please wait before trying again',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `telegram:${userId}`
  }
})

// Authentication rate limiter (for login attempts)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req: Request) => {
    return `auth:${req.ip}`
  }
})

// Analysis rate limiter (for token analysis)
export const analysisRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many analysis requests, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `analysis:${userId}`
  }
})

// Alert rate limiter (for creating alerts)
export const alertRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  message: 'Too many alert creation requests, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `alert:${userId}`
  }
})

// Subscription rate limiter (for subscription changes)
export const subscriptionRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  message: 'Too many subscription changes, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `subscription:${userId}`
  }
})

// Admin rate limiter (for admin operations)
export const adminRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Admin rate limit exceeded',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `admin:${userId}`
  }
})

// WebSocket rate limiter
export const websocketRateLimiter = (ws: any, userId: string): boolean => {
  const key = `ws:${userId}`
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute
  const maxRequests = 100

  const record = store.get(key)
  
  if (!record || now > record.resetTime) {
    store.set(key, {
      count: 1,
      resetTime: now + windowMs
    })
    return true
  }

  if (record.count >= maxRequests) {
    return false
  }

  record.count++
  return true
}

// Tier-based rate limiting
export const tierBasedRateLimiter = (req: Request): number => {
  const user = (req as any).user
  
  if (!user) {
    return config.rateLimit.maxRequests // Default for unauthenticated
  }

  const limits = {
    free: 50,
    basic: 200,
    pro: 1000,
    enterprise: 10000
  }

  return limits[user.subscriptionTier as keyof typeof limits] || config.rateLimit.maxRequests
}

// Dynamic rate limiter based on user tier
export const createDynamicRateLimiter = () => {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: (req: Request) => tierBasedRateLimiter(req),
    message: {
      success: false,
      error: 'Rate limit exceeded for your subscription tier',
      statusCode: 429,
      upgradeHint: 'Upgrade your subscription for higher limits'
    },
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id || req.ip
      return `dynamic:${userId}`
    },
    handler: (req: Request, res: Response) => {
      const user = (req as any).user
      const currentLimit = tierBasedRateLimiter(req)
      
      logger.warn('Dynamic rate limit exceeded', {
        ip: req.ip,
        userId: user?.id,
        subscriptionTier: user?.subscriptionTier,
        currentLimit,
        url: req.url
      })

      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded for your subscription tier',
        statusCode: 429,
        currentLimit,
        upgradeHint: user?.subscriptionTier === 'free' ? 'Upgrade to Basic for higher limits' : 'Upgrade to Pro for higher limits',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
        timestamp: new Date().toISOString()
      })
    }
  })
}

// Rate limiting for specific endpoints
export const endpointRateLimiters = {
  '/api/v1/analyze': analysisRateLimiter,
  '/api/v1/alert': alertRateLimiter,
  '/api/v1/auth': authRateLimiter,
  '/api/v1/subscription': subscriptionRateLimiter,
  '/api/v1/admin': adminRateLimiter
}

// Rate limiting middleware that checks endpoint-specific limits
export const endpointRateLimitMiddleware = (
  req: Request,
  res: Response,
  next: (err?: unknown) => void,
) => {
  switch (req.path) {
    case '/api/v1/analyze':
      return analysisRateLimiter(req, res, next)
    case '/api/v1/alert':
      return alertRateLimiter(req, res, next)
    case '/api/v1/auth':
      return authRateLimiter(req, res, next)
    case '/api/v1/subscription':
      return subscriptionRateLimiter(req, res, next)
    case '/api/v1/admin':
      return adminRateLimiter(req, res, next)
    default:
      next()
  }
}

// Clean up expired rate limit records
export const cleanupRateLimitStore = (): void => {
  const now = Date.now()
  let cleaned = 0

  for (const [key, record] of store.entries()) {
    if (now > record.resetTime) {
      store.delete(key)
      cleaned++
    }
  }

  if (cleaned > 0) {
    logger.debug(`Cleaned up ${cleaned} expired rate limit records`)
  }
}

// Get rate limit statistics
export const getRateLimitStats = () => {
  const stats = {
    totalRecords: store.size,
    recordsByType: {} as Record<string, number>,
    oldestRecord: null as number | null,
    newestRecord: null as number | null
  }

  let oldestTime = Date.now()
  let newestTime = 0

  for (const [key, record] of store.entries()) {
    const type = key.split(':')[0]
    stats.recordsByType[type] = (stats.recordsByType[type] || 0) + 1

    if (record.resetTime < oldestTime) {
      oldestTime = record.resetTime
    }
    if (record.resetTime > newestTime) {
      newestTime = record.resetTime
    }
  }

  stats.oldestRecord = oldestTime === Date.now() ? null : oldestTime
  stats.newestRecord = newestTime

  return stats
}

// Rate limiting for specific token addresses (to prevent abuse)
export const tokenAddressRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: 'Too many requests for this token, please try again later',
  keyGenerator: (req: Request) => {
    const tokenAddress = req.params.tokenAddress || req.body.tokenAddress
    const userId = (req as any).user?.id || req.ip
    return `token:${tokenAddress}:${userId}`
  }
})

// Rate limiting for broadcast operations
export const broadcastRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: 'Too many broadcast requests, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `broadcast:${userId}`
  }
})

// Rate limiting for file uploads
export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 50,
  message: 'Too many upload requests, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `upload:${userId}`
  }
})

// Rate limiting for export operations
export const exportRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: 'Too many export requests, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `export:${userId}`
  }
})

// Rate limiting for API key generation
export const apiKeyRateLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 5,
  message: 'Too many API key generation requests, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `apikey:${userId}`
  }
})

// Rate limiting for password reset
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  message: 'Too many password reset requests, please try again later',
  keyGenerator: (req: Request) => {
    const email = req.body.email || req.ip
    return `passwordreset:${email}`
  }
})

// Rate limiting for email verification
export const emailVerificationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  message: 'Too many email verification requests, please try again later',
  keyGenerator: (req: Request) => {
    const email = req.body.email || req.ip
    return `emailverify:${email}`
  }
})

// Rate limiting for social sharing
export const socialShareRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  message: 'Too many social sharing requests, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `socialshare:${userId}`
  }
})

// Rate limiting for feedback submission
export const feedbackRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: 'Too many feedback submissions, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `feedback:${userId}`
  }
})

// Rate limiting for support tickets
export const supportTicketRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  message: 'Too many support ticket submissions, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || req.ip
    return `support:${userId}`
  }
})
