import {
  SUBSCRIBER_TIERS,
  type SubscriberTier,
} from './watch-limits'

export const TIER_DISPLAY_PRICES_USD: Record<SubscriberTier, number> = {
  free: 0,
  basic: 9,
  pro: 29,
  enterprise: 99,
}

export interface StripePriceIds {
  basic: string
  pro: string
  enterprise: string
}

export interface SubscriberCheckoutRequest {
  chatId: string
  tier: Exclude<SubscriberTier, 'free'>
  successUrl?: string
  cancelUrl?: string
}

export type CheckoutSessionResult =
  | {
      mode: 'mock'
      checkoutUrl: string
      sessionId: string
      tier: SubscriberTier
      priceUsd: number
      message: string
    }
  | {
      mode: 'stripe'
      checkoutUrl: string
      sessionId: string
      tier: SubscriberTier
      priceUsd: number
      message: string
    }
  | {
      mode: 'stripe'
      error: string
    }

export const isBillingMockMode = (stripeSecretKey: string): boolean =>
  stripeSecretKey.trim().length === 0

export const isDevTierUpgradeAllowed = (
  stripeSecretKey: string,
  enabled: boolean,
): boolean => enabled && isBillingMockMode(stripeSecretKey)

const getSafeBaseUrl = (appBaseUrl: string): URL => {
  try {
    return new URL(appBaseUrl)
  } catch {
    return new URL('http://localhost:3001')
  }
}

export const getSafeReturnUrl = (
  candidate: string | undefined,
  fallbackPath: string,
  appBaseUrl = 'http://localhost:3001',
): string => {
  const baseUrl = getSafeBaseUrl(appBaseUrl)
  const fallback = new URL(fallbackPath, baseUrl)

  if (!candidate) {
    return fallback.toString()
  }

  // First try to interpret the candidate as an absolute URL (no base). If it
  // parses as absolute, only allow it when its origin matches the app origin.
  try {
    const absolute = new URL(candidate)
    return absolute.origin === baseUrl.origin
      ? absolute.toString()
      : fallback.toString()
  } catch {
    // Not an absolute URL: only allow it as a same-origin relative path.
    // Reject anything that does not begin with "/" so scheme-less tricks
    // (e.g. "ht!tp://evil" or "//evil.com") cannot be smuggled in as a path.
    if (!candidate.startsWith('/')) {
      return fallback.toString()
    }
    try {
      const requested = new URL(candidate, baseUrl)
      return requested.origin === baseUrl.origin
        ? requested.toString()
        : fallback.toString()
    } catch {
      return fallback.toString()
    }
  }
}

export const getStripeConfigStatus = (
  secretKey: string,
  webhookSecret: string,
  prices: StripePriceIds,
): {
  liveReady: boolean
  priceIds: Record<'basic' | 'pro' | 'enterprise', boolean>
  secretKey: boolean
  webhookSecret: boolean
} => {
  const priceIds = {
    basic: prices.basic.trim().length > 0,
    pro: prices.pro.trim().length > 0,
    enterprise: prices.enterprise.trim().length > 0,
  }

  const hasSecret = secretKey.trim().length > 0
  const hasWebhook = webhookSecret.trim().length > 0

  return {
    secretKey: hasSecret,
    webhookSecret: hasWebhook,
    priceIds,
    liveReady:
      hasSecret &&
      hasWebhook &&
      priceIds.basic &&
      priceIds.pro &&
      priceIds.enterprise,
  }
}

export const getBillingStatus = (
  secretKey: string,
  webhookSecret: string,
  prices: StripePriceIds,
  allowDevTierUpgrade = false,
) => ({
  mode: isBillingMockMode(secretKey)
    ? ('mock' as const)
    : ('stripe' as const),
  tiers: SUBSCRIBER_TIERS,
  pricesUsd: TIER_DISPLAY_PRICES_USD,
  stripeConfig: getStripeConfigStatus(secretKey, webhookSecret, prices),
  message: isBillingMockMode(secretKey)
    ? allowDevTierUpgrade
      ? 'Stripe not configured — local dev tier changes are enabled.'
      : 'Stripe not configured — direct tier changes are disabled.'
    : getStripeConfigStatus(secretKey, webhookSecret, prices).liveReady
      ? 'Stripe live-ready — checkout + webhook configured.'
      : 'Stripe partial config — complete keys, webhook secret, and price IDs.',
})

export const createSubscriberCheckoutSession = (
  stripeSecretKey: string,
  request: SubscriberCheckoutRequest,
  appBaseUrl = 'http://localhost:3001',
): CheckoutSessionResult => {
  if (isBillingMockMode(stripeSecretKey)) {
    const sessionId = `mock_cs_${request.chatId}_${request.tier}_${Date.now()}`
    const successUrl = getSafeReturnUrl(
      request.successUrl,
      `/?checkout=success&session=${sessionId}`,
      appBaseUrl,
    )

    return {
      mode: 'mock',
      checkoutUrl: successUrl,
      sessionId,
      tier: request.tier,
      priceUsd: TIER_DISPLAY_PRICES_USD[request.tier],
      message:
        'Mock checkout — use mock upgrade or POST /api/billing/mock-upgrade.',
    }
  }

  return {
    mode: 'stripe',
    error: 'Use resolveSubscriberCheckoutSession for Stripe SDK checkout.',
  }
}

export const resolveSubscriberCheckoutSession = async (
  stripeSecretKey: string,
  prices: StripePriceIds,
  request: SubscriberCheckoutRequest,
  appBaseUrl = 'http://localhost:3001',
): Promise<CheckoutSessionResult> => {
  const mockOrFallback = createSubscriberCheckoutSession(
    stripeSecretKey,
    request,
    appBaseUrl,
  )
  if (mockOrFallback.mode === 'mock') {
    return mockOrFallback
  }

  const priceId = prices[request.tier]
  if (!priceId.trim()) {
    return {
      mode: 'stripe',
      error: `Stripe price ID not configured for tier ${request.tier}`,
    }
  }

  try {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(stripeSecretKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: getSafeReturnUrl(
        request.successUrl,
        '/?checkout=success&session={CHECKOUT_SESSION_ID}',
        appBaseUrl,
      ),
      cancel_url: getSafeReturnUrl(
        request.cancelUrl,
        '/?checkout=cancel',
        appBaseUrl,
      ),
      client_reference_id: request.chatId,
      metadata: { chatId: request.chatId, tier: request.tier },
      subscription_data: {
        metadata: { chatId: request.chatId, tier: request.tier },
      },
    })

    if (!session.url) {
      return {
        mode: 'stripe',
        error: 'Stripe session missing checkout URL',
      }
    }

    return {
      mode: 'stripe',
      checkoutUrl: session.url,
      sessionId: session.id,
      tier: request.tier,
      priceUsd: TIER_DISPLAY_PRICES_USD[request.tier],
      message: 'Stripe checkout session created.',
    }
  } catch (error) {
    return {
      mode: 'stripe',
      error:
        error instanceof Error
          ? error.message
          : 'Stripe checkout session failed',
    }
  }
}
