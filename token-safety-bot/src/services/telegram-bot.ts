import { Context, Telegraf } from "telegraf";
import type { SubscriptionTier } from "../types/auth";
import { getScanQuota } from "../utils/scan-quota";
import type { SafetyScanResult } from "./safety-scanner";
import { DatabaseService } from "./database";
import { MonitorService } from "./monitor";
import { SafetyScannerService } from "./safety-scanner";

const TELEGRAM_MESSAGE_MAX = 4096;

const splitTelegramMessage = (text: string): Array<string> => {
  if (text.length <= TELEGRAM_MESSAGE_MAX) {
    return [text];
  }
  const chunks: Array<string> = [];
  let rest = text;
  while (rest.length > 0) {
    chunks.push(rest.slice(0, TELEGRAM_MESSAGE_MAX));
    rest = rest.slice(TELEGRAM_MESSAGE_MAX);
  }
  return chunks;
};

const formatScanForTelegram = (
  scan: SafetyScanResult,
  title: string,
): string => {
  const lines: Array<string> = [
    title,
    `Mint: ${scan.tokenAddress}`,
    `Score: ${scan.overallScore}/100 (${scan.safetyLevel})`,
    `Depth: ${scan.analysisDepth}`,
    "",
    "Red flags:",
    ...(scan.redFlags.length > 0
      ? scan.redFlags.map((f) => `• ${f}`)
      : ["• None flagged"]),
    "",
    "Green flags:",
    ...(scan.greenFlags.length > 0
      ? scan.greenFlags.map((f) => `• ${f}`)
      : ["• None listed"]),
    "",
    "Recommendations:",
    ...(scan.recommendations.length > 0
      ? scan.recommendations.map((f) => `• ${f}`)
      : ["• None"]),
    "",
    "Summary:",
    `• Program: ${scan.summary.tokenProgram}`,
    `• Holders (visible): ${scan.summary.holderCount}`,
    `• Top holder share: ${(scan.summary.topHolderOwnershipRatio * 100).toFixed(2)}%`,
    `• Recent signatures sampled: ${scan.summary.recentActivityCount}`,
  ];
  return lines.join("\n");
};

export class TelegramBotService {
  private readonly knownChatIds = new Set<number>();
  private maintenanceMode = false;

  constructor(
    private readonly bot: Telegraf<Context>,
    private readonly safetyScannerService: SafetyScannerService,
    private readonly monitorService: MonitorService,
    private readonly databaseService: DatabaseService,
    private readonly adminChatIds: ReadonlySet<number>,
  ) {}

  private telegramUserId(chatId: number): string {
    return `telegram:${chatId}`;
  }

  private isAdmin(userId: number | undefined): boolean {
    if (userId === undefined) {
      return false;
    }
    return this.adminChatIds.has(userId);
  }

  private parseCommandArgs(text: string): string {
    return text.split(" ").slice(1).join(" ").trim();
  }

  private parseCommandTokens(text: string): Array<string> {
    return text.split(/\s+/).slice(1).filter(Boolean);
  }

  private async resolveAlertIdForDeletion(
    userId: string,
    alertIdOrPrefix: string,
  ): Promise<string> {
    const alerts = await this.databaseService.getUserAlerts(userId);
    const exact = alerts.find((alert) => alert.id === alertIdOrPrefix);

    if (exact) {
      return exact.id;
    }

    const prefixMatches = alerts.filter((alert) =>
      alert.id.startsWith(alertIdOrPrefix),
    );

    if (prefixMatches.length === 1) {
      return prefixMatches[0].id;
    }

    if (prefixMatches.length > 1) {
      throw new Error("Ambiguous alert id prefix");
    }

    throw new Error("Alert not found");
  }

