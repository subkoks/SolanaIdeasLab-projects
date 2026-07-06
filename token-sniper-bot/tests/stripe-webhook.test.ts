import { buildTierSyncFromStripeEvent } from '../src/utils/stripe-webhook'

describe('stripe webhook mapping', () => {
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
      { basic: 'price_basic', pro: 'price_pro', enterprise: 'price_enterprise' },
    )

    expect(payload?.tier).toBe('basic')
    expect(payload?.userId).toBe('user-9')
  })
})
