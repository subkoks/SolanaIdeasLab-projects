import dotenv from 'dotenv'

dotenv.config()

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? 'wallet_tracker_pro',
  },
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:password@localhost:5432/wallet_tracker',
  },
  solana: {
    rpcUrl:
      process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
    commitment: process.env.SOLANA_COMMITMENT ?? 'confirmed',
  },
  watcher: {
    pollIntervalMs: parseNumber(process.env.WATCHER_POLL_INTERVAL_MS, 30_000),
    maxWatchesPerSubscriber: parseNumber(process.env.MAX_WATCHES_PER_USER, 10),
    signatureBatchSize: parseNumber(process.env.WATCHER_SIGNATURE_BATCH, 10),
  },
  analytics: {
    mockSolUsdPrice: parseNumber(process.env.MOCK_SOL_USD_PRICE, 150),
    coingeckoApiKey: process.env.COINGECKO_API_KEY ?? '',
    preferMockSolPrice: process.env.PREFER_MOCK_SOL_PRICE === 'true',
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
} as const

export const isTelegramEnabled = (): boolean =>
  config.telegram.botToken.trim().length > 0
