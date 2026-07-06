import type Stripe from 'stripe'
import { isValidSubscriberTier, type SubscriberTier } from './watch-limits'

export interface SubscriberTierSyncPayload {
  chatId: string
  tier: SubscriberTier
  status: 'active' | 'cancelled'
}

export interface StripePriceIds {
  basic: string
  pro: string
  enterprise: string
}

const mapPriceIdToTier = (
  prices: StripePriceIds,
  priceId: string | null | undefined,
): SubscriberTier | null => {
  if (!priceId) {
    return null
  }

  if (priceId === prices.basic) {
    return 'basic'
  }

  if (priceId === prices.pro) {
    return 'pro'
  }

  if (priceId === prices.enterprise) {
    return 'enterprise'
  }

  return null
}

export const buildSubscriberTierSyncFromEvent = (
  event: Stripe.Event,
  prices: StripePriceIds,
): SubscriberTierSyncPayload | null => {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const chatId = session.metadata?.chatId
      const tierValue = session.metadata?.tier

      if (!chatId || !tierValue || !isValidSubscriberTier(tierValue) || tierValue === 'free') {
        return null
      }

      return { chatId, tier: tierValue, status: 'active' }
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const chatId = subscription.metadata?.chatId

      if (!chatId) {
        return null
      }

      const inactive =
        subscription.status === 'canceled' ||
        subscription.status === 'unpaid' ||
        subscription.status === 'incomplete_expired'

      if (inactive) {
        return { chatId, tier: 'free', status: 'cancelled' }
      }

      const tier =
        mapPriceIdToTier(prices, subscription.items.data[0]?.price.id) ??
        (isValidSubscriberTier(subscription.metadata?.tier ?? '')
          ? (subscription.metadata?.tier as SubscriberTier)
          : null)

      if (!tier || tier === 'free') {
        return null
      }

      return { chatId, tier, status: 'active' }
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const chatId = subscription.metadata?.chatId

      if (!chatId) {
        return null
      }

      return { chatId, tier: 'free', status: 'cancelled' }
    }

    default:
      return null
  }
}

export const constructStripeEvent = async (
  rawBody: Buffer,
  signature: string | undefined,
  stripeSecretKey: string,
  webhookSecret: string,
): Promise<Stripe.Event> => {
  if (!signature) {
    throw new Error('Missing Stripe signature header')
  }

  const { default: StripeSdk } = await import('stripe')
  const stripe = new StripeSdk(stripeSecretKey)
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
}
