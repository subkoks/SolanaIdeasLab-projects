import { NextResponse } from 'next/server'
import { z } from 'zod'
import { config } from '@/lib/config'
import { isBillingMockMode } from '@/lib/billing'
import { applySubscriberTierSync } from '@/lib/subscriber-tier-sync'
import { isValidSubscriberTier } from '@/lib/watch-limits'
import { DatabaseService } from '@/services/database'

const bodySchema = z.object({
  chatId: z.string().min(1),
  tier: z.string().min(1),
  status: z.enum(['active', 'cancelled']).optional(),
})

const devWebhookAllowed = (): boolean =>
  isBillingMockMode(config.stripe.secretKey) ||
  process.env.BILLING_DEV_WEBHOOK === 'true'

export async function POST(request: Request): Promise<NextResponse> {
  if (!devWebhookAllowed()) {
    return NextResponse.json(
      { error: 'Dev webhook simulation disabled when Stripe is configured.' },
      { status: 403 },
    )
  }

  const database = new DatabaseService()

  try {
    const body = bodySchema.parse(await request.json())
    if (!isValidSubscriberTier(body.tier) && body.tier !== 'free') {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    await database.connect()

    const tier =
      body.tier === 'free'
        ? 'free'
        : (body.tier as 'basic' | 'pro' | 'enterprise')

    await applySubscriberTierSync(
      (chatId) => database.upsertSubscriber(chatId),
      (chatId, tierValue) => database.setSubscriberTier(chatId, tierValue),
      {
        chatId: body.chatId,
        tier,
        status: body.status ?? 'active',
      },
    )

    const limits = await database.getSubscriberLimits(body.chatId)

    return NextResponse.json({
      mode: 'dev-webhook',
      synced: true,
      chatId: body.chatId,
      tier: limits?.tier ?? tier,
      limits,
      message: 'Simulated Stripe checkout.session.completed tier sync.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Dev webhook simulation failed',
      },
      { status: 400 },
    )
  } finally {
    await database.disconnect()
  }
}
