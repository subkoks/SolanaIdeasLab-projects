import { Telegraf } from 'telegraf'
import { config, isTelegramEnabled } from '../lib/config'
import { logger } from '../lib/logger'
import { DatabaseService } from '../services/database'
import { SolanaWatcherService } from '../services/solana-watcher'
import { WalletTrackerTelegramBot } from '../services/telegram-bot'
import { assertWalletDeliveryReady } from '../lib/wallet-delivery-gate'

interface WalletRuntime {
  database: Pick<DatabaseService, 'connect' | 'deliveryLedger' | 'disconnect'>
  watcher: Pick<SolanaWatcherService, 'pollWatchlist'>
  bot: Pick<WalletTrackerTelegramBot, 'registerCommands' | 'launch' | 'stop' | 'notifyChat'>
}

interface RuntimeOptions {
  pollIntervalMs?: number
  registerSignals?: boolean
  exit?: (code: number) => never
}

export const startWalletRuntime = async (
  runtime: WalletRuntime,
  options: RuntimeOptions = {},
): Promise<void> => {
  const { database, watcher, bot } = runtime
  const exit = options.exit ?? process.exit
  const pollIntervalMs = options.pollIntervalMs ?? config.watcher.pollIntervalMs

  await database.connect()
  bot.registerCommands()

  let activePoll: Promise<void> | undefined
  const runPoll = (): void => {
    if (activePoll) return
    const poll = watcher.pollWatchlist(database.deliveryLedger, (chatId, message) =>
      bot.notifyChat(chatId, message),
    ).catch(() => {
      logger.error('Wallet delivery poll held; durable claims retained')
    }).finally(() => {
      if (activePoll === poll) activePoll = undefined
    })
    activePoll = poll
  }
  const timer = setInterval(runPoll, pollIntervalMs)

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down wallet tracker bot', { signal })
    clearInterval(timer)
    await activePoll
    await bot.stop()
    await database.disconnect()
    exit(0)
  }
  const onSigint = (): void => void shutdown('SIGINT')
  const onSigterm = (): void => void shutdown('SIGTERM')
  if (options.registerSignals !== false) {
    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigterm)
  }

  runPoll()
  try {
    await bot.launch()
  } catch (error) {
    clearInterval(timer)
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    await activePoll
    await database.disconnect()
    throw error
  }
}

export const main = async (): Promise<void> => {
  assertWalletDeliveryReady()
  if (!isTelegramEnabled()) {
    logger.error('TELEGRAM_BOT_TOKEN is required to run the wallet tracker bot')
    process.exit(1)
  }

  const database = new DatabaseService()
  const watcher = new SolanaWatcherService()
  const telegraf = new Telegraf(config.telegram.botToken)
  const bot = new WalletTrackerTelegramBot(telegraf, database, watcher)

  await startWalletRuntime({ database, watcher, bot })
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('Wallet tracker bot failed to start', { error })
    process.exit(1)
  })
}
