import {
  createSubscriberCheckoutSession,
  getBillingStatus,
  isBillingMockMode,
} from '../src/lib/billing'
import { buildSubscriberTierSyncFromEvent } from '../src/lib/stripe-webhook'

const emptyPrices = { basic: '', pro: '', enterprise: '' }

describe('wallet tracker billing', () => {
  it('uses mock mode without stripe key', () => {
    expect(isBillingMockMode('')).toBe(true)
    expect(getBillingStatus('', '', emptyPrices).mode).toBe('mock')
  })

  it('reports stripe config readiness', () => {
    const status = getBillingStatus('sk_test', 'whsec_test', {
      basic: 'p1',
      pro: 'p2',
      enterprise: 'p3',
    })
    expect(status.mode).toBe('stripe')
    expect(status.stripeConfig.liveReady).toBe(true)
  })

  it('creates mock subscriber checkout sessions', () => {
    const session = createSubscriberCheckoutSession('', {
      chatId: '12345',
      tier: 'pro',
    })

    expect(session.mode).toBe('mock')
    if (session.mode === 'mock') {
      expect(session.tier).toBe('pro')
      expect(session.priceUsd).toBe(29)
    }
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
