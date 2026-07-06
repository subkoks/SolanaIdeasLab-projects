import { config } from "../config/environment";
import { AlertNotificationThrottle } from "../utils/alert-throttle";
import { logger } from "../utils/logger";
import { DatabaseService } from "./database";
import { HeliusService } from "./helius";
import {
  DetectedLaunch,
  LaunchDetectionService,
} from "./launch-detection";
import { RiskScoringService } from "./risk-scoring";
import type { TelegramBotService } from "./telegram-bot";

export interface MonitoringAlert {
  id: string;
  type:
    | "launch"
    | "risk_change"
    | "whale_activity"
    | "bundle_detected"
    | "price_movement";
  tokenAddress: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  data: any;
  timestamp: number;
  userId?: string;
}

export interface WhaleActivity {
  walletAddress: string;
  action: "buy" | "sell" | "transfer";
  tokenAddress: string;
  amount: number;
  usdValue: number;
  timestamp: number;
  transactionSignature: string;
}

export interface TokenLaunch {
  tokenAddress: string;
  name: string;
  symbol: string;
  creator: string;
  timestamp: number;
  initialLiquidity: number;
  metadata: any;
}

export interface BundleDetection {
  tokenAddress: string;
  wallets: string[];
  activity: {
    buys: number;
    sells: number;
    totalVolume: number;
    avgBuyPrice: number;
    avgSellPrice: number;
  };
  confidence: number;
  riskLevel: "low" | "medium" | "high";
}

export class MonitorService {
  private db: DatabaseService;
  private helius: HeliusService;
  private riskScoring: RiskScoringService;
  private launchDetection: LaunchDetectionService;
  private telegramBot: TelegramBotService | null = null;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  private activeMonitors: Set<string> = new Set();
  private readonly alertThrottle: AlertNotificationThrottle;

  constructor(
    db: DatabaseService,
    helius: HeliusService,
    riskScoring: RiskScoringService,
    launchDetection?: LaunchDetectionService,
  ) {
    this.db = db;
    this.helius = helius;
    this.riskScoring = riskScoring;
    this.launchDetection =
      launchDetection ?? new LaunchDetectionService(helius.getConnection());
    this.alertThrottle = new AlertNotificationThrottle(
      config.monitoring.alertDedupeMs,
      config.monitoring.alertRateWindowMs,
      config.monitoring.alertRateMaxPerChat,
    );
  }

  public setTelegramBot(telegramBot: TelegramBotService | null): void {
    this.telegramBot = telegramBot;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Monitor service is already running");
      return;
    }

    try {
      this.isRunning = true;
      logger.info("Monitor service started");

      // Start monitoring tasks
      this.startTokenLaunchMonitoring();
      this.startRiskMonitoring();
      this.startWhaleMonitoring();
      this.startBundleMonitoring();
      this.startPriceMonitoring();
      this.startCleanupTask();

      logger.info("All monitoring tasks started");
    } catch (error) {
      logger.error("Failed to start monitor service:", error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn("Monitor service is not running");
      return;
    }

    try {
      this.isRunning = false;

      // Clear all monitoring intervals
      for (const [name, interval] of this.monitoringIntervals) {
        clearInterval(interval);
        logger.info(`Stopped monitoring: ${name}`);
      }
      this.monitoringIntervals.clear();

      logger.info("Monitor service stopped");
    } catch (error) {
      logger.error("Error stopping monitor service:", error);
    }
  }

  private startTokenLaunchMonitoring(): void {
    const interval = setInterval(async () => {
      try {
        await this.checkForNewTokenLaunches();
      } catch (error) {
        logger.error("Token launch monitoring error:", error);
      }
    }, config.monitoring.launchPollIntervalMs);

    this.monitoringIntervals.set("token-launch", interval);
    logger.info("Token launch monitoring started", {
      intervalMs: config.monitoring.launchPollIntervalMs,
    });
  }