  public registerCommands(): void {
    this.bot.use(async (context, next) => {
      if (!this.maintenanceMode) {
        await next();
        return;
      }
      if (this.isAdmin(context.from?.id)) {
        await next();
        return;
      }
      const messageText =
        context.message && "text" in context.message
          ? context.message.text
          : "";
      if (messageText.startsWith("/")) {
        await context.reply(
          "The bot is in maintenance mode. Please try again later.",
        );
      }
    });

    this.bot.start(async (context) => {
      this.knownChatIds.add(context.chat.id);
      await context.reply(
        [
          "Token Safety Bot — Solana mint checks, monitoring, and alerts.",
          "",
          "/quota — daily scan allowance",
          "Use /help for commands. Quick start: /scan <mint>",
          "Premium tiers upgrade via the HTTP API (wallet connect), not in Telegram.",
        ].join("\n"),
      );
    });

    this.bot.help(async (context) => {
      this.knownChatIds.add(context.chat.id);
      await context.reply(
        [
          "User commands:",
          "/scan <mint> — quick safety scan",
          "/score <mint> — score + key flags",
          "/report <mint> — full-depth scan summary",
          "/monitor <mint> — start monitoring",
          "/status <mint> — monitoring status",
          "/alerts — list your alerts",
          "/alerts add <mint> [type] — add alert (default: safety_watch)",
          "/alerts remove <alertId> — remove alert",
          "/premium — pricing overview",
          "",
          "Admin (TELEGRAM_ADMIN_CHAT_IDS):",
          "/stats — aggregate stats",
          "/broadcast <message> — message all known chats",
          "/blacklist <mint> <reason…> — blacklist a mint",
          "/maintenance on|off",
          "/scan-all — not available (use HTTP/API feeds)",
        ].join("\n"),
      );
    });

    this.bot.command("scan", async (context) => {
      this.knownChatIds.add(context.chat.id);
      const tokenAddress = this.parseCommandArgs(context.message.text);

      if (!tokenAddress) {
        await context.reply("Usage: /scan <token-address>");
        return;
      }

      try {
        const scan = await this.safetyScannerService.scanToken(
          tokenAddress,
          "quick",
          this.telegramUserId(context.chat.id),
        );
        await context.reply(
          `Safety score: ${scan.overallScore}/100\nLevel: ${scan.safetyLevel}\nRed flags: ${scan.redFlags.length}`,
        );
      } catch (error) {
        await context.reply(
          `Scan failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });

    this.bot.command("score", async (context) => {
      this.knownChatIds.add(context.chat.id);
      const tokenAddress = this.parseCommandArgs(context.message.text);

      if (!tokenAddress) {
        await context.reply("Usage: /score <token-address>");
        return;
      }

      try {
        const score = await this.safetyScannerService.getSafetyScore(
          tokenAddress,
        );
        const flags =
          score.redFlags.length > 0
            ? score.redFlags.map((f) => `• ${f}`).join("\n")
            : "• None flagged";
        await context.reply(
          `Score: ${score.score}/100\nLevel: ${score.safetyLevel}\n\n${flags}`,
        );
      } catch (error) {
        await context.reply(
          `Score failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });

    this.bot.command("report", async (context) => {
      this.knownChatIds.add(context.chat.id);
      const tokenAddress = this.parseCommandArgs(context.message.text);

      if (!tokenAddress) {
        await context.reply("Usage: /report <token-address>");
        return;
      }

      try {
        const scan = await this.safetyScannerService.scanToken(
          tokenAddress,
          "full",
          this.telegramUserId(context.chat.id),
        );
        const body = formatScanForTelegram(scan, "Full safety report");
        for (const chunk of splitTelegramMessage(body)) {
          await context.reply(chunk);
        }
      } catch (error) {
        await context.reply(
          `Report failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });

    this.bot.command("monitor", async (context) => {
      this.knownChatIds.add(context.chat.id);
      const tokenAddress = this.parseCommandArgs(context.message.text);

      if (!tokenAddress) {
        await context.reply("Usage: /monitor <token-address>");
        return;
      }

      const state = await this.monitorService.startMonitoring(
        tokenAddress,
        this.telegramUserId(context.chat.id),
      );
      await context.reply(
        `Monitoring started for ${state.tokenAddress}. Subscribers: ${state.userIds.size}`,
      );
    });

    this.bot.command("status", async (context) => {
      this.knownChatIds.add(context.chat.id);
      const tokenAddress = this.parseCommandArgs(context.message.text);

      if (!tokenAddress) {
        await context.reply("Usage: /status <token-address>");
        return;
      }

      const status =
        await this.monitorService.getMonitoringStatus(tokenAddress);
      await context.reply(
        [
          `Running: ${status.running}`,
          `Subscribers: ${status.subscriberCount}`,
          `Safety level (last): ${status.safetyLevel ?? "n/a"}`,
          `Last scan: ${status.lastScanAt ?? "never"}`,
        ].join("\n"),
      );
    });

    this.bot.command("alerts", async (context) => {
      this.knownChatIds.add(context.chat.id);
      const tokens = this.parseCommandTokens(context.message.text);
      const userId = this.telegramUserId(context.chat.id);

      if (tokens.length === 0) {
        const alerts = await this.databaseService.getUserAlerts(userId);
        if (alerts.length === 0) {
          await context.reply("You have no active alerts.");
          return;
        }
        const lines = alerts.map(
          (a) =>
            `• ${a.id} ${a.tokenAddress.slice(0, 8)}… (${a.alertType})`,
        );
        await context.reply(["Active alerts:", ...lines].join("\n"));
        return;
      }

      const sub = tokens[0]?.toLowerCase();

      if (sub === "add") {
        const mint = tokens[1];
        if (!mint) {
          await context.reply("Usage: /alerts add <mint> [alertType]");
          return;
        }
        const alertType = tokens[2] ?? "safety_watch";
        const created = await this.databaseService.createAlert(userId, {
          alertType,
          tokenAddress: mint,
        });
        await context.reply(
          `Alert created: ${created.id}\nMint: ${created.tokenAddress}\nType: ${created.alertType}`,
        );
        return;
      }

      if (sub === "remove") {
        const alertId = tokens[1];
        if (!alertId) {
          await context.reply("Usage: /alerts remove <alertId>");
          return;
        }
        try {
          const resolvedAlertId = await this.resolveAlertIdForDeletion(
            userId,
            alertId,
          );
          await this.databaseService.deleteAlert(userId, resolvedAlertId);
          await context.reply("Alert removed.");
        } catch {
          await context.reply(
            "Could not remove alert (check id — use /alerts to list).",
          );
        }
        return;
      }

      await context.reply(
        "Usage: /alerts | /alerts add <mint> [type] | /alerts remove <id>",
      );
    });

    this.bot.command("quota", async (context) => {
      this.knownChatIds.add(context.chat.id);
      const userId = this.telegramUserId(context.chat.id);
      const scans = await this.databaseService.getUserScans(userId);

      let tier: SubscriptionTier = "free";
      try {
        const profile = await this.databaseService.getUserProfile(userId);
        tier = profile.subscriptionTier;
      } catch {
        tier = "free";
      }

      const quota = getScanQuota(tier, scans, userId);
      const remainingLabel =
        quota.remaining === -1 ? "unlimited" : String(quota.remaining);

      await context.reply(
        [
          `Tier: ${quota.tier}`,
          `Scans today: ${quota.usedToday}/${quota.limit === -1 ? "∞" : quota.limit}`,
          `Remaining: ${remainingLabel}`,
          `Resets: ${new Date(quota.resetsAt).toLocaleString()}`,
        ].join("\n"),
      );
    });

    this.bot.command("premium", async (context) => {
      this.knownChatIds.add(context.chat.id);
      await context.reply(
        [
          "Pricing (see README for detail):",
          "• Free — basic scans",
          "• Basic ~$20/mo",
          "• Pro ~$50/mo",
          "• Enterprise ~$100/mo",
          "",
          "Upgrades use wallet auth on the HTTP API, not Telegram.",
        ].join("\n"),
      );
    });

    this.bot.command("stats", async (context) => {
      if (!this.isAdmin(context.from?.id)) {
        await context.reply("Unauthorized.");
        return;
      }
      const [users, alerts, scans, monitoring] = await Promise.all([
        this.databaseService.getUserStats(),
        this.databaseService.getAlertStats(),
        this.databaseService.getScanStats(),
        this.monitorService.getActiveMonitoringCount(),
      ]);
      await context.reply(
        [
          "Stats:",
          `Users (DB): ${users.total} (premium: ${users.premium})`,
          `Alerts: ${alerts.active} active / ${alerts.total} total`,
          `Scans stored: ${scans.total} (avg score ${scans.averageScore})`,
          `Monitoring tokens: ${monitoring}`,
        ].join("\n"),
      );
    });

    this.bot.command("broadcast", async (context) => {
      if (!this.isAdmin(context.from?.id)) {
        await context.reply("Unauthorized.");
        return;
      }
      const message = this.parseCommandArgs(context.message.text);
      if (!message) {
        await context.reply("Usage: /broadcast <message>");
        return;
      }
      const { sent } = await this.broadcastSafetyAlert(message, "all");
      await context.reply(`Broadcast sent to ${sent} chat(s).`);
    });

    this.bot.command("blacklist", async (context) => {
      if (!this.isAdmin(context.from?.id)) {
        await context.reply("Unauthorized.");
        return;
      }
      const rest = this.parseCommandArgs(context.message.text);
      const parts = rest.split(/\s+/).filter(Boolean);
      const mint = parts[0];
      const reason = parts.slice(1).join(" ").trim();
      if (!mint || !reason) {
        await context.reply("Usage: /blacklist <mint> <reason…>");
        return;
      }
      await this.databaseService.blacklistToken(mint, reason, {
        source: "telegram",
      });
      await context.reply(`Blacklisted ${mint}`);
    });

    this.bot.command("maintenance", async (context) => {
      if (!this.isAdmin(context.from?.id)) {
        await context.reply("Unauthorized.");
        return;
      }
      const arg = this.parseCommandArgs(context.message.text).toLowerCase();
      if (arg === "on" || arg === "true" || arg === "1") {
        this.maintenanceMode = true;
        await context.reply("Maintenance mode ON.");
        return;
      }
      if (arg === "off" || arg === "false" || arg === "0") {
        this.maintenanceMode = false;
        await context.reply("Maintenance mode OFF.");
        return;
      }
      await context.reply("Usage: /maintenance on|off");
    });

    this.bot.command("scan-all", async (context) => {
      if (!this.isAdmin(context.from?.id)) {
        await context.reply("Unauthorized.");
        return;
      }
      await context.reply(
        "/scan-all is not wired in Telegram. Use your own token feed plus /scan or the HTTP API.",
      );
    });
  }

  public async broadcastSafetyAlert(
    message: string,
    targetTier: string,
  ): Promise<{ sent: number; targetTier: string }> {
    let sent = 0;

    for (const chatId of this.knownChatIds) {
      try {
        await this.bot.telegram.sendMessage(chatId, message);
        sent += 1;
      } catch {
        continue;
      }
    }

    return { sent, targetTier };
  }

  public async notifyMonitoringChange(
    subscriberUserIds: ReadonlyArray<string>,
    scan: SafetyScanResult,
    previousLevel: string,
    nextLevel: string,
  ): Promise<number> {
    const message = formatScanForTelegram(
      scan,
      `Monitoring alert: safety level changed ${previousLevel} → ${nextLevel}`,
    )

    let sent = 0

    for (const userId of subscriberUserIds) {
      const match = /^telegram:(\d+)$/.exec(userId)
      if (!match) {
        continue
      }

      const chatId = Number(match[1])
      for (const chunk of splitTelegramMessage(message)) {
        try {
          await this.bot.telegram.sendMessage(chatId, chunk)
          sent += 1
        } catch {
          break
        }
      }
    }

    return sent
  }
}
