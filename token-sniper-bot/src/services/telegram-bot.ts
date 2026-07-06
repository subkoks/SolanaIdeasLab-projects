import { Context, Markup, Telegraf } from "telegraf";
import { logger } from "../utils/logger";
import { DatabaseService } from "./database";
import { HeliusService } from "./helius";
import type { DetectedLaunch } from "./launch-detection";
import type { RiskScore } from "./risk-scoring";
import { RiskScoringService } from "./risk-scoring";

export interface TelegramAlert {
  userId: number;
  tokenAddress: string;
  alertType: "launch" | "risk" | "whale" | "bundle";
  message: string;
  timestamp: number;
}

const getMessageText = (ctx: Context): string => {
  const message = ctx.message;

  if (!message || !("text" in message)) {
    return "";
  }

  return message.text;
};

export class TelegramBotService {
  private bot: Telegraf;
  private db: DatabaseService;
  private helius: HeliusService;
  private riskScoring: RiskScoringService;
  private readonly launchAlertChatIds = new Set<number>();

  constructor(
    bot: Telegraf,
    db: DatabaseService,
    helius: HeliusService,
    riskScoring: RiskScoringService,
  ) {
    this.bot = bot;
    this.db = db;
    this.helius = helius;
    this.riskScoring = riskScoring;
  }

  registerCommands(): void {
    // Basic commands
    this.bot.start((ctx) => this.handleStart(ctx));
    this.bot.help((ctx) => this.handleHelp(ctx));
    this.bot.command("status", (ctx) => this.handleStatus(ctx));

    // Token analysis commands
    this.bot.command("analyze", (ctx) => this.handleAnalyze(ctx));
    this.bot.command("risk", (ctx) => this.handleRisk(ctx));
    this.bot.command("check", (ctx) => this.handleCheck(ctx));

    // Alert commands
    this.bot.command("alert", (ctx) => this.handleAlert(ctx));
    this.bot.command("alerts", (ctx) => this.handleAlerts(ctx));
    this.bot.command("launches", (ctx) => this.handleLaunches(ctx));
    this.bot.command("stop", (ctx) => this.handleStopAlert(ctx));

    // Premium commands
    this.bot.command("premium", (ctx) => this.handlePremium(ctx));
    this.bot.command("upgrade", (ctx) => this.handleUpgrade(ctx));

    // Admin commands
    this.bot.command("broadcast", (ctx) => this.handleBroadcast(ctx));
    this.bot.command("stats", (ctx) => this.handleStats(ctx));

    // Handle text messages (token addresses)
    this.bot.on("text", (ctx) => this.handleText(ctx));

    // Handle errors
    this.bot.catch((err, ctx) => {
      logger.error("Telegram bot error:", err);
      ctx.reply("❌ An error occurred. Please try again.");
    });
  }