  private startRiskMonitoring(): void {
    const interval = setInterval(async () => {
      try {
        await this.checkForRiskChanges();
      } catch (error) {
        logger.error("Risk monitoring error:", error);
      }
    }, 60000); // Check every minute

    this.monitoringIntervals.set("risk-monitoring", interval);
    logger.info("Risk monitoring started");
  }

  private startWhaleMonitoring(): void {
    const interval = setInterval(async () => {
      try {
        await this.checkForWhaleActivity();
      } catch (error) {
        logger.error("Whale monitoring error:", error);
      }
    }, 15000); // Check every 15 seconds

    this.monitoringIntervals.set("whale-monitoring", interval);
    logger.info("Whale monitoring started");
  }

  private startBundleMonitoring(): void {
    const interval = setInterval(async () => {
      try {
        await this.checkForBundles();
      } catch (error) {
        logger.error("Bundle monitoring error:", error);
      }
    }, 45000); // Check every 45 seconds

    this.monitoringIntervals.set("bundle-monitoring", interval);
    logger.info("Bundle monitoring started");
  }

  private startPriceMonitoring(): void {
    const interval = setInterval(async () => {
      try {
        await this.checkForPriceMovements();
      } catch (error) {
        logger.error("Price monitoring error:", error);
      }
    }, 30000); // Check every 30 seconds

    this.monitoringIntervals.set("price-monitoring", interval);
    logger.info("Price monitoring started");
  }

  private startCleanupTask(): void {
    const interval = setInterval(async () => {
      try {
        await this.cleanupOldData();
      } catch (error) {
        logger.error("Cleanup task error:", error);
      }
    }, 3600000); // Run every hour

    this.monitoringIntervals.set("cleanup", interval);
    logger.info("Cleanup task started");
  }

  private async checkForNewTokenLaunches(): Promise<void> {
    if (!config.features.riskScoring) {
      return;
    }

    try {
      const launches = await this.launchDetection.pollPumpFunLaunches();

      for (const launch of launches) {
        await this.processLaunch(launch);
      }
    } catch (error) {
      logger.error("Token launch monitoring error:", error);
    }
  }

  public async ingestLaunchSignature(
    signature: string,
    blockTime?: number | null,
  ): Promise<boolean> {
    try {
      const launch = await this.launchDetection.ingestSignature(
        signature,
        blockTime,
      );

      if (!launch) {
        return false;
      }

      await this.processLaunch(launch);
      return true;
    } catch (error) {
      logger.error("Failed to ingest launch signature:", error);
      return false;
    }
  }

  private async processLaunch(launch: DetectedLaunch): Promise<void> {
    const riskScore = await this.safeAnalyzeLaunch(launch.mint);
    const assetMetadata = await this.helius.getAssetMetadata(launch.mint);

    await this.db.recordDetectedLaunch({
      mint: launch.mint,
      signature: launch.signature,
      creator: launch.creator,
      riskScore: riskScore.total,
      riskLevel: riskScore.riskLevel,
      metadata: assetMetadata,
    });

    await this.createAlert({
      id: `launch-${launch.mint}-${launch.timestampMs}`,
      type: "launch",
      tokenAddress: launch.mint,
      severity:
        riskScore.total >= 70
          ? "low"
          : riskScore.total >= 40
            ? "medium"
            : "high",
      message: `New pump.fun launch detected. Risk score ${riskScore.total}/100 (${riskScore.riskLevel}).`,
      data: {
        launch,
        riskScore,
      },
      timestamp: launch.timestampMs,
    });

    if (this.telegramBot) {
      await this.telegramBot.broadcastLaunchAlert(
        launch,
        riskScore,
        assetMetadata,
      );
    }
  }

  private async safeAnalyzeLaunch(tokenAddress: string) {
    try {
      return await this.riskScoring.analyzeToken(tokenAddress, "quick");
    } catch (error) {
      logger.warn("Launch risk analysis fallback", { tokenAddress, error });
      return {
        total: 50,
        riskLevel: "medium" as const,
        categories: {
          contract: 50,
          liquidity: 50,
          distribution: 50,
          social: 50,
          developer: 50,
        },
        factors: {
          renouncedMint: false,
          liquidityLocked: false,
          top10Holding: 50,
          socialSentiment: 0.5,
          developerReputation: 50,
          suspiciousFunctions: false,
        },
        recommendations: [
          "New launch with limited metadata — verify manually before trading.",
        ],
      };
    }
  }

