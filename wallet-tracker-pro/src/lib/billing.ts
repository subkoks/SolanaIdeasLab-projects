import { SUBSCRIBER_TIERS, type SubscriberTier } from './watch-limits'

export const TIER_DISPLAY_PRICES_USD: Record<SubscriberTier, number> = {
  free: 0,
  basic: 9,
  pro: 29,
  enterprise: 99,
}

export const isBillingMockMode = (stripeSecretKey: string): boolean =>
  stripeSecretKey.trim().length === 0

export const getBillingStatus = (stripeSecretKey: string) => ({
  mode: isBillingMockMode(stripeSecretKey)
    ? ('mock' as const)
    : ('stripe' as const),
  tiers: SUBSCRIBER_TIERS,
  pricesUsd: TIER_DISPLAY_PRICES_USD,
  message: isBillingMockMode(stripeSecretKey)
    ? 'Stripe not configured — use /upgrade <tier> for local dev tier changes.'
    : 'Stripe billing configured — checkout via dashboard when available.',
})
