import rateLimit from 'express-rate-limit'
import { config } from '../config/environment'

const RISK_ENDPOINT_MAX_REQUESTS = 30

export const rateLimitMiddleware = (): ReturnType<typeof rateLimit> => rateLimit({
  windowMs: config.server.rateLimitWindowMs,
  max: config.server.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    retryAfterSeconds: Math.ceil(config.server.rateLimitWindowMs / 1000),
  },
})

export const riskRateLimitMiddleware = (): ReturnType<typeof rateLimit> => rateLimit({
  windowMs: config.server.rateLimitWindowMs,
  max: Math.min(config.server.rateLimitMaxRequests, RISK_ENDPOINT_MAX_REQUESTS),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Risk endpoint rate limit exceeded',
    retryAfterSeconds: Math.ceil(config.server.rateLimitWindowMs / 1000),
  },
})
