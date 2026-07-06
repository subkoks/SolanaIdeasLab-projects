import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getBillingStatus } from '@/lib/billing'
import { WATCH_LIMITS_BY_TIER } from '@/lib/watch-limits'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ...getBillingStatus(config.stripe.secretKey),
    watchLimits: WATCH_LIMITS_BY_TIER,
  })
}
