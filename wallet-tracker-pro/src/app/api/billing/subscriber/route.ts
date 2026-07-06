import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getBillingStatus } from '@/lib/billing'
import { DatabaseService } from '@/services/database'

export async function GET(request: Request): Promise<NextResponse> {
  const chatId = new URL(request.url).searchParams.get('chatId')?.trim()

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 })
  }

  const database = new DatabaseService()

  try {
    await database.connect()
    await database.upsertSubscriber(chatId)
    const limits = await database.getSubscriberLimits(chatId)

    return NextResponse.json({
      chatId,
      billingMode: getBillingStatus(
        config.stripe.secretKey,
        config.stripe.webhookSecret,
        config.stripe.prices,
      ).mode,
      tier: limits?.tier ?? 'free',
      limits,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load subscriber',
      },
      { status: 400 },
    )
  } finally {
    await database.disconnect()
  }
}
