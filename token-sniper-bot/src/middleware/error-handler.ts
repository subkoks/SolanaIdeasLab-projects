import { NextFunction, Request, Response } from "express";
import { config } from "../config/environment";
import { logger } from "../utils/logger";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  details?: any;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;
  public details: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error("Error occurred:", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    userId: (req as any).user?.id,
  });

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    const message = "Resource not found";
    error = new CustomError(message, 404);
  }

  // Mongoose duplicate key
  if (err.name === "MongoError" && (err as any).code === 11000) {
    const message = "Duplicate field value entered";
    error = new CustomError(message, 400);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = "Validation Error";
    error = new CustomError(message, 400, (err as any).errors);
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    const message = "Invalid token";
    error = new CustomError(message, 401);
  }

  if (err.name === "TokenExpiredError") {
    const message = "Token expired";
    error = new CustomError(message, 401);
  }

  // Prisma errors
  if (err.name === "PrismaClientKnownRequestError") {
    const prismaError = err as any;
    let message = "Database operation failed";
    let statusCode = 500;

    switch (prismaError.code) {
      case "P2002":
        message = "Duplicate entry";
        statusCode = 400;
        break;
      case "P2025":
        message = "Record not found";
        statusCode = 404;
        break;
      case "P2003":
        message = "Foreign key constraint failed";
        statusCode = 400;
        break;
      default:
        message = "Database error";
    }

    error = new CustomError(message, statusCode, prismaError.meta);
  }

  // Rate limit errors
  if (err.name === "TooManyRequests") {
    const message = "Too many requests, please try again later";
    error = new CustomError(message, 429);
  }

  // Validation errors
  if (err.name === "ValidationError" && !!(err as any).details) {
    const message = "Validation failed";
    error = new CustomError(message, 400, (err as any).details);
  }

  // Default to 500 if no status code
  const statusCode = error.statusCode || 500;

  // Don't leak error details in production
  const isDevelopment =
    config.server.host === "localhost" || config.development.enableDebugLogs;

  const response: any = {
    success: false,
    error: error.message || "Internal Server Error",
    statusCode,
    timestamp: new Date().toISOString(),
    path: req.url,
  };

  // Include details in development
  if (isDevelopment && error.details) {
    response.details = error.details;
    response.stack = error.stack;
  }

  // Include request ID if available
  if ((req as any).requestId) {
    response.requestId = (req as any).requestId;
  }

  res.status(statusCode).json(response);
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const error = new CustomError(`Not found - ${req.originalUrl}`, 404);
  next(error);
};

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const validationErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err: any) => ({
      field: err.path,
      message: err.message,
      value: err.value,
    }));

    const response = {
      success: false,
      error: "Validation failed",
      statusCode: 400,
      errors,
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    res.status(400).json(response);
    return;
  }

  next(error);
};

export const rateLimitErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (error.name === "TooManyRequests") {
    const response = {
      success: false,
      error: "Rate limit exceeded",
      statusCode: 429,
      message: "Too many requests, please try again later",
      retryAfter: error.resetTime
        ? Math.ceil((error.resetTime - Date.now()) / 1000)
        : 60,
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    res.status(429).json(response);
    return;
  }

  next(error);
};

export const databaseErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Handle common database errors
  if (error.name === "PrismaClientKnownRequestError") {
    const prismaError = error as any;
    let message = "Database operation failed";
    let statusCode = 500;

    switch (prismaError.code) {
      case "P2002":
        message = "Duplicate entry - this record already exists";
        statusCode = 409;
        break;
      case "P2025":
        message = "Record not found";
        statusCode = 404;
        break;
      case "P2003":
        message = "Referenced record not found";
        statusCode = 400;
        break;
      case "P2014":
        message = "Cannot create record - relation violation";
        statusCode = 400;
        break;
      default:
        message = "Database error occurred";
    }

    const response = {
      success: false,
      error: message,
      statusCode,
      code: prismaError.code,
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    res.status(statusCode).json(response);
    return;
  }

  next(error);
};

export const externalApiErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Handle external API errors (Solana RPC, Helius, etc.)
  if (
    error.isAxiosError ||
    error.code === "ECONNREFUSED" ||
    error.code === "ETIMEDOUT"
  ) {
    const message = "External service unavailable";
    const statusCode = 503;

    const response = {
      success: false,
      error: message,
      statusCode,
      service: error.config?.url || "unknown",
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    res.status(statusCode).json(response);
    return;
  }

  next(error);
};

// Error logging utility
export const logError = (error: Error, context: any = {}): void => {
  logger.error("Application Error:", {
    message: error.message,
    stack: error.stack,
    name: error.name,
    context,
    timestamp: new Date().toISOString(),
  });
};

// Error creation utilities
export const createError = (
  message: string,
  statusCode: number = 500,
  details?: any,
): CustomError => {
  return new CustomError(message, statusCode, details);
};

export const createValidationError = (
  message: string,
  details?: any,
): CustomError => {
  return new CustomError(message, 400, details);
};

export const createNotFoundError = (
  resource: string = "Resource",
): CustomError => {
  return new CustomError(`${resource} not found`, 404);
};

export const createUnauthorizedError = (
  message: string = "Unauthorized",
): CustomError => {
  return new CustomError(message, 401);
};

export const createForbiddenError = (
  message: string = "Forbidden",
): CustomError => {
  return new CustomError(message, 403);
};

export const createConflictError = (
  message: string = "Conflict",
): CustomError => {
  return new CustomError(message, 409);
};

export const createRateLimitError = (
  message: string = "Rate limit exceeded",
): CustomError => {
  return new CustomError(message, 429);
};

export const createServiceUnavailableError = (
  message: string = "Service unavailable",
): CustomError => {
  return new CustomError(message, 503);
};