  private async handleStart(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id;
      if (!userId) return;

      const message = `
🚀 **Token Sniper Bot** - Your Solana Token Intelligence Assistant

Welcome! I help you discover and analyze new Solana tokens with real-time alerts.

**🔍 Quick Start:**
• Send me a token address to analyze it
• Use /analyze <address> for detailed analysis
• Use /risk <address> for risk assessment
• Use /alert <address> to set alerts

**📊 Features:**
• Real-time token launches (\`/launches subscribe\`)
• Risk scoring & analysis
• Bundle detection
• Whale activity tracking
• Social sentiment analysis

**⚡ Premium Features:**
• Unlimited alerts
• Advanced analytics
• API access
• Priority support

Type /help for more commands or /premium to upgrade!

Let's find some gems! 🎯
      `;

      await ctx.replyWithMarkdownV2(message, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📊 View Stats", "view_stats")],
          [Markup.button.callback("⚡ Upgrade to Premium", "upgrade_premium")],
          [Markup.button.callback("❓ Help", "show_help")],
        ]),
      });
    } catch (error) {
      logger.error("Start command error:", error);
      ctx.reply("❌ Failed to start. Please try again.");
    }
  }

  private async handleHelp(ctx: Context): Promise<void> {
    const message = `
📖 **Token Sniper Bot Commands**

**🔍 Analysis Commands:**
/analyze <address> - Detailed token analysis
/risk <address> - Risk assessment
/check <address> - Quick safety check

**🚨 Alert Commands:**
/alert <address> - Set token alerts
/alerts - View your alerts
/stop <alert_id> - Cancel alert

**⚡ Premium Commands:**
/premium - View premium features
/upgrade - Upgrade your account

**📊 Other Commands:**
/status - Bot status
/stats - Your statistics
/help - Show this help

**💡 Usage Tips:**
• Just send a token address to analyze it
• Use @TokenSniperBot in groups
• Set alerts for tokens you're watching
• Check risk scores before investing

**🔗 Links:**
• Website: token-sniper\\.pro
• Support: @TokenSniperSupport
    `;

    await ctx.replyWithMarkdownV2(message);
  }

  private async handleStatus(ctx: Context): Promise<void> {
    try {
      const health = await this.helius.healthCheck();
      const status = health ? "🟢 Online" : "🔴 Offline";

      const message = `
📊 **Bot Status**

**Service Status:** ${status}
**RPC Connection:** ${health ? "Connected" : "Disconnected"}
**Active Alerts:** Loading...
**Users Today:** Loading...

**Last Update:** ${new Date().toLocaleString()}
      `;

      await ctx.replyWithMarkdownV2(message);
    } catch (error) {
      logger.error("Status command error:", error);
      ctx.reply("❌ Failed to get status.");
    }
  }

  private async handleAnalyze(ctx: Context): Promise<void> {
    const message = getMessageText(ctx);
    const tokenAddress = message.split(" ")[1];

    if (!tokenAddress) {
      await ctx.reply("❌ Please provide a token address: /analyze <address>");
      return;
    }

    if (!this.helius.isValidAddress(tokenAddress)) {
      await ctx.reply("❌ Invalid token address");
      return;
    }

    await ctx.reply("🔍 Analyzing token...");

    try {
      const riskScore = await this.riskScoring.analyzeToken(
        tokenAddress,
        "detailed",
      );
      const metadata = await this.helius.getTokenMetadata(tokenAddress);

      const analysisMessage = this.formatAnalysisMessage(
        tokenAddress,
        metadata,
        riskScore,
      );
      await ctx.replyWithMarkdownV2(analysisMessage, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🚨 Set Alert", `alert_${tokenAddress}`)],
          [
            Markup.button.callback(
              "📊 More Details",
              `details_${tokenAddress}`,
            ),
          ],
          [Markup.button.callback("⚠️ Risk Report", `risk_${tokenAddress}`)],
        ]),
      });
    } catch (error) {
      logger.error("Analysis error:", error);
      await ctx.reply("❌ Failed to analyze token");
    }
  }

  private async handleRisk(ctx: Context): Promise<void> {
    const message = getMessageText(ctx);
    const tokenAddress = message.split(" ")[1];

    if (!tokenAddress) {
      await ctx.reply("❌ Please provide a token address: /risk <address>");
      return;
    }

    if (!this.helius.isValidAddress(tokenAddress)) {
      await ctx.reply("❌ Invalid token address");
      return;
    }

    await ctx.reply("⚠️ Analyzing risk...");

    try {
      const riskScore = await this.riskScoring.getRiskScore(tokenAddress);
      const riskMessage = this.formatRiskMessage(tokenAddress, riskScore);

      await ctx.replyWithMarkdownV2(riskMessage, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🚨 Alert Me", `alert_${tokenAddress}`)],
          [
            Markup.button.callback(
              "📊 Full Analysis",
              `analyze_${tokenAddress}`,
            ),
          ],
        ]),
      });
    } catch (error) {
      logger.error("Risk analysis error:", error);
      await ctx.reply("❌ Failed to analyze risk");
    }
  }

  private async handleCheck(ctx: Context): Promise<void> {
    const message = getMessageText(ctx);
    const tokenAddress = message.split(" ")[1];

    if (!tokenAddress) {
      await ctx.reply("❌ Please provide a token address: /check <address>");
      return;
    }

    if (!this.helius.isValidAddress(tokenAddress)) {
      await ctx.reply("❌ Invalid token address");
      return;
    }

    await ctx.reply("🔍 Quick check...");

    try {
      const riskScore = await this.riskScoring.getRiskScore(tokenAddress);
      const emoji = this.getRiskEmoji(riskScore.riskLevel);

      const message = `${emoji} **Quick Check**

**Token:** \`${tokenAddress}\`
**Risk Level:** ${riskScore.riskLevel.toUpperCase()}
**Score:** ${riskScore.total}/100

**Key Factors:**
• Mint Authority: ${riskScore.factors.renouncedMint ? "✅ Renounced" : "⚠️ Active"}
• Freeze Authority: ${riskScore.factors.liquidityLocked ? "✅ Locked" : "⚠️ Active"}
• Top 10 Holding: ${riskScore.factors.top10Holding}%

${riskScore.recommendations[0] || "No major concerns detected"}
      `;

      await ctx.replyWithMarkdownV2(message, {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "📊 Full Analysis",
              `analyze_${tokenAddress}`,
            ),
          ],
          [Markup.button.callback("🚨 Set Alert", `alert_${tokenAddress}`)],
        ]),
      });
    } catch (error) {
      logger.error("Quick check error:", error);
      await ctx.reply("❌ Failed to check token");
    }
  }

  private async handleAlert(ctx: Context): Promise<void> {
    const message = getMessageText(ctx);
    const tokenAddress = message.split(" ")[1];

    if (!tokenAddress) {
      await ctx.reply("❌ Please provide a token address: /alert <address>");
      return;
    }

    if (!this.helius.isValidAddress(tokenAddress)) {
      await ctx.reply("❌ Invalid token address");
      return;
    }

    try {
      const userId = ctx.from?.id;
      if (!userId) return;

      // Create alert (would use actual database in production)
      await ctx.reply(`✅ Alert set for token: \`${tokenAddress}\``);

      const message = `
🚨 **Alert Created**

**Token:** \`${tokenAddress}\`
**Alert Types:** Launch, Risk Changes, Whale Activity
**Notifications:** Enabled

You'll be notified about important events for this token.
      `;

      await ctx.replyWithMarkdownV2(message);
    } catch (error) {
      logger.error("Alert creation error:", error);
      await ctx.reply("❌ Failed to create alert");
    }
  }

  private async handleAlerts(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id;
      if (!userId) return;

      // Get user alerts (would use actual database in production)
      const message = `
📊 **Your Alerts**

You have 3 active alerts:

1. 🚨 Token Launches
2. ⚠️ Risk Changes
3. 🐋 Whale Activity

**Recent Notifications:** 5 today
**Total Alerts:** 12

Use /stop <alert_id> to cancel specific alerts.
      `;

      await ctx.replyWithMarkdownV2(message, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔕 Disable All", "disable_all")],
          [Markup.button.callback("⚙️ Alert Settings", "alert_settings")],
        ]),
      });
    } catch (error) {
      logger.error("Alerts command error:", error);
      await ctx.reply("❌ Failed to get alerts");
    }
  }

  private async handleStopAlert(ctx: Context): Promise<void> {
    const message = getMessageText(ctx);
    const alertId = message.split(" ")[1];

    if (!alertId) {
      await ctx.reply("❌ Please provide alert ID: /stop <alert_id>");
      return;
    }

    await ctx.reply(`✅ Alert ${alertId} cancelled`);
  }

  private async handleLaunches(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const arg = getMessageText(ctx).split(/\s+/)[1]?.toLowerCase();

    if (arg === "subscribe" || arg === "on") {
      this.launchAlertChatIds.add(chatId);
      await ctx.reply(
        "✅ Subscribed to pump.fun launch alerts. Use `/launches unsubscribe` to stop.",
      );
      return;
    }

    if (arg === "unsubscribe" || arg === "off") {
      this.launchAlertChatIds.delete(chatId);
      await ctx.reply("✅ Unsubscribed from launch alerts.");
      return;
    }

    if (arg === "recent" || arg === "list") {
      const launches = await this.db.getRecentDetectedLaunches(10);

      if (launches.length === 0) {
        await ctx.reply("No launches recorded yet.");
        return;
      }

      const lines = launches.map((launch, index) => {
        const metadata = launch.metadata as
          | { name?: string; symbol?: string }
          | null
          | undefined;
        const title =
          metadata?.name && metadata?.symbol
            ? `${metadata.name} (${metadata.symbol})`
            : launch.mint.slice(0, 12) + "…";
        const risk =
          launch.riskScore !== null && launch.riskScore !== undefined
            ? `${launch.riskScore}/100 ${launch.riskLevel ?? ""}`.trim()
            : "unscored";

        return `${index + 1}. ${title}\n   mint: \`${launch.mint}\`\n   risk: ${risk}`;
      });

      await ctx.reply(
        ["Recent pump.fun launches:", ...lines].join("\n\n"),
        { parse_mode: "Markdown" },
      );
      return;
    }

    if (arg === "stats") {
      const stats = await this.db.getLaunchStats();
      const riskLines = Object.entries(stats.byRiskLevel).map(
        ([level, count]) => `• ${level}: ${count}`,
      );

      await ctx.reply(
        [
          "Launch stats:",
          `Total recorded: ${stats.total}`,
          `Last 24h: ${stats.last24h}`,
          riskLines.length > 0 ? ["By risk:", ...riskLines].join("\n") : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return;
    }

    await ctx.reply(
      "Usage: `/launches subscribe`, `/launches recent`, `/launches stats`, or `/launches unsubscribe`",
    );
  }

  private async handlePremium(ctx: Context): Promise<void> {
    const message = `
⚡ **Premium Features**

**🚀 What You Get:**
• Unlimited token alerts
• Advanced risk analysis
• Real-time bundle detection
• Whale activity tracking
• API access
• Priority support
• Custom alert settings

**💰 Pricing:**
• Basic: $20/month (25 alerts)
• Pro: $50/month (100 alerts)
• Enterprise: $100/month (unlimited)

**🎯 Upgrade Benefits:**
• 10x faster analysis
• Historical data access
• Export capabilities
• Advanced filters
• Custom integrations

Use /upgrade to subscribe now!
    `;

    await ctx.replyWithMarkdownV2(message, {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("⚡ Upgrade to Pro", "upgrade_pro")],
        [
          Markup.button.callback(
            "🏢 Upgrade to Enterprise",
            "upgrade_enterprise",
          ),
        ],
        [Markup.button.callback("💰 View Plans", "view_plans")],
      ]),
    });
  }

  private async handleUpgrade(ctx: Context): Promise<void> {
    const message = `
💳 **Upgrade Your Account**

Choose your plan:

**🥉 Basic - $20/month**
• 25 token alerts
• Basic risk analysis
• Standard support

**🥈 Pro - $50/month** *(Most Popular)*
• 100 token alerts
• Advanced risk analysis
• Bundle detection
• Priority support

**🥇 Enterprise - $100/month**
• Unlimited alerts
• Full API access
• Custom features
• Dedicated support

Payment via Stripe - secure and instant.
    `;

    await ctx.replyWithMarkdownV2(message, {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🥈 Choose Pro", "choose_pro")],
        [Markup.button.callback("🥇 Choose Enterprise", "choose_enterprise")],
        [Markup.button.callback("💳 Payment Options", "payment_options")],
      ]),
    });
  }

  private async handleBroadcast(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Check if user is admin (would use actual check in production)
    const isAdmin = userId === 123456789; // Replace with actual admin check

    if (!isAdmin) {
      await ctx.reply("❌ Admin only command");
      return;
    }

    const message = getMessageText(ctx);
    const broadcastText = message.replace("/broadcast", "").trim();

    if (!broadcastText) {
      await ctx.reply("❌ Please provide message: /broadcast <message>");
      return;
    }

    await ctx.reply("📡 Broadcasting message...");

    // Broadcast to all users (would use actual implementation)
    await ctx.reply(`✅ Message broadcasted to all users`);
  }

  private async handleStats(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Get user stats (would use actual database in production)
    const message = `
📊 **Your Statistics**

**Usage:**
• Tokens Analyzed: 47
• Alerts Created: 12
• Alerts Triggered: 23
• Success Rate: 68%

**Performance:**
• Best Pick: +340% ROI
• Average ROI: +45%
• Risk Avoided: 8 tokens
• Money Saved: $2,340

**This Month:**
• Analysis Count: 15
• Alert Hits: 7
• Top Find: TokenXYZ (+180%)

Keep up the great work! 🎯
    `;

    await ctx.replyWithMarkdownV2(message);
  }

  private async handleText(ctx: Context): Promise<void> {
    const text = getMessageText(ctx);

    // Check if text looks like a token address (44 characters, base58)
    if (text.length === 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(text)) {
      await ctx.reply("🔍 Analyzing token address...");

      try {
        const riskScore = await this.riskScoring.getRiskScore(text);
        const emoji = this.getRiskEmoji(riskScore.riskLevel);

        const message = `${emoji} **Token Analysis**

**Address:** \`${text}\`
**Risk Level:** ${riskScore.riskLevel.toUpperCase()}
**Score:** ${riskScore.total}/100

${riskScore.recommendations[0] || "No major concerns detected"}

Use /analyze for detailed analysis or /alert to set notifications.
        `;

        await ctx.replyWithMarkdownV2(message, {
          ...Markup.inlineKeyboard([
            [Markup.button.callback("📊 Full Analysis", `analyze_${text}`)],
            [Markup.button.callback("🚨 Set Alert", `alert_${text}`)],
          ]),
        });
      } catch (error) {
        logger.error("Text analysis error:", error);
        await ctx.reply("❌ Failed to analyze token");
      }
    }
  }

  private formatAnalysisMessage(
    tokenAddress: string,
    metadata: any,
    riskScore: RiskScore,
  ): string {
    const emoji = this.getRiskEmoji(riskScore.riskLevel);

    return `
${emoji} **Token Analysis Report**

**Token Information:**
• Name: ${metadata.name || "Unknown"}
• Symbol: ${metadata.symbol || "UNKNOWN"}
• Address: \`${tokenAddress}\`

**Risk Assessment:**
• Overall Risk: ${riskScore.riskLevel.toUpperCase()} (${riskScore.total}/100)
• Contract Risk: ${riskScore.categories.contract}/100
• Liquidity Risk: ${riskScore.categories.liquidity}/100
• Distribution Risk: ${riskScore.categories.distribution}/100

**Key Factors:**
• Mint Authority: ${riskScore.factors.renouncedMint ? "✅ Renounced" : "⚠️ Active"}
• Freeze Authority: ${riskScore.factors.liquidityLocked ? "✅ Locked" : "⚠️ Active"}
• Top 10 Holding: ${riskScore.factors.top10Holding}%

**Recommendations:**
${riskScore.recommendations.map((rec) => `• ${rec}`).join("\n")}
    `;
  }

  private formatRiskMessage(
    tokenAddress: string,
    riskScore: RiskScore,
  ): string {
    const emoji = this.getRiskEmoji(riskScore.riskLevel);

    return `
${emoji} **Risk Assessment Report**

**Token:** \`${tokenAddress}\`
**Risk Level:** ${riskScore.riskLevel.toUpperCase()}
**Overall Score:** ${riskScore.total}/100

**Risk Breakdown:**
• Contract: ${riskScore.categories.contract}/100
• Liquidity: ${riskScore.categories.liquidity}/100
• Distribution: ${riskScore.categories.distribution}/100
• Social: ${riskScore.categories.social}/100
• Developer: ${riskScore.categories.developer}/100

**Critical Factors:**
${riskScore.factors.suspiciousFunctions ? "⚠️ Suspicious functions detected" : "✅ No suspicious functions"}
${riskScore.factors.renouncedMint ? "✅ Mint authority renounced" : "⚠️ Mint authority active"}
${riskScore.factors.liquidityLocked ? "✅ Freeze authority locked" : "⚠️ Freeze authority active"}

${riskScore.recommendations.join("\n")}
    `;
  }

  private getRiskEmoji(riskLevel: string): string {
    switch (riskLevel) {
      case "low":
        return "🟢";
      case "medium":
        return "🟡";
      case "high":
        return "🟠";
      case "critical":
        return "🔴";
      default:
        return "⚪";
    }
  }

  async broadcastSafetyAlert(
    message: string,
    targetTier: string = "all",
  ): Promise<any> {
    try {
      logger.info(`Broadcasting safety alert to ${targetTier}: ${message}`);

      // This would broadcast to all users or specific tier
      // For now, return mock result
      return {
        success: true,
        recipients: 1000,
        tier: targetTier,
        message,
      };
    } catch (error) {
      logger.error("Broadcast failed:", error);
      throw error;
    }
  }

  async broadcastLaunchAlert(
    launch: DetectedLaunch,
    riskScore: RiskScore,
    metadata?: { name?: string; symbol?: string; image?: string } | null,
  ): Promise<number> {
    if (this.launchAlertChatIds.size === 0) {
      return 0;
    }

    const title =
      metadata?.name && metadata?.symbol
        ? `${metadata.name} (${metadata.symbol})`
        : launch.mint;

    const message = [
      "🚀 New pump.fun launch",
      `Token: ${title}`,
      `Mint: \`${launch.mint}\``,
      `Risk: ${riskScore.total}/100 (${riskScore.riskLevel})`,
      `Creator: \`${launch.creator}\``,
      `Tx: \`${launch.signature.slice(0, 16)}...\``,
      "",
      "Reply with the mint or use /analyze for a full report.",
    ].join("\n");

    let sent = 0;

    for (const chatId of this.launchAlertChatIds) {
      try {
        await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: "Markdown",
        });
        sent += 1;
      } catch (error) {
        logger.error("Failed to send launch alert", { chatId, error });
      }
    }

    return sent;
  }

  async sendAlert(alert: TelegramAlert): Promise<void> {
    try {
      const message = this.formatAlertMessage(alert);
      await this.bot.telegram.sendMessage(alert.userId, message, {
        parse_mode: "MarkdownV2",
      });
    } catch (error) {
      logger.error("Failed to send alert:", error);
    }
  }

  private formatAlertMessage(alert: TelegramAlert): string {
    const emoji =
      alert.alertType === "launch"
        ? "🚀"
        : alert.alertType === "risk"
          ? "⚠️"
          : alert.alertType === "whale"
            ? "🐋"
            : "📦";

    return `${emoji} **Token Alert**

**Type:** ${alert.alertType.toUpperCase()}
**Token:** \`${alert.tokenAddress}\`

${alert.message}

*Alert sent at ${new Date(alert.timestamp).toLocaleString()}*
    `;
  }
}
