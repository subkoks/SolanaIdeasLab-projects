import dotenv from "dotenv";

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseWalletAddresses = (value: string | undefined): string[] => {
  if (!value?.trim()) {
    return [];
  }

  return value.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
};

export const config = {
  server: {
    port: parseNumber(process.env.PORT, 8000),
    host: process.env.HOST ?? "0.0.0.0",
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? "",
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "token_sniper_bot",
  },

  database: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:password@localhost:5432/token_sniper",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  },

  solana: {
    rpcUrl:
      process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    commitment: process.env.SOLANA_COMMITMENT ?? "confirmed",
    network: process.env.SOLANA_NETWORK ?? "mainnet-beta",
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? "token-sniper-bot-dev-secret",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "24h",
    refreshSecret:
      process.env.REFRESH_TOKEN_SECRET ?? "token-sniper-bot-dev-refresh",
  },

  auth: {
    adminWalletAddresses: parseWalletAddresses(
      process.env.ADMIN_WALLET_ADDRESSES,
    ),
    skipWalletSignatureVerify:
      process.env.SKIP_WALLET_SIGNATURE_VERIFY === "true",
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    prices: {
      basic: process.env.STRIPE_PRICE_BASIC ?? "",
      pro: process.env.STRIPE_PRICE_PRO ?? "",
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? "",
    },
  },

  externalApis: {
    helius: process.env.HELIUS_API_KEY ?? "",
    heliusWebhookSecret: process.env.HELIUS_WEBHOOK_SECRET ?? "",
    pumpFun: process.env.PUMP_FUN_API_KEY ?? "",
    jupiter: process.env.JUPITER_API_KEY ?? "",
    twitter: process.env.TWITTER_BEARER_TOKEN ?? "",
    dexScreener: process.env.DEXSCREENER_API_KEY ?? "",
    coingecko: process.env.COINGECKO_API_KEY ?? "",
  },

  logging: {
    level: process.env.LOG_LEVEL ?? "info",
    filePath: process.env.LOG_FILE_PATH ?? "./logs/app.log",
    maxSize: process.env.LOG_MAX_SIZE ?? "20m",
    maxFiles: process.env.LOG_MAX_FILES ?? "14d",
  },

  rateLimit: {
    windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 900_000),
    maxRequests: parseNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    telegramWindowMs: parseNumber(
      process.env.RATE_LIMIT_TELEGRAM_WINDOW_MS,
      60_000,
    ),
    telegramMaxRequests: parseNumber(
      process.env.RATE_LIMIT_TELEGRAM_MAX_REQUESTS,
      30,
    ),
  },

  queue: {
    redisUrl:
      process.env.QUEUE_REDIS_URL ??
      process.env.REDIS_URL ??
      "redis://localhost:6379",
    defaultJobOptions: {
      attempts: parseNumber(
        process.env.QUEUE_DEFAULT_JOB_OPTIONS_ATTEMPTS,
        3,
      ),
      backoff:
        process.env.QUEUE_DEFAULT_JOB_OPTIONS_BACKOFF ?? "exponential",
    },
  },

  features: {
    bundleDetection: process.env.ENABLE_BUNDLE_DETECTION !== "false",
    whaleTracking: process.env.ENABLE_WHALE_TRACKING !== "false",
    socialSentiment: process.env.ENABLE_SOCIAL_SENTIMENT === "true",
    riskScoring: process.env.ENABLE_RISK_SCORING !== "false",
    premiumFeatures: process.env.ENABLE_PREMIUM_FEATURES === "true",
    laserStream: process.env.ENABLE_LASERSTREAM !== "false",
  },

  performance: {
    cacheTtlTokenAnalysis: parseNumber(
      process.env.CACHE_TTL_TOKEN_ANALYSIS,
      3600,
    ),
    cacheTtlRiskScores: parseNumber(process.env.CACHE_TTL_RISK_SCORES, 1800),
    cacheTtlUserData: parseNumber(process.env.CACHE_TTL_USER_DATA, 900),
    maxConcurrentAnalysis: parseNumber(
      process.env.MAX_CONCURRENT_ANALYSIS,
      10,
    ),
    analysisTimeoutMs: parseNumber(process.env.ANALYSIS_TIMEOUT_MS, 30_000),
  },

  monitoring: {
    prometheusPort: parseNumber(process.env.PROMETHEUS_PORT, 9464),
    grafanaPassword: process.env.GRAFANA_ADMIN_PASSWORD ?? "admin",
    metricsCollectionInterval: parseNumber(
      process.env.METRICS_COLLECTION_INTERVAL,
      30_000,
    ),
    launchPollIntervalMs: parseNumber(
      process.env.LAUNCH_POLL_INTERVAL_MS,
      30_000,
    ),
    alertDedupeMs: parseNumber(process.env.ALERT_DEDUPE_MS, 300_000),
    alertRateWindowMs: parseNumber(process.env.ALERT_RATE_WINDOW_MS, 60_000),
    alertRateMaxPerChat: parseNumber(process.env.ALERT_RATE_MAX_PER_CHAT, 10),
  },

  development: {
    enableSwagger: process.env.ENABLE_SWAGGER === "true",
    enableDebugLogs: process.env.ENABLE_DEBUG_LOGS === "true",
    mockExternalApis: process.env.MOCK_EXTERNAL_APIS === "true",
    skipAuthInDev: process.env.SKIP_AUTH_IN_DEV === "true",
    enableTestEndpoints: process.env.ENABLE_TEST_ENDPOINTS === "true",
  },

  dashboard: {
    accessToken: process.env.DASHBOARD_ACCESS_TOKEN ?? "",
  },
} as const;

export const isTelegramEnabled = (): boolean =>
  config.telegram.botToken.trim().length > 0;
