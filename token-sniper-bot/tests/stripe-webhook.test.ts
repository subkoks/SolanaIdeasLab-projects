import {
  buildTierSyncFromStripeEvent,
  isBillingTier,
  mapPriceIdToTier,
} from '../src/utils/stripe-webhook'

describe('stripe webhook mapping', () => {
  const prices = { basic: 'price_basic', pro: 'price_pro', enterprise: 'price_enterprise' }

  it('maps checkout.session.completed', () => {
    const payload = buildTierSyncFromStripeEvent(
      {
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: 'user-9',
            metadata: { tier: 'basic' },
            subscription: 'sub_9',
          },
        },
      } as never,
      prices,
    )

    expect(payload?.tier).toBe('basic')
    expect(payload?.userId).toBe('user-9')
  })

  it('maps price ids to tiers', () => {
    expect(mapPriceIdToTier(prices, 'price_pro')).toBe('pro')
    expect(mapPriceIdToTier(prices, 'price_enterprise')).toBe('enterprise')
    expect(mapPriceIdToTier(prices, 'price_basic')).toBe('basic')
    expect(mapPriceIdToTier(prices, undefined)).toBeNull()
    expect(mapPriceIdToTier(prices, 'unknown')).toBeNull()
  })

  it('isBillingTier validates tier names', () => {
    expect(isBillingTier('free')).toBe(true)
    expect(isBillingTier('enterprise')).toBe(true)
    expect(isBillingTier('platinum')).toBe(false)
    expect(isBillingTier('')).toBe(false)
  })
})
