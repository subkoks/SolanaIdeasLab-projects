import { getBillingStatus, isBillingMockMode } from '../src/lib/billing'
import { buildSubscriberTierSyncFromEvent } from '../src/lib/stripe-webhook'

describe('wallet tracker billing', () => {
  it('uses mock mode without stripe key', () => {
    expect(isBillingMockMode('')).toBe(true)
    expect(getBillingStatus('').mode).toBe('mock')
  })

  it('maps checkout events with chatId metadata', () => {
    const payload = buildSubscriberTierSyncFromEvent(
      {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { chatId: '12345', tier: 'pro' },
          },
        },
      } as never,
      { basic: 'p1', pro: 'p2', enterprise: 'p3' },
    )

    expect(payload).toEqual({
      chatId: '12345',
      tier: 'pro',
      status: 'active',
    })
  })
})
