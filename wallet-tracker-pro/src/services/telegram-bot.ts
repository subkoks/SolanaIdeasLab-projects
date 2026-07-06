import { Context, Telegraf } from 'telegraf'
import { config } from '../lib/config'
import { getBillingStatus, isBillingMockMode, resolveSubscriberCheckoutSession } from '../lib/billing'
import { isValidSubscriberTier } from '../lib/watch-limits'
import { logger } from '../lib/logger'
import type { DatabaseService } from './database'
import type { SolanaWatcherService } from './solana-watcher'

const getMessageText = (context: Context): string => {
  const message = context.message
  if (!message || !('text' in message)) {
    return ''
  }
  return message.text
}

export class WalletTrackerTelegramBot {
  constructor(
    private readonly bot: Telegraf<Context>,
    private readonly database: DatabaseService,
    private readonly watcher: SolanaWatcherService,
  ) {}

  public registerCommands(): void {
    this.bot.start(async (context) => this.handleStart(context))
    this.bot.help(async (context) => this.handleHelp(context))
    this.bot.command('watch', async (context) => this.handleWatch(context))
    this.bot.command('unwatch', async (context) => this.handleUnwatch(context))
    this.bot.command('list', async (context) => this.handleList(context))
    this.bot.command('activity', async (context) => this.handleActivity(context))
    this.bot.command('limits', async (context) => this.handleLimits(context))
    this.bot.command('billing', async (context) => this.handleBilling(context))
    this.bot.command('upgrade', async (context) => this.handleUpgrade(context))

    this.bot.catch((error) => {
      logger.error('Telegram bot error', { error })
    })
  }

  public async launch(): Promise<void> {
    await this.bot.launch()
    logger.info('Wallet Tracker Telegram bot launched', {
      username: config.telegram.botUsername,
    })
  }

  public async stop(): Promise<void> {
    this.bot.stop('shutdown')
  }

  private async handleStart(context: Context): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    await this.database.upsertSubscriber(
      String(chatId),
      context.from?.username,
    )

