import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { config } from '../config/environment'

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`
  })
)

export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'token-sniper-bot' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      level: config.development.enableDebugLogs ? 'debug' : 'info'
    }),
    
    new DailyRotateFile({
      filename: config.logging.filePath,
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      level: config.logging.level
    }),
    
    new DailyRotateFile({
      filename: './logs/error.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      level: 'error'
    })
  ],
  
  exceptionHandlers: [
    new DailyRotateFile({
      filename: './logs/exceptions.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles
    })
  ],
  
  rejectionHandlers: [
    new DailyRotateFile({
      filename: './logs/rejections.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles
    })
  ]
})

export const createChildLogger = (service: string) => {
  return logger.child({ service })
}

export const logError = (message: string, error?: any, meta?: any) => {
  logger.error(message, { error, ...meta })
}

export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta)
}

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta)
}

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta)
}
