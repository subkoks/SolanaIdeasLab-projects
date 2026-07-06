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

export const getBillingStatus = (stripeSecretKey: string) => ({
  mode: isBillingMockMode(stripeSecretKey)
    ? ('mock' as const)
    : ('stripe' as const),
  tiers: SUBSCRIBER_TIERS,
  pricesUsd: TIER_DISPLAY_PRICES_USD,
  message: isBillingMockMode(stripeSecretKey)
    ? 'Stripe not configured — use /upgrade <tier> for local dev tier changes.'
    : 'Stripe billing configured — checkout from dashboard or /upgrade.',
})

export const createSubscriberCheckoutSession = (
  stripeSecretKey: string,
  request: SubscriberCheckoutRequest,
): CheckoutSessionResult => {
  if (isBillingMockMode(stripeSecretKey)) {
    const sessionId = `mock_cs_${request.chatId}_${request.tier}_${Date.now()}`
    const successUrl =
      request.successUrl ??
      `https://checkout.mock.solanaideaslab.local/success?session=${sessionId}`

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
): Promise<CheckoutSessionResult> => {
  const mockOrFallback = createSubscriberCheckoutSession(
    stripeSecretKey,
    request,
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
      success_url:
        request.successUrl ??
        'http://localhost:3001/?checkout=success&session={CHECKOUT_SESSION_ID}',
      cancel_url:
        request.cancelUrl ?? 'http://localhost:3001/?checkout=cancel',
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
