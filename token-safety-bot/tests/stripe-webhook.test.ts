import {
  buildTierSyncFromStripeEvent,
  mapPriceIdToTier,
} from '../src/utils/stripe-webhook'

describe('stripe webhook mapping', () => {
  const prices = {
    basic: 'price_basic',
    pro: 'price_pro',
    enterprise: 'price_enterprise',
  }

  it('maps checkout.session.completed to tier sync payload', () => {
    const payload = buildTierSyncFromStripeEvent(
      {
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: 'user-1',
            metadata: { tier: 'pro', userId: 'user-1' },
            subscription: 'sub_123',
          },
        },
      } as never,
      prices,
    )

    expect(payload).toEqual({
      userId: 'user-1',
      tier: 'pro',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
    })
  })

  it('maps subscription deletion to free tier', () => {
    const payload = buildTierSyncFromStripeEvent(
      {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            metadata: { userId: 'user-2' },
          },
        },
      } as never,
      prices,
    )

    expect(payload).toEqual({
      userId: 'user-2',
      tier: 'free',
      stripeSubscriptionId: 'sub_123',
      status: 'cancelled',
    })
  })

  it('maps price ids to tiers', () => {
    expect(mapPriceIdToTier(prices, 'price_pro')).toBe('pro')
  })
})