    await context.reply(
      [
        'Wallet Tracker Pro — Telegram MVP',
        '',
        'Track Solana wallets and get activity alerts.',
        '',
        '/watch <wallet> [label] — add a wallet',
        '/list — your watchlist',
        '/unwatch <wallet> — remove',
        '/activity [wallet] — recent moves',
        '/limits — your watch tier and capacity',
        '/billing — tier and pricing mode',
        '/upgrade <tier> — mock tier upgrade (dev)',
      ].join('\n'),
    )
  }

  private async handleHelp(context: Context): Promise<void> {
    await this.handleStart(context)
  }

  private async handleWatch(context: Context): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    const parts = getMessageText(context).split(/\s+/).slice(1)
    const walletAddress = parts[0]
    const label = parts.slice(1).join(' ') || undefined

    if (!walletAddress) {
      await context.reply('Usage: /watch <wallet-address> [label]')
      return
    }

    if (!this.watcher.isValidAddress(walletAddress)) {
      await context.reply('Invalid Solana wallet address.')
      return
    }

    try {
      await this.database.addWatch(String(chatId), walletAddress, label)
      await context.reply(`Watching ${walletAddress}${label ? ` (${label})` : ''}.`)
    } catch (error) {
      await context.reply(
        error instanceof Error ? error.message : 'Failed to add watch',
      )
    }
  }

  private async handleUnwatch(context: Context): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    const walletAddress = getMessageText(context).split(/\s+/)[1]
    if (!walletAddress) {
      await context.reply('Usage: /unwatch <wallet-address>')
      return
    }

    const result = await this.database.removeWatch(String(chatId), walletAddress)
    if (!result || result.count === 0) {
      await context.reply('Wallet not found on your watchlist.')
      return
    }

    await context.reply(`Stopped watching ${walletAddress}.`)
  }

  private async handleList(context: Context): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    const watches = await this.database.listWatches(String(chatId))
    if (watches.length === 0) {
      await context.reply('Your watchlist is empty. Use /watch <wallet>.')
      return
    }

    const lines = watches.map(
      (watch, index) =>
        `${index + 1}. ${watch.walletAddress}${watch.label ? ` — ${watch.label}` : ''}`,
    )

    await context.reply(['Your watchlist:', ...lines].join('\n'))
  }

  private async handleActivity(context: Context): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    const walletAddress = getMessageText(context).split(/\s+/)[1]
    const watches = await this.database.listWatches(String(chatId))

    const target =
      walletAddress ??
      watches[0]?.walletAddress

    if (!target) {
      await context.reply('Usage: /activity <wallet> or add a watch first.')
      return
    }

    const events = await this.database.getRecentActivity(target, 5)
    if (events.length === 0) {
      await context.reply(`No recorded activity for ${target} yet.`)
      return
    }

    const lines = events.map(
      (event) =>
        `• ${event.direction} ${event.summary ?? ''} (${event.signature.slice(0, 12)}…)`,
    )

    await context.reply([`Recent activity for ${target}:`, ...lines].join('\n'))
  }

  private async handleLimits(context: Context): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    await this.database.upsertSubscriber(
      String(chatId),
      context.from?.username,
    )

    const limits = await this.database.getSubscriberLimits(String(chatId))
    if (!limits) {
      await context.reply('Could not load your limits.')
      return
    }

    await context.reply(
      [
        `Tier: ${limits.tier}`,
        `Watches: ${limits.used}/${limits.limit} (${limits.remaining} remaining)`,
      ].join('\n'),
    )
  }

  private async handleBilling(context: Context): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    await this.database.upsertSubscriber(
      String(chatId),
      context.from?.username,
    )

    const billing = getBillingStatus(config.stripe.secretKey)
    const limits = await this.database.getSubscriberLimits(String(chatId))

    await context.reply(
      [
        `Billing: ${billing.mode}`,
        billing.message,
        '',
        limits
          ? `Your tier: ${limits.tier} (${limits.used}/${limits.limit} watches)`
          : 'Tier: free',
        '',
        `Basic $${billing.pricesUsd.basic}/mo — Pro $${billing.pricesUsd.pro}/mo`,
      ].join('\n'),
    )
  }

  private async handleUpgrade(context: Context): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    const tier = getMessageText(context).split(/\s+/)[1]?.toLowerCase()

    if (!tier || !isValidSubscriberTier(tier) || tier === 'free') {
      await context.reply(
        'Usage: /upgrade basic|pro|enterprise\n(Mock dev upgrade when Stripe is not configured.)',
      )
      return
    }

    if (isBillingMockMode(config.stripe.secretKey)) {
      await this.database.upsertSubscriber(
        String(chatId),
        context.from?.username,
      )
      await this.database.setSubscriberTier(String(chatId), tier)

      const limits = await this.database.getSubscriberLimits(String(chatId))
      await context.reply(
        `Upgraded to ${tier}. Watches: ${limits?.used ?? 0}/${limits?.limit ?? 0}`,
      )
      return
    }

    await this.database.upsertSubscriber(
      String(chatId),
      context.from?.username,
    )

    const session = await resolveSubscriberCheckoutSession(
      config.stripe.secretKey,
      config.stripe.prices,
      {
        chatId: String(chatId),
        tier,
      },
    )

    if (session.mode === 'stripe' && 'error' in session) {
      await context.reply(`Checkout unavailable: ${session.error}`)
      return
    }

    if ('checkoutUrl' in session) {
      await context.reply(
        [
          `Checkout for ${tier} ($${session.priceUsd}/mo):`,
          session.checkoutUrl,
        ].join('\n'),
      )
    }
  }

  public async notifyChat(chatId: string, message: string): Promise<void> {
    await this.bot.telegram.sendMessage(Number(chatId), message)
  }
}
