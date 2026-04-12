import rateLimit from 'express-rate-limit'
import { config } from '../config/environment'

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
