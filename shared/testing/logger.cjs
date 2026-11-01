// Keep ordinary bot suites from opening the developer's rotating log files.
// The mock records structured events for middleware assertions.
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(() => logger),
}
module.exports = {
  logger,
  createScopedLogger: () => logger,
  createChildLogger: () => logger,
  logDebug: (...args) => logger.debug(...args),
  logInfo: (...args) => logger.info(...args),
  logWarn: (...args) => logger.warn(...args),
  logError: (...args) => logger.error(...args),
}
