import { createCheckoutSession, getBillingStatus, isBillingMockMode } from '../src/utils/billing'

describe('billing helpers', () => {
  it('uses mock mode when Stripe secret is empty', () => {
    expect(isBillingMockMode('')).toBe(true)
    expect(getBillingStatus('').mode).toBe('mock')
  })

  it('creates mock checkout sessions without Stripe keys', () => {
    const session = createCheckoutSession('', {
      tier: 'basic',
      userId: 'user-2',
    })

    expect(session.mode).toBe('mock')
    if (session.mode === 'mock') {
      expect(session.priceUsd).toBe(9)
    }
  })
})
