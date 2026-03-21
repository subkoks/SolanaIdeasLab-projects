import dotenv from 'dotenv'

dotenv.config()

export const config = {
  server: {
    port: parseInt(process.env.PORT || '8000'),
    host: process.env.HOST || 'localhost'
  },
  
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL!,
    botUsername: process.env.TELEGRAM_BOT_USERNAME!
  },
  
  database: {
    url: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL!
  },
  
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL!,
    commitment: process.env.SOLANA_COMMITMENT || 'confirmed',
    network: process.env.SOLANA_NETWORK || 'mainnet-beta'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET!
  },
  
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    prices: {
      basic: process.env.STRIPE_PRICE_BASIC!,
      pro: process.env.STRIPE_PRICE_PRO!,
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE!
    }
  },
  
  externalApis: {
    helius: process.env.HELIUS_API_KEY!,
    pumpFun: process.env.PUMP_FUN_API_KEY!,
    jupiter: process.env.JUPITER_API_KEY!,
    twitter: process.env.TWITTER_BEARER_TOKEN!,
    dexScreener: process.env.DEXSCREENER_API_KEY!,
    coingecko: process.env.COINGECKO_API_KEY!
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs/app.log',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d'
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    telegramWindowMs: parseInt(process.env.RATE_LIMIT_TELEGRAM_WINDOW_MS || '60000'),
    telegramMaxRequests: parseInt(process.env.RATE_LIMIT_TELEGRAM_MAX_REQUESTS || '30')
  },
  
  queue: {
    redisUrl: process.env.QUEUE_REDIS_URL || process.env.REDIS_URL!,
    defaultJobOptions: {
      attempts: parseInt(process.env.QUEUE_DEFAULT_JOB_OPTIONS_ATTEMPTS || '3'),
      backoff: process.env.QUEUE_DEFAULT_JOB_OPTIONS_BACKOFF || 'exponential'
    }
  },
  
  features: {
    bundleDetection: process.env.ENABLE_BUNDLE_DETECTION === 'true',
    whaleTracking: process.env.ENABLE_WHALE_TRACKING === 'true',
    socialSentiment: process.env.ENABLE_SOCIAL_SENTIMENT === 'true',
    riskScoring: process.env.ENABLE_RISK_SCORING === 'true',
    premiumFeatures: process.env.ENABLE_PREMIUM_FEATURES === 'true'
  },
  
  performance: {
    cacheTtlTokenAnalysis: parseInt(process.env.CACHE_TTL_TOKEN_ANALYSIS || '3600'),
    cacheTtlRiskScores: parseInt(process.env.CACHE_TTL_RISK_SCORES || '1800'),
    cacheTtlUserData: parseInt(process.env.CACHE_TTL_USER_DATA || '900'),
    maxConcurrentAnalysis: parseInt(process.env.MAX_CONCURRENT_ANALYSIS || '10'),
    analysisTimeoutMs: parseInt(process.env.ANALYSIS_TIMEOUT_MS || '30000')
  },
  
  monitoring: {
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9464'),
    grafanaPassword: process.env.GRAFANA_ADMIN_PASSWORD || 'admin',
    metricsCollectionInterval: parseInt(process.env.METRICS_COLLECTION_INTERVAL || '30000')
  },
  
  development: {
    enableSwagger: process.env.ENABLE_SWAGGER === 'true',
    enableDebugLogs: process.env.ENABLE_DEBUG_LOGS === 'true',
    mockExternalApis: process.env.MOCK_EXTERNAL_APIS === 'true',
    skipAuthInDev: process.env.SKIP_AUTH_IN_DEV === 'true',
    enableTestEndpoints: process.env.ENABLE_TEST_ENDPOINTS === 'true'
  }
}
