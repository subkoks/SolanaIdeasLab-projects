import { createCheckoutSession, getBillingStatus, isBillingMockMode } from '../src/utils/billing'

describe('billing helpers', () => {
  it('uses mock mode when Stripe secret is empty', () => {
    expect(isBillingMockMode('')).toBe(true)
    expect(getBillingStatus('').mode).toBe('mock')
    expect(getBillingStatus('').pricesUsd.pro).toBe(29)
  })

  it('uses stripe mode when secret is configured', () => {
    expect(isBillingMockMode('sk_test_abc')).toBe(false)
    expect(getBillingStatus('sk_test_abc').mode).toBe('stripe')
  })

  it('creates mock checkout sessions without Stripe keys', () => {
    const session = createCheckoutSession('', {
      tier: 'pro',
      userId: 'user-1',
    })

    expect(session.mode).toBe('mock')
    if (session.mode === 'mock') {
      expect(session.tier).toBe('pro')
      expect(session.priceUsd).toBe(29)
      expect(session.checkoutUrl).toContain('mock')
    }
  })

  it('rejects free tier checkout', () => {
    expect(() =>
      createCheckoutSession('', { tier: 'free', userId: 'user-1' }),
    ).toThrow('Free tier')
  })
})
