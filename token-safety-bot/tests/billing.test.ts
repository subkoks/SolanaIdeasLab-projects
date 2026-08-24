import {
  createCheckoutSession,
  getBillingStatus,
  isBillingMockMode,
  isDevTierUpgradeAllowed,
} from '../src/utils/billing'

describe('billing helpers', () => {
  it('uses mock mode when Stripe secret is empty', () => {
    expect(isBillingMockMode('')).toBe(true)
    expect(getBillingStatus('').mode).toBe('mock')
    expect(isDevTierUpgradeAllowed('', false)).toBe(false)
    expect(isDevTierUpgradeAllowed('', true)).toBe(true)
    expect(isDevTierUpgradeAllowed('sk_test_abc', true)).toBe(false)
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