  private async checkForRiskChanges(): Promise<void> {
    // This would check for risk level changes in monitored tokens
    logger.debug("Checking for risk changes...");

    // In production, this would:
    // 1. Re-analyze risk scores for monitored tokens
    // 2. Compare with previous scores
    // 3. Create alerts for significant changes
    // 4. Update monitoring priorities
  }

  private async checkForWhaleActivity(): Promise<void> {
    // This would check for whale activity
    logger.debug("Checking for whale activity...");

    // In production, this would:
    // 1. Monitor known whale addresses
    // 2. Track large transactions
    // 3. Analyze patterns and timing
    // 4. Create alerts for significant moves
  }

  private async checkForBundles(): Promise<void> {
    // This would check for bundle activity
    logger.debug("Checking for bundles...");

    // In production, this would:
    // 1. Analyze transaction patterns
    // 2. Identify coordinated buying
    // 3. Calculate bundle confidence
    // 4. Create alerts for detected bundles
  }

  private async checkForPriceMovements(): Promise<void> {
    // This would check for significant price movements
    logger.debug("Checking for price movements...");

    // In production, this would:
    // 1. Monitor price feeds
    // 2. Calculate percentage changes
    // 3. Filter for significant movements
    // 4. Create alerts for notable changes
  }

  private async cleanupOldData(): Promise<void> {
    try {
      logger.debug("Cleaning up old monitoring data...");

      // This would clean up old monitoring data
      // In production, this would:
      // 1. Remove old alerts from database
      // 2. Clean up cache entries
      // 3. Archive historical data
      // 4. Update statistics

      logger.debug("Cleanup completed");
    } catch (error) {
      logger.error("Cleanup error:", error);
    }
  }

  async startMonitoring(tokenAddress: string, userId: string): Promise<void> {
    try {
      if (this.activeMonitors.has(tokenAddress)) {
        logger.warn(`Token ${tokenAddress} is already being monitored`);
        return;
      }

      // Add to active monitors
      this.activeMonitors.add(tokenAddress);

      // Create monitoring record in database
      await this.db.createAlert(userId, {
        tokenAddress,
        alertType: "monitoring",
        criteria: {
          riskChanges: true,
          priceMovements: true,
          whaleActivity: true,
          bundleDetection: true,
        },
      });

      // Start specific monitoring for this token
      const interval = setInterval(async () => {
        try {
          await this.monitorSpecificToken(tokenAddress, userId);
        } catch (error) {
          logger.error(`Error monitoring token ${tokenAddress}:`, error);
        }
      }, 30000); // Check every 30 seconds

      this.monitoringIntervals.set(`token-${tokenAddress}`, interval);

      logger.info(
        `Started monitoring token: ${tokenAddress} for user: ${userId}`,
      );
    } catch (error) {
      logger.error(`Failed to start monitoring token ${tokenAddress}:`, error);
      throw error;
    }
  }

  async stopMonitoring(tokenAddress: string, userId: string): Promise<void> {
    try {
      if (!this.activeMonitors.has(tokenAddress)) {
        logger.warn(`Token ${tokenAddress} is not being monitored`);
        return;
      }

      // Remove from active monitors
      this.activeMonitors.delete(tokenAddress);

      // Clear monitoring interval
      const interval = this.monitoringIntervals.get(`token-${tokenAddress}`);
      if (interval) {
        clearInterval(interval);
        this.monitoringIntervals.delete(`token-${tokenAddress}`);
      }

      // Update database
      await this.db.deleteAlert(userId, `monitoring-${tokenAddress}`);

      logger.info(
        `Stopped monitoring token: ${tokenAddress} for user: ${userId}`,
      );
    } catch (error) {
      logger.error(`Failed to stop monitoring token ${tokenAddress}:`, error);
      throw error;
    }
  }

