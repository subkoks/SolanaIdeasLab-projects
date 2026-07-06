import { NextResponse } from 'next/server'
import { z } from 'zod'
import { config } from '@/lib/config'
import { resolveSubscriberCheckoutSession } from '@/lib/billing'
import { isValidSubscriberTier } from '@/lib/watch-limits'
import { DatabaseService } from '@/services/database'

const bodySchema = z.object({
  chatId: z.string().min(1),
  tier: z.string().min(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  const database = new DatabaseService()

  try {
    const body = bodySchema.parse(await request.json())
    if (!isValidSubscriberTier(body.tier) || body.tier === 'free') {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    await database.connect()
    await database.upsertSubscriber(body.chatId)

    const session = await resolveSubscriberCheckoutSession(
      config.stripe.secretKey,
      config.stripe.prices,
      {
        chatId: body.chatId,
        tier: body.tier,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
      },
    )

    if (session.mode === 'stripe' && 'error' in session) {
      return NextResponse.json(session, {
        status: session.error.includes('not configured') ? 501 : 502,
      })
    }

    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Checkout session failed',
      },
      { status: 400 },
    )
  } finally {
    await database.disconnect()
  }
}
