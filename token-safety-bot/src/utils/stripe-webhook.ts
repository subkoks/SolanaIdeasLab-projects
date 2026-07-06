import type Stripe from "stripe";
import type { BillingTier } from "./billing";

export type StripeSubscriptionStatus = "active" | "cancelled";

export interface StripeTierSyncPayload {
  userId: string;
  tier: BillingTier;
  stripeSubscriptionId: string | null;
  status: StripeSubscriptionStatus;
}

export interface StripePriceIds {
  basic: string;
  pro: string;
  enterprise: string;
}

const VALID_TIERS = new Set<BillingTier>([
  "free",
  "basic",
  "pro",
  "enterprise",
]);

export const isBillingTier = (value: string): value is BillingTier =>
  VALID_TIERS.has(value as BillingTier);

export const mapPriceIdToTier = (
  prices: StripePriceIds,
  priceId: string | null | undefined,
): BillingTier | null => {
  if (!priceId) {
    return null;
  }

  if (priceId === prices.basic) {
    return "basic";
  }

  if (priceId === prices.pro) {
    return "pro";
  }

  if (priceId === prices.enterprise) {
    return "enterprise";
  }

  return null;
};

export const buildTierSyncFromStripeEvent = (
  event: Stripe.Event,
  prices: StripePriceIds,
): StripeTierSyncPayload | null => {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.userId;
      const tierValue = session.metadata?.tier;

      if (!userId || !tierValue || !isBillingTier(tierValue) || tierValue === "free") {
        return null;
      }

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);

      return {
        userId,
        tier: tierValue,
        stripeSubscriptionId: subscriptionId,
        status: "active",
      };
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId =
        subscription.metadata?.userId ?? subscription.metadata?.client_reference_id;

      if (!userId) {
        return null;
      }

      const inactive =
        subscription.status === "canceled" ||
        subscription.status === "unpaid" ||
        subscription.status === "incomplete_expired";

      if (inactive) {
        return {
          userId,
          tier: "free",
          stripeSubscriptionId: subscription.id,
          status: "cancelled",
        };
      }

      const priceId = subscription.items.data[0]?.price.id;
      const tier =
        mapPriceIdToTier(prices, priceId) ??
        (isBillingTier(subscription.metadata?.tier ?? "")
          ? (subscription.metadata?.tier as BillingTier)
          : null);

      if (!tier || tier === "free") {
        return null;
      }

      return {
        userId,
        tier,
        stripeSubscriptionId: subscription.id,
        status: "active",
      };
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId =
        subscription.metadata?.userId ?? subscription.metadata?.client_reference_id;

      if (!userId) {
        return null;
      }

      return {
        userId,
        tier: "free",
        stripeSubscriptionId: subscription.id,
        status: "cancelled",
      };
    }

    default:
      return null;
  }
};

export const constructStripeEvent = async (
  rawBody: Buffer,
  signature: string | undefined,
  stripeSecretKey: string,
  webhookSecret: string,
): Promise<Stripe.Event> => {
  if (!signature) {
    throw new Error("Missing Stripe signature header");
  }

  const { default: StripeSdk } = await import("stripe");
  const stripe = new StripeSdk(stripeSecretKey);
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
};