  private async monitorSpecificToken(
    tokenAddress: string,
    userId: string,
  ): Promise<void> {
    try {
      // Get current risk score
      const currentRisk = await this.riskScoring.getRiskScore(tokenAddress);

      // Check for significant changes (would compare with previous score)
      if (currentRisk.total < 30) {
        // High risk
        await this.createAlert({
          id: `risk-${tokenAddress}-${Date.now()}`,
          type: "risk_change",
          tokenAddress,
          severity: "high",
          message: `High risk detected for token: ${currentRisk.total}/100`,
          data: currentRisk,
          timestamp: Date.now(),
          userId,
        });
      }

      // Check for whale activity (would use actual whale tracking)
      const whaleActivity = await this.checkWhaleActivityForToken(tokenAddress);
      if (whaleActivity.length > 0) {
        for (const activity of whaleActivity) {
          await this.createAlert({
            id: `whale-${tokenAddress}-${Date.now()}`,
            type: "whale_activity",
            tokenAddress,
            severity: "medium",
            message: `Whale activity detected: ${activity.action} ${activity.amount} tokens`,
            data: activity,
            timestamp: Date.now(),
            userId,
          });
        }
      }

      // Check for bundles (would use actual bundle detection)
      const bundle = await this.riskScoring.detectBundles(tokenAddress);
      if (bundle.detected && bundle.confidence > 0.7) {
        await this.createAlert({
          id: `bundle-${tokenAddress}-${Date.now()}`,
          type: "bundle_detected",
          tokenAddress,
          severity: "high",
          message: `Bundle detected with ${bundle.confidence}% confidence`,
          data: bundle,
          timestamp: Date.now(),
          userId,
        });
      }
    } catch (error) {
      logger.error(`Error monitoring specific token ${tokenAddress}:`, error);
    }
  }

  private async checkWhaleActivityForToken(
    _tokenAddress: string,
  ): Promise<WhaleActivity[]> {
    // This would check for whale activity for a specific token
    // For now, return empty array
    return [];
  }

  private async createAlert(alert: MonitoringAlert): Promise<void> {
    try {
      logger.info(
        `Creating alert: ${alert.type} for token ${alert.tokenAddress}`,
      );

      // In production, this would:
      // 1. Save alert to database
      // 2. Send notifications to relevant users
      // 3. Update monitoring statistics
      // 4. Trigger automated actions if needed

      // Notify Telegram subscribers (token_watch + monitoring user)
      await this.sendNotification(alert);
    } catch (error) {
      logger.error("Failed to create alert:", error);
    }
  }

  private async sendNotification(alert: MonitoringAlert): Promise<void> {
    try {
      if (!this.telegramBot) {
        logger.info(`Notification skipped (no Telegram): ${alert.message}`);
        return;
      }

      const recipients = new Set<number>();

      if (alert.userId) {
        const chatId = await this.db.getTelegramChatIdForUser(alert.userId);
        if (chatId !== null) {
          recipients.add(chatId);
        }
      }

      const tokenAlerts = await this.db.getActiveAlertsForToken(
        alert.tokenAddress,
      );
      for (const tokenAlert of tokenAlerts) {
        const chatId = await this.db.getTelegramChatIdForUser(
          tokenAlert.userId,
        );
        if (chatId !== null) {
          recipients.add(chatId);
        }
      }

      if (recipients.size === 0) {
        logger.debug("No Telegram recipients for monitoring alert", {
          tokenAddress: alert.tokenAddress,
          type: alert.type,
        });
        return;
      }

      for (const chatId of recipients) {
        if (
          !this.alertThrottle.shouldNotify(
            chatId,
            alert.tokenAddress,
            alert.type,
          )
        ) {
          logger.debug("Alert notification throttled", {
            chatId,
            tokenAddress: alert.tokenAddress,
            type: alert.type,
          });
          continue;
        }

        await this.telegramBot.notifyMonitoringAlert(chatId, {
          type: alert.type,
          tokenAddress: alert.tokenAddress,
          severity: alert.severity,
          message: alert.message,
        });

        await this.db.recordAlertNotification({
          userId: alert.userId,
          chatId: String(chatId),
          tokenAddress: alert.tokenAddress,
          alertType: alert.type,
          severity: alert.severity,
          message: alert.message,
        });
      }
    } catch (error) {
      logger.error("Failed to send notification:", error);
    }
  }

