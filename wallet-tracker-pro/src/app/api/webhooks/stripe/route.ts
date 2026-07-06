import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { isBillingMockMode } from '@/lib/billing'
import {
  buildSubscriberTierSyncFromEvent,
  constructStripeEvent,
} from '@/lib/stripe-webhook'
import { DatabaseService } from '@/services/database'
import { logger } from '@/lib/logger'

export async function POST(request: Request): Promise<NextResponse> {
  if (isBillingMockMode(config.stripe.secretKey)) {
    return NextResponse.json(
      { configured: false, message: 'Stripe webhook disabled in mock mode.' },
      { status: 503 },
    )
  }

  if (!config.stripe.webhookSecret.trim()) {
    return NextResponse.json(
      { configured: false, message: 'STRIPE_WEBHOOK_SECRET is not configured.' },
      { status: 503 },
    )
  }

  const database = new DatabaseService()

  try {
    const rawBody = Buffer.from(await request.arrayBuffer())
    const signature = request.headers.get('stripe-signature') ?? undefined
    const event = await constructStripeEvent(
      rawBody,
      signature,
      config.stripe.secretKey,
      config.stripe.webhookSecret,
    )

    const sync = buildSubscriberTierSyncFromEvent(event, config.stripe.prices)

    if (sync) {
      await database.connect()
      await database.setSubscriberTier(sync.chatId, sync.tier)
      logger.info('Stripe subscriber tier synced', {
        chatId: sync.chatId,
        tier: sync.tier,
        status: sync.status,
        eventType: event.type,
      })
    }

    return NextResponse.json({
      received: true,
      synced: Boolean(sync),
      type: event.type,
    })
  } catch (error) {
    logger.error('Wallet tracker Stripe webhook failed', { error })
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Stripe webhook failed',
      },
      { status: 400 },
    )
  } finally {
    await database.disconnect()
  }
}
