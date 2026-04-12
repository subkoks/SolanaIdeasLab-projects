import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { logger } from '../utils/logger'

export class AppError extends Error {
  public readonly statusCode: number
  public readonly details?: unknown

  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.details = details
  }
}

export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: error.flatten(),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    })
    return
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    })
    return
  }

  logger.error('Unhandled application error', {
    error,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
  })

  res.status(500).json({
    error: 'Internal server error',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  })
}
