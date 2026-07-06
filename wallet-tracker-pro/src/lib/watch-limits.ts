export const WATCH_LIMITS_BY_TIER = {
  free: 3,
  basic: 10,
  pro: 25,
  enterprise: 100,
} as const

export type SubscriberTier = keyof typeof WATCH_LIMITS_BY_TIER

export const SUBSCRIBER_TIERS = Object.keys(
  WATCH_LIMITS_BY_TIER,
) as SubscriberTier[]

export const getWatchLimitForTier = (tier: string): number =>
  WATCH_LIMITS_BY_TIER[tier as SubscriberTier] ??
  WATCH_LIMITS_BY_TIER.free

export const isValidSubscriberTier = (tier: string): tier is SubscriberTier =>
  SUBSCRIBER_TIERS.includes(tier as SubscriberTier)
