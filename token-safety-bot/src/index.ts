import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Server } from "node:http";
import { Context, Telegraf, session } from "telegraf";
import { z } from "zod";
import { config } from "./config/environment";
import { authMiddleware } from "./middleware/auth";
import { adminAuthMiddleware } from "./middleware/admin";
import { createScanLimitMiddleware } from "./middleware/scan-limit";
import { errorHandler } from "./middleware/error-handler";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { createDatabaseService } from "./services/database";
import { MonitorService } from "./services/monitor";
import { QueueService } from "./services/queue";
import { SafetyScannerService } from "./services/safety-scanner";
import { SolanaService } from "./services/solana";
import { TelegramBotService } from "./services/telegram-bot";
import type { SubscriptionTier } from "./types/auth";
import {
  getBillingStatus,
  isBillingMockMode,
  resolveCheckoutSession,
} from "./utils/billing";
import { getScanQuota } from "./utils/scan-quota";
import {
  buildTierSyncFromStripeEvent,
  constructStripeEvent,
} from "./utils/stripe-webhook";
import { logger } from "./utils/logger";
import { assertProductionConfig, isProductionRuntime } from "./utils/production-guard";

const walletConnectSchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
  walletAddress: z.string().min(32),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const scanSchema = z.object({
  analysisDepth: z.enum(["quick", "deep", "full"]).optional(),
  tokenAddress: z.string().min(32),
});

const contractAnalysisSchema = z.object({
  analysisType: z.string().min(1).default("security"),
  programId: z.string().min(32),
});

const rugPullSchema = z.object({
  timeWindow: z.number().int().positive().default(3600),
  tokenAddress: z.string().min(32),
});

const alertSchema = z.object({
  alertType: z.string().min(1),
  criteria: z.record(z.string(), z.unknown()).optional(),
  tokenAddress: z.string().min(32),
});

const profileSchema = z.object({
  preferences: z.record(z.string(), z.unknown()).optional(),
});

const upgradeSchema = z.object({
  tier: z.enum(["free", "basic", "pro", "enterprise"]),
});

const blacklistSchema = z.object({
  evidence: z.unknown().optional(),
  reason: z.string().min(1),
  tokenAddress: z.string().min(32),
});

const broadcastSchema = z.object({
  message: z.string().min(1),
  targetTier: z.string().min(1).default("all"),
});

class TokenSafetyBot {
  private readonly app = express();
  private readonly databaseService = createDatabaseService();
  private readonly monitorService: MonitorService;
  private readonly queueService = new QueueService();
  private readonly safetyScannerService: SafetyScannerService;
  private server: Server | null = null;
  private readonly solanaService = new SolanaService();
  private readonly telegramBot: TelegramBotService | null;
  private readonly telegramClient: Telegraf<Context> | null;

  constructor() {
    this.safetyScannerService = new SafetyScannerService(
      this.databaseService,
      this.solanaService,
    );
    this.monitorService = new MonitorService(this.safetyScannerService);

    if (config.telegram.botToken.trim()) {
      this.telegramClient = new Telegraf<Context>(config.telegram.botToken);
      this.telegramClient.use(session());
      this.telegramBot = new TelegramBotService(
        this.telegramClient,
        this.safetyScannerService,
        this.monitorService,
        this.databaseService,
        config.telegram.adminChatIds,
      );
      this.telegramBot.registerCommands();
      this.monitorService.setOnSafetyLevelChange(async (event) => {
        if (!this.telegramBot) {
          return;
        }

        await this.telegramBot.notifyMonitoringChange(
          event.subscriberUserIds,
          event.scan,
          event.previousLevel,
          event.nextLevel,
        );
      });
    } else {
      this.telegramClient = null;
      this.telegramBot = null;
    }

    this.registerStripeWebhook();
    this.setupMiddleware();
    this.setupRoutes();
    this.app.use(errorHandler);
  }

  private registerStripeWebhook(): void {
    this.app.post(
      "/webhook/stripe",
      express.raw({ type: "application/json" }),
      async (req, res) => {
        if (isBillingMockMode(config.stripe.secretKey)) {
          res.status(503).json({
            configured: false,
            message: "Stripe webhook disabled in mock billing mode.",
          });
          return;
        }

        if (!config.stripe.webhookSecret.trim()) {
          res.status(503).json({
            configured: false,
            message: "STRIPE_WEBHOOK_SECRET is not configured.",
          });
          return;
        }

        try {
          const signature = req.headers["stripe-signature"];
          const event = await constructStripeEvent(
            req.body as Buffer,
            typeof signature === "string" ? signature : undefined,
            config.stripe.secretKey,
            config.stripe.webhookSecret,
          );

          const sync = buildTierSyncFromStripeEvent(
            event,
            config.stripe.prices,
          );

          if (sync) {
            await this.databaseService.syncSubscriptionFromStripe(
              sync.userId,
              sync.tier,
              sync.stripeSubscriptionId,
              sync.status,
            );
            logger.info("Stripe tier synced", {
              userId: sync.userId,
              tier: sync.tier,
              status: sync.status,
              eventType: event.type,
            });
          }

          res.json({ received: true, synced: Boolean(sync), type: event.type });
        } catch (error) {
          logger.error("Stripe webhook failed", { error });
          res.status(400).json({
            error:
              error instanceof Error ? error.message : "Stripe webhook failed",
          });
        }
      },
    );
  }

