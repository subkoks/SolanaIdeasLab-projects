import fs from 'node:fs'
import path from 'node:path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { config } from '../config/environment'

const logDirectory = path.dirname(config.logging.filePath)

if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true })
}

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
)

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, stack }) => `${timestamp} [${level}]: ${stack ?? message}`),
)

export const logger = winston.createLogger({
  level: config.logging.level,
  format: jsonFormat,
  defaultMeta: { service: 'token-safety-bot' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      level: config.development.enableDebugLogs ? 'debug' : config.logging.level,
    }),
    new DailyRotateFile({
      filename: config.logging.filePath,
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      level: config.logging.level,
    }),
  ],
})

export const createScopedLogger = (scope: string): winston.Logger => logger.child({ scope })
