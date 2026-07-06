import { getBillingStatus, isBillingMockMode } from '../src/utils/billing'

describe('billing helpers', () => {
  it('uses mock mode when Stripe secret is empty', () => {
    expect(isBillingMockMode('')).toBe(true)
    expect(getBillingStatus('').mode).toBe('mock')
  })

  it('uses stripe mode when secret is configured', () => {
    expect(isBillingMockMode('sk_test_abc')).toBe(false)
    expect(getBillingStatus('sk_test_abc').mode).toBe('stripe')
  })
})
