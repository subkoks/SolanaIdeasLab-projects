import { NextResponse } from 'next/server'
import { z } from 'zod'
import { config } from '@/lib/config'
import { isBillingMockMode } from '@/lib/billing'
import { isValidSubscriberTier } from '@/lib/watch-limits'
import { DatabaseService } from '@/services/database'

const bodySchema = z.object({
  chatId: z.string().min(1),
  tier: z.string().min(1),
})

export async function POST(request: Request): Promise<NextResponse> {
  if (!isBillingMockMode(config.stripe.secretKey)) {
    return NextResponse.json(
      { error: 'Mock upgrade disabled when Stripe is configured.' },
      { status: 403 },
    )
  }

  const database = new DatabaseService()

  try {
    const body = bodySchema.parse(await request.json())
    if (!isValidSubscriberTier(body.tier) || body.tier === 'free') {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    await database.connect()
    await database.upsertSubscriber(body.chatId)
    await database.setSubscriberTier(body.chatId, body.tier)
    const limits = await database.getSubscriberLimits(body.chatId)

    return NextResponse.json({
      mode: 'mock',
      tier: body.tier,
      limits,
      message: 'Mock tier applied. Use Telegram /limits to verify.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Mock upgrade failed',
      },
      { status: 400 },
    )
  } finally {
    await database.disconnect()
  }
}
