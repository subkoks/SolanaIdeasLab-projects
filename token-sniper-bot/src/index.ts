import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Telegraf, session } from "telegraf";
import { config, isTelegramEnabled } from "./config/environment";
import type { AuthenticatedRequest } from "./middleware/auth";
import { adminAuthMiddleware, authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import { globalRateLimiter } from "./middleware/rate-limit";
import { DatabaseService } from "./services/database";
import { HeliusService } from "./services/helius";
import { MonitorService } from "./services/monitor";
import { QueueService } from "./services/queue";
import { RiskScoringService } from "./services/risk-scoring";
import { TelegramBotService } from "./services/telegram-bot";
import { logger } from "./utils/logger";

class TokenSniperBot {
  private app: express.Application;
  private bot: Telegraf | null = null;
  private db: DatabaseService;
  private helius: HeliusService;
  private riskScorer: RiskScoringService;
  private telegramBot: TelegramBotService | null = null;
  private queue: QueueService;
  private monitor: MonitorService;

  constructor() {
    this.app = express();
    this.db = new DatabaseService();
    this.helius = new HeliusService();
    this.riskScorer = new RiskScoringService(this.helius, this.db);
    this.queue = new QueueService();
    this.monitor = new MonitorService(this.db, this.helius, this.riskScorer);

    if (isTelegramEnabled()) {
      this.bot = new Telegraf(config.telegram.botToken);
      this.telegramBot = new TelegramBotService(this.bot);
    }

    this.setupMiddleware();
    this.setupRoutes();
    this.setupTelegramBot();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(globalRateLimiter);
    this.app.use(cors());
    this.app.use(helmet());
    this.app.use(compression());
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", async (req, res) => {
      try {
        const health = await this.getHealthStatus();
        res.json(health);
      } catch (error) {
        res
          .status(500)
          .json({ status: "error", message: "Health check failed" });
      }
    });

    // API routes
    this.app.use("/api/v1/auth", this.authRoutes());
    this.app.use("/api/v1/tokens", this.tokenRoutes());
    this.app.use("/api/v1/alerts", this.alertRoutes());
    this.app.use("/api/v1/users", authMiddleware, this.userRoutes());

    // Webhook for Telegram
    this.app.post("/webhook/telegram", (req, res) => {
      if (!this.bot) {
        res.status(503).json({ error: "Telegram bot is not configured" });
        return;
      }

      this.bot.handleUpdate(req.body);
      res.sendStatus(200);
    });

    // Admin routes (protected)
    this.app.use("/api/v1/admin", authMiddleware, adminAuthMiddleware, this.adminRoutes());
  }

  private setupTelegramBot(): void {
    if (!this.bot || !this.telegramBot) {
      logger.warn(
        "Telegram bot disabled because TELEGRAM_BOT_TOKEN is not set",
      );
      return;
    }

    // Session middleware for bot
    this.bot.use(session());

    // Register bot commands
    this.telegramBot.registerCommands();

    // Start bot
    this.bot.launch().catch((error) => {
      logger.error("Failed to start Telegram bot:", error);
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception:", error);
      process.exit(1);
    });
  }

  private authRoutes(): express.Router {
    const router = express.Router();

    router.post("/wallet/connect", async (req, res) => {
      try {
        const { walletAddress, signature } = req.body;
        const auth = await this.db.authenticateWallet(walletAddress, signature);
        res.json(auth);
      } catch (error) {
        res.status(401).json({ error: "Authentication failed" });
      }
    });

    router.post("/refresh", async (req, res) => {
      try {
        const { refreshToken } = req.body;
        const auth = await this.db.refreshToken(refreshToken);
        res.json(auth);
      } catch (error) {
        res.status(401).json({ error: "Token refresh failed" });
      }
    });

    return router;
  }

  private tokenRoutes(): express.Router {
    const router = express.Router();

    router.post("/analyze", async (req, res) => {
      try {
        const { tokenAddress, analysisDepth = "quick" } = req.body;
        const analysis = await this.riskScorer.analyzeToken(
          tokenAddress,
          analysisDepth,
        );
        res.json(analysis);
      } catch (error) {
        res.status(500).json({ error: "Token analysis failed" });
      }
    });

    router.get("/:tokenAddress/score", async (req, res) => {
      try {
        const { tokenAddress } = req.params;
        const score = await this.riskScorer.getRiskScore(tokenAddress);
        res.json(score);
      } catch (error) {
        res.status(404).json({ error: "Token not found" });
      }
    });

    router.get("/:tokenAddress/bundles", async (req, res) => {
      try {
        const { tokenAddress } = req.params;
        const bundles = await this.riskScorer.detectBundles(tokenAddress);
        res.json(bundles);
      } catch (error) {
        res.status(500).json({ error: "Bundle detection failed" });
      }
    });

    return router;
  }

  private alertRoutes(): express.Router {
    const router = express.Router();

    router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.user!.id;
        const alerts = await this.db.getUserAlerts(userId);
        res.json(alerts);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch alerts" });
      }
    });

    router.post("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.user!.id;
        const alert = await this.db.createAlert(userId, req.body);
        res.json(alert);
      } catch (error) {
        res.status(400).json({ error: "Failed to create alert" });
      }
    });

    router.delete(
      "/:alertId",
      authMiddleware,
      async (req: AuthenticatedRequest, res) => {
        try {
          const userId = req.user!.id;
          const { alertId } = req.params;
          await this.db.deleteAlert(userId, alertId);
          res.json({ success: true });
        } catch (error) {
          res.status(404).json({ error: "Alert not found" });
        }
      },
    );

    return router;
  }

  private userRoutes(): express.Router {
    const router = express.Router();

    router.get("/profile", async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.user!.id;
        const profile = await this.db.getUserProfile(userId);
        res.json(profile);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch profile" });
      }
    });

    router.put("/profile", async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.user!.id;
        const profile = await this.db.updateUserProfile(userId, req.body);
        res.json(profile);
      } catch (error) {
        res.status(400).json({ error: "Failed to update profile" });
      }
    });

    router.post("/upgrade", async (req: AuthenticatedRequest, res) => {
      try {
        const userId = req.user!.id;
        const { tier } = req.body;
        const subscription = await this.db.upgradeSubscription(userId, tier);
        res.json(subscription);
      } catch (error) {
        res.status(400).json({ error: "Failed to upgrade subscription" });
      }
    });

    return router;
  }

  private adminRoutes(): express.Router {
    const router = express.Router();

    router.get("/stats", async (req, res) => {
      try {
        const stats = await this.getAdminStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch stats" });
      }
    });

    router.post("/broadcast", async (req, res) => {
      try {
        if (!this.telegramBot) {
          res.status(503).json({ error: "Telegram bot is not configured" });
          return;
        }

        const { message, targetTier = "all" } = req.body;
        const result = await this.telegramBot.broadcastSafetyAlert(
          message,
          targetTier,
        );
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: "Broadcast failed" });
      }
    });

    router.get("/users", async (req, res) => {
      try {
        const users = await this.db.getAllUsers();
        res.json(users);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });

    return router;
  }

  private async getHealthStatus(): Promise<any> {
    const [dbStatus, redisStatus, heliusStatus] = await Promise.allSettled([
      this.db.healthCheck(),
      this.queue.healthCheck(),
      this.helius.healthCheck(),
    ]);

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus.status === "fulfilled" ? "healthy" : "unhealthy",
        redis: redisStatus.status === "fulfilled" ? "healthy" : "unhealthy",
        helius: heliusStatus.status === "fulfilled" ? "healthy" : "unhealthy",
        telegram: "healthy", // Basic check, could be enhanced
      },
      metrics: await this.getBotMetrics(),
    };
  }

  private async getAdminStats(): Promise<any> {
    const [userStats, alertStats, revenueStats] = await Promise.all([
      this.db.getUserStats(),
      this.db.getAlertStats(),
      this.db.getRevenueStats(),
    ]);

    return {
      users: userStats,
      alerts: alertStats,
      revenue: revenueStats,
      performance: await this.getPerformanceMetrics(),
    };
  }

  private async getBotMetrics(): Promise<any> {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeConnections: this.queue.getActiveConnections(),
      queueSize: await this.queue.getQueueSize(),
    };
  }

  private async getPerformanceMetrics(): Promise<any> {
    return {
      responseTime: await this.db.getAverageResponseTime(),
      errorRate: await this.db.getErrorRate(),
      throughput: await this.db.getThroughput(),
    };
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.db.connect();
      logger.info("Database connected");

      // Initialize queue
      await this.queue.connect();
      logger.info("Queue service connected");

      // Initialize Helius WebSocket
      await this.helius.connect();
      logger.info("Helius WebSocket connected");

      // Start queue processors
      this.queue.startProcessors();
      logger.info("Queue processors started");

      if (config.features.riskScoring) {
        await this.monitor.start();
        logger.info("Monitor service started");
      }

      // Start HTTP server
      const port = config.server.port || 8000;
      this.app.listen(port, () => {
        logger.info(`Token Sniper Bot server started on port ${port}`);
        logger.info(`Telegram bot: @${config.telegram.botUsername}`);
      });
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info("Shutting down Token Sniper Bot...");

    try {
      await this.queue.disconnect();
      await this.helius.disconnect();
      await this.monitor.stop();
      await this.db.disconnect();
      if (this.bot) {
        this.bot.stop();
      }
      logger.info("Token Sniper Bot stopped gracefully");
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  }
}

// Start the bot
const bot = new TokenSniperBot();

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await bot.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await bot.stop();
  process.exit(0);
});

// Start the bot
bot.start().catch((error) => {
  logger.error("Failed to start bot:", error);
  process.exit(1);
});
