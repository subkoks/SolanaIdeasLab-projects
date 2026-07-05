import { Telegraf } from 'telegraf'
import { config, isTelegramEnabled } from '../lib/config'
import { logger } from '../lib/logger'
import { DatabaseService } from '../services/database'
import { SolanaWatcherService } from '../services/solana-watcher'
import { WalletTrackerTelegramBot } from '../services/telegram-bot'

const main = async (): Promise<void> => {
  if (!isTelegramEnabled()) {
    logger.error('TELEGRAM_BOT_TOKEN is required to run the wallet tracker bot')
    process.exit(1)
  }

  const database = new DatabaseService()
  const watcher = new SolanaWatcherService()
  const telegraf = new Telegraf(config.telegram.botToken)
  const bot = new WalletTrackerTelegramBot(telegraf, database, watcher)

  await database.connect()
  bot.registerCommands()
  await bot.launch()

  const poll = setInterval(() => {
    void watcher.pollWatchlist(database, (chatId, message) =>
      bot.notifyChat(chatId, message),
    )
  }, config.watcher.pollIntervalMs)

  const shutdown = async (signal: string) => {
    logger.info('Shutting down wallet tracker bot', { signal })
    clearInterval(poll)
    await bot.stop()
    await database.disconnect()
    process.exit(0)
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error) => {
  logger.error('Wallet tracker bot failed to start', { error })
  process.exit(1)
})