  async getMonitoringStatus(tokenAddress: string): Promise<any> {
    try {
      const isMonitoring = this.activeMonitors.has(tokenAddress);

      return {
        tokenAddress,
        isMonitoring,
        monitoringStarted: isMonitoring ? Date.now() : null,
        alertsCount: 0, // Would get from database
        lastAlert: null, // Would get from database
        riskScore: isMonitoring
          ? await this.riskScoring.getRiskScore(tokenAddress)
          : null,
      };
    } catch (error) {
      logger.error(
        `Failed to get monitoring status for ${tokenAddress}:`,
        error,
      );
      throw error;
    }
  }

  async getActiveMonitoringCount(): Promise<number> {
    return this.activeMonitors.size;
  }

  async getMonitoringStats(): Promise<any> {
    try {
      return {
        isRunning: this.isRunning,
        activeMonitors: this.activeMonitors.size,
        totalAlerts: 0, // Would get from database
        alertsByType: {
          launch: 0,
          risk_change: 0,
          whale_activity: 0,
          bundle_detected: 0,
          price_movement: 0,
        },
        alertsBySeverity: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        },
        lastAlertTime: null, // Would get from database
        uptime: this.isRunning ? Date.now() : null,
      };
    } catch (error) {
      logger.error("Failed to get monitoring stats:", error);
      throw error;
    }
  }

  async addCustomMonitor(
    tokenAddress: string,
    criteria: any,
    userId: string,
  ): Promise<void> {
    try {
      await this.startMonitoring(tokenAddress, userId);

      // Update monitoring criteria
      logger.info(
        `Custom monitoring criteria added for token: ${tokenAddress}`,
        criteria,
      );
    } catch (error) {
      logger.error(`Failed to add custom monitor for ${tokenAddress}:`, error);
      throw error;
    }
  }

  async removeMonitor(tokenAddress: string, userId: string): Promise<void> {
    try {
      await this.stopMonitoring(tokenAddress, userId);
      logger.info(`Monitor removed for token: ${tokenAddress}`);
    } catch (error) {
      logger.error(`Failed to remove monitor for ${tokenAddress}:`, error);
      throw error;
    }
  }

  async getMonitoredTokens(): Promise<string[]> {
    return Array.from(this.activeMonitors);
  }

  async getAlertHistory(
    tokenAddress: string,
    limit: number = 50,
  ): Promise<MonitoringAlert[]> {
    try {
      const rows = await this.db.getAlertNotificationsForToken(
        tokenAddress,
        limit,
      );

      return rows.map((row) => ({
        id: `${row.alertType}-${row.tokenAddress}-${row.deliveredAt.getTime()}`,
        type: row.alertType as MonitoringAlert["type"],
        tokenAddress: row.tokenAddress,
        severity: row.severity as MonitoringAlert["severity"],
        message: row.message,
        data: {},
        timestamp: row.deliveredAt.getTime(),
      }));
    } catch (error) {
      logger.error(`Failed to get alert history for ${tokenAddress}:`, error);
      return [];
    }
  }

  async getWhaleHistory(
    walletAddress: string,
    _limit: number = 50,
  ): Promise<WhaleActivity[]> {
    try {
      // This would get whale history from database
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error(`Failed to get whale history for ${walletAddress}:`, error);
      return [];
    }
  }

  async getBundleHistory(
    tokenAddress: string,
    _limit: number = 50,
  ): Promise<BundleDetection[]> {
    try {
      // This would get bundle history from database
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error(`Failed to get bundle history for ${tokenAddress}:`, error);
      return [];
    }
  }
}
