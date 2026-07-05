import type { Commitment } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_PORT = 3000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 120;
const DEFAULT_SCAN_CACHE_TTL_MS = 300_000;
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_DATA_STORE_PATH = "./data/token-safety-store.json";

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCommitment = (value: string | undefined): Commitment => {
  if (value === "processed" || value === "confirmed" || value === "finalized") {
    return value;
  }

  return "confirmed";
};

const parseWalletAddresses = (
  value: string | undefined,
): ReadonlySet<string> => {
  const addresses = new Set<string>();
  if (!value?.trim()) {
    return addresses;
  }
  for (const part of value.split(/[\s,]+/)) {
    if (part.trim()) {
      addresses.add(part.trim());
    }
  }
  return addresses;
};

const parseTelegramAdminChatIds = (
  value: string | undefined,
): ReadonlySet<number> => {
  const ids = new Set<number>();
  if (!value?.trim()) {
    return ids;
  }
  for (const part of value.split(/[\s,]+/)) {
    if (!part) {
      continue;
    }
    const n = Number(part);
    if (Number.isFinite(n)) {
      ids.add(Math.trunc(n));
    }
  }
  return ids;
};

export const config = {
  server: {
    port: parseNumber(process.env.PORT, DEFAULT_PORT),
    host: process.env.HOST ?? "0.0.0.0",
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    rateLimitWindowMs: parseNumber(
      process.env.RATE_LIMIT_WINDOW_MS,
      DEFAULT_RATE_LIMIT_WINDOW_MS,
    ),
    rateLimitMaxRequests: parseNumber(
      process.env.RATE_LIMIT_MAX_REQUESTS,
      DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    ),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? "token-safety-bot-dev-secret",
    accessTokenTtl: process.env.JWT_ACCESS_TTL ?? "1h",
    refreshTokenTtl: process.env.JWT_REFRESH_TTL ?? "7d",
    adminWalletAddresses: parseWalletAddresses(
      process.env.ADMIN_WALLET_ADDRESSES,
    ),
    skipWalletSignatureVerify:
      process.env.SKIP_WALLET_SIGNATURE_VERIFY === "true",
  },
  telegram: {
    adminChatIds: parseTelegramAdminChatIds(
      process.env.TELEGRAM_ADMIN_CHAT_IDS,
    ),
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "token_safety_bot",
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? "",
  },
  database: {
    url: process.env.DATABASE_URL ?? "",
    redisUrl: process.env.REDIS_URL ?? "",
    storageFilePath: process.env.DATA_STORE_PATH ?? DEFAULT_DATA_STORE_PATH,
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    commitment: parseCommitment(process.env.SOLANA_COMMITMENT),
  },
  queue: {
    redisUrl: process.env.QUEUE_REDIS_URL ?? process.env.REDIS_URL ?? "",
  },
  logging: {
    level: process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL,
    filePath: process.env.LOG_FILE_PATH ?? "./logs/token-safety-bot.log",
    maxSize: process.env.LOG_MAX_SIZE ?? "20m",
    maxFiles: process.env.LOG_MAX_FILES ?? "14d",
  },
  development: {
    enableDebugLogs: process.env.ENABLE_DEBUG_LOGS === "true",
    skipAuthInDev: process.env.SKIP_AUTH_IN_DEV === "true",
  },
  monitoring: {
    scanCacheTtlMs: parseNumber(
      process.env.SCAN_CACHE_TTL_MS,
      DEFAULT_SCAN_CACHE_TTL_MS,
    ),
    rescanIntervalMs: parseNumber(
      process.env.MONITOR_RESCAN_INTERVAL_MS,
      300_000,
    ),
  },
} as const;