  private setupMiddleware(): void {
    if (isProductionRuntime()) {
      this.app.set("trust proxy", 1);
    }

    this.app.use(
      cors({
        origin:
          config.server.corsOrigin === "*" ? true : config.server.corsOrigin,
      }),
    );
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(express.json({ limit: "100kb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "100kb" }));
    this.app.use(rateLimitMiddleware());
  }

  private setupRoutes(): void {
    this.app.get("/health", async (_req, res) => {
      res.json(await this.getHealthStatus());
    });

    this.app.get("/ready", async (_req, res) => {
      const ready = await this.getReadinessStatus();
      res.status(ready.ready ? 200 : 503).json(ready);
    });

    this.app.post("/api/v1/auth/wallet/connect", async (req, res, next) => {
      try {
        const { message, signature, walletAddress } = walletConnectSchema.parse(
          req.body,
        );
        res.json(
          await this.databaseService.authenticateWallet(
            walletAddress,
            signature,
            message,
          ),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.post("/api/v1/auth/refresh", async (req, res, next) => {
      try {
        const { refreshToken } = refreshTokenSchema.parse(req.body);
        res.json(await this.databaseService.refreshToken(refreshToken));
      } catch (error) {
        next(error);
      }
    });

    this.app.get("/api/v1/billing/status", (_req, res) => {
      res.json(getBillingStatus(config.stripe.secretKey));
    });

    this.app.post(
      "/api/v1/billing/checkout",
      authMiddleware,
      async (req, res, next) => {
        try {
          const { tier } = upgradeSchema.parse(req.body);
          if (tier === "free") {
            res.status(400).json({ error: "Free tier does not require checkout" });
            return;
          }

          const session = await resolveCheckoutSession(
            config.stripe.secretKey,
            config.stripe.prices,
            {
              tier,
              userId: req.user!.id,
              successUrl:
                typeof req.body?.successUrl === "string"
                  ? req.body.successUrl
                  : undefined,
              cancelUrl:
                typeof req.body?.cancelUrl === "string"
                  ? req.body.cancelUrl
                  : undefined,
            },
          );

          if (session.mode === "stripe" && "error" in session) {
            res.status(session.error.includes("not configured") ? 501 : 502).json(session);
            return;
          }

          res.json(session);
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.post(
      "/api/v1/scan",
      authMiddleware,
      createScanLimitMiddleware(this.databaseService),
      async (req, res, next) => {
      try {
        const { analysisDepth = "quick", tokenAddress } = scanSchema.parse(
          req.body,
        );
        res.json(
          await this.safetyScannerService.scanToken(
            tokenAddress,
            analysisDepth,
            req.user?.id,
          ),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.get("/api/v1/scan/:tokenAddress", async (req, res, next) => {
      try {
        const tokenAddress = z.string().min(32).parse(req.params.tokenAddress);
        res.json(await this.safetyScannerService.getLatestScan(tokenAddress));
      } catch (error) {
        next(error);
      }
    });

    this.app.get(
      "/api/v1/safety/score/:tokenAddress",
      async (req, res, next) => {
        try {
          const tokenAddress = z
            .string()
            .min(32)
            .parse(req.params.tokenAddress);
          res.json(
            await this.safetyScannerService.getSafetyScore(tokenAddress),
          );
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/safety/report/:tokenAddress",
      async (req, res, next) => {
        try {
          const tokenAddress = z
            .string()
            .min(32)
            .parse(req.params.tokenAddress);
          res.json(
            await this.safetyScannerService.generateReport(tokenAddress),
          );
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.post("/api/v1/safety/contract/analyze", async (req, res, next) => {
      try {
        const { analysisType, programId } = contractAnalysisSchema.parse(
          req.body,
        );
        res.json(
          await this.safetyScannerService.analyzeContract(
            programId,
            analysisType,
          ),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.post("/api/v1/safety/rug-pull/detect", async (req, res, next) => {
      try {
        const { timeWindow, tokenAddress } = rugPullSchema.parse(req.body);
        res.json(
          await this.safetyScannerService.detectRugPullRisk(
            tokenAddress,
            timeWindow,
          ),
        );
      } catch (error) {
        next(error);
      }
    });

    this.app.post(
      "/api/v1/monitor/:tokenAddress",
      authMiddleware,
      async (req, res, next) => {
        try {
          const tokenAddress = z
            .string()
            .min(32)
            .parse(req.params.tokenAddress);
          res.json(
            await this.monitorService.startMonitoring(
              tokenAddress,
              req.user!.id,
            ),
          );
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/monitor/:tokenAddress",
      authMiddleware,
      async (req, res, next) => {
        try {
          const tokenAddress = z
            .string()
            .min(32)
            .parse(req.params.tokenAddress);
          res.json(await this.monitorService.getMonitoringStatus(tokenAddress));
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.delete(
      "/api/v1/monitor/:tokenAddress",
      authMiddleware,
      async (req, res, next) => {
        try {
          const tokenAddress = z
            .string()
            .min(32)
            .parse(req.params.tokenAddress);
          await this.monitorService.stopMonitoring(tokenAddress, req.user!.id);
          res.json({ success: true });
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/users/quota",
      authMiddleware,
      async (req, res, next) => {
        try {
          const scans = await this.databaseService.getUserScans(req.user!.id);
          res.json(
            getScanQuota(req.user!.subscriptionTier, scans, req.user!.id),
          );
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/users/profile",
      authMiddleware,
      async (req, res, next) => {
        try {
          res.json(await this.databaseService.getUserProfile(req.user!.id));
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.put(
      "/api/v1/users/profile",
      authMiddleware,
      async (req, res, next) => {
        try {
          const body = profileSchema.parse(req.body);
          res.json(
            await this.databaseService.updateUserProfile(req.user!.id, body),
          );
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/users/scans",
      authMiddleware,
      async (req, res, next) => {
        try {
          res.json(await this.databaseService.getUserScans(req.user!.id));
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/users/alerts",
      authMiddleware,
      async (req, res, next) => {
        try {
          res.json(await this.databaseService.getUserAlerts(req.user!.id));
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.post(
      "/api/v1/users/alerts",
      authMiddleware,
      async (req, res, next) => {
        try {
          const body = alertSchema.parse(req.body);
          res.json(await this.databaseService.createAlert(req.user!.id, body));
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.delete(
      "/api/v1/users/alerts/:alertId",
      authMiddleware,
      async (req, res, next) => {
        try {
          const alertId = z.string().min(1).parse(req.params.alertId);
          await this.databaseService.deleteAlert(req.user!.id, alertId);
          res.json({ success: true });
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.post(
      "/api/v1/users/upgrade",
      authMiddleware,
      async (req, res, next) => {
        try {
          const { tier } = upgradeSchema.parse(req.body);
          const subscription = await this.databaseService.upgradeSubscription(
            req.user!.id,
            tier as SubscriptionTier,
          );
          res.json({
            subscription,
            billing: getBillingStatus(config.stripe.secretKey),
          });
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/admin/stats",
      authMiddleware,
      adminAuthMiddleware,
      async (_req, res, next) => {
        try {
          res.json(await this.getAdminStats());
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.post(
      "/api/v1/admin/broadcast",
      authMiddleware,
      adminAuthMiddleware,
      async (req, res, next) => {
        try {
          const { message, targetTier } = broadcastSchema.parse(req.body);

          if (!this.telegramBot) {
            res.json({ configured: false, sent: 0, targetTier });
            return;
          }

          res.json(
            await this.telegramBot.broadcastSafetyAlert(message, targetTier),
          );
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/admin/scans",
      authMiddleware,
      adminAuthMiddleware,
      async (_req, res, next) => {
        try {
          res.json(await this.databaseService.getAllScans());
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.post(
      "/api/v1/admin/blacklist",
      authMiddleware,
      adminAuthMiddleware,
      async (req, res, next) => {
        try {
          const { evidence, reason, tokenAddress } = blacklistSchema.parse(
            req.body,
          );
          res.json(
            await this.databaseService.blacklistToken(
              tokenAddress,
              reason,
              evidence,
            ),
          );
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.get(
      "/api/v1/admin/blacklist",
      authMiddleware,
      adminAuthMiddleware,
      async (_req, res, next) => {
        try {
          res.json(await this.databaseService.getBlacklistedTokens());
        } catch (error) {
          next(error);
        }
      },
    );

    this.app.post("/webhook/telegram", async (req, res, next) => {
      try {
        if (!this.telegramClient) {
          res.status(503).json({ error: "Telegram bot is not configured" });
          return;
        }

        await this.telegramClient.handleUpdate(req.body);
        res.sendStatus(200);
      } catch (error) {
        next(error);
      }
    });
  }

  private async getReadinessStatus(): Promise<{
    ready: boolean;
    timestamp: string;
    checks: {
      database: boolean;
      queue: boolean;
      solana: boolean;
    };
  }> {
    const [databaseHealthy, queueHealthy, solanaHealthy] = await Promise.all([
      this.databaseService.healthCheck(),
      this.queueService.healthCheck(),
      this.solanaService.healthCheck(),
    ]);

    const ready = databaseHealthy && queueHealthy && solanaHealthy;

    return {
      ready,
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseHealthy,
        queue: queueHealthy,
        solana: solanaHealthy,
      },
    };
  }

  private async getHealthStatus(): Promise<{
    metrics: {
      activeConnections: number;
      monitoringTokens: number;
      queueSize: number;
      uptimeSeconds: number;
    };
    runtime: {
      nodeEnv: string;
      productionGuard: boolean;
    };
    services: {
      database: string;
      queue: string;
      solana: string;
      telegram: string;
    };
    status: string;
    timestamp: string;
  }> {
    const [databaseHealthy, queueHealthy, solanaHealthy] = await Promise.all([
      this.databaseService.healthCheck(),
      this.queueService.healthCheck(),
      this.solanaService.healthCheck(),
    ]);

    return {
      status:
        databaseHealthy && queueHealthy && solanaHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      runtime: {
        nodeEnv: process.env.NODE_ENV ?? "development",
        productionGuard: isProductionRuntime(),
      },
      services: {
        database: databaseHealthy ? "healthy" : "unhealthy",
        queue: queueHealthy ? "healthy" : "unhealthy",
        solana: solanaHealthy ? "healthy" : "unhealthy",
        telegram: this.telegramBot ? "configured" : "disabled",
      },
      metrics: {
        uptimeSeconds: Math.round(process.uptime()),
        activeConnections: await this.queueService.getActiveConnections(),
        queueSize: await this.queueService.getQueueSize(),
        monitoringTokens: await this.monitorService.getActiveMonitoringCount(),
      },
    };
  }

  private async getAdminStats(): Promise<{
    alerts: { active: number; total: number };
    detections: { dangerous: number; risky: number; total: number };
    performance: {
      averageScanTime: number;
      detectionRate: number;
      falsePositiveRate: number;
      scanAccuracy: number;
    };
    scans: { averageScore: number; total: number };
    users: { active: number; premium: number; total: number };
  }> {
    const [
      users,
      scans,
      alerts,
      detections,
      scanAccuracy,
      averageScanTime,
      detectionRate,
      falsePositiveRate,
    ] = await Promise.all([
      this.databaseService.getUserStats(),
      this.databaseService.getScanStats(),
      this.databaseService.getAlertStats(),
      this.databaseService.getDetectionStats(),
      this.databaseService.getScanAccuracy(),
      this.databaseService.getAverageScanTime(),
      this.databaseService.getDetectionRate(),
      this.databaseService.getFalsePositiveRate(),
    ]);

    return {
      users,
      scans,
      alerts,
      detections,
      performance: {
        scanAccuracy,
        averageScanTime,
        detectionRate,
        falsePositiveRate,
      },
    };
  }

  public async start(): Promise<void> {
    assertProductionConfig();

    await this.databaseService.connect();
    await this.queueService.connect();
    await this.solanaService.connect();
    this.queueService.startProcessors();
    await this.monitorService.start();

    if (this.telegramClient) {
      await this.telegramClient.launch();
      logger.info("Telegram bot launched", {
        username: config.telegram.botUsername,
      });
    } else {
      logger.warn(
        "Telegram bot disabled because TELEGRAM_BOT_TOKEN is not set",
      );
    }

    await new Promise<void>((resolve) => {
      this.server = this.app.listen(
        config.server.port,
        config.server.host,
        () => {
          logger.info("Token Safety Bot server started", {
            host: config.server.host,
            port: config.server.port,
          });
          resolve();
        },
      );
    });
  }

  public async stop(): Promise<void> {
    await this.monitorService.stop();
    await this.queueService.disconnect();
    await this.solanaService.disconnect();
    await this.databaseService.disconnect();

    if (this.telegramClient) {
      this.telegramClient.stop("shutdown");
    }

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      this.server = null;
    }
  }
}

const app = new TokenSafetyBot();

const shutdown = async (signal: string): Promise<void> => {
  logger.info("Shutdown signal received", { signal });
  await app.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void app.start().catch((error) => {
  logger.error("Failed to start Token Safety Bot", { error });
  process.exit(1);
});
