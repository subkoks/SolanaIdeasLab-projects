export const BILLING_TIERS = ["free", "basic", "pro", "enterprise"] as const;

export type BillingTier = (typeof BILLING_TIERS)[number];

export const TIER_DISPLAY_PRICES_USD: Record<BillingTier, number> = {
  free: 0,
  basic: 9,
  pro: 29,
  enterprise: 99,
};

export interface CheckoutRequest {
  tier: BillingTier;
  userId: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface StripePriceIds {
  basic: string;
  pro: string;
  enterprise: string;
}

export type CheckoutSessionResult =
  | {
      mode: "mock";
      checkoutUrl: string;
      sessionId: string;
      tier: BillingTier;
      priceUsd: number;
      message: string;
    }
  | {
      mode: "stripe";
      checkoutUrl: string;
      sessionId: string;
      tier: BillingTier;
      priceUsd: number;
      message: string;
    }
  | {
      mode: "stripe";
      error: string;
    };

export const isBillingMockMode = (stripeSecretKey: string): boolean =>
  stripeSecretKey.trim().length === 0;

export const getBillingStatus = (stripeSecretKey: string) => ({
  mode: isBillingMockMode(stripeSecretKey)
    ? ("mock" as const)
    : ("stripe" as const),
  tiers: BILLING_TIERS,
  pricesUsd: TIER_DISPLAY_PRICES_USD,
  message: isBillingMockMode(stripeSecretKey)
    ? "Stripe keys not configured — tier upgrades apply locally for development."
    : "Stripe billing is configured.",
});

export const createCheckoutSession = (
  stripeSecretKey: string,
  request: CheckoutRequest,
): CheckoutSessionResult => {
  if (request.tier === "free") {
    throw new Error("Free tier does not require checkout");
  }

  if (isBillingMockMode(stripeSecretKey)) {
    const sessionId = `mock_cs_${request.userId}_${request.tier}_${Date.now()}`;
    const successUrl =
      request.successUrl ??
      `https://checkout.mock.solanaideaslab.local/success?session=${sessionId}`;

    return {
      mode: "mock",
      checkoutUrl: successUrl,
      sessionId,
      tier: request.tier,
      priceUsd: TIER_DISPLAY_PRICES_USD[request.tier],
      message:
        "Mock checkout session — complete upgrade via POST /api/v1/users/upgrade or simulate redirect.",
    };
  }

  return {
    mode: "stripe",
    error: "Use resolveCheckoutSession for Stripe SDK checkout.",
  };
};

export const resolveCheckoutSession = async (
  stripeSecretKey: string,
  prices: StripePriceIds,
  request: CheckoutRequest,
): Promise<CheckoutSessionResult> => {
  const mockOrFallback = createCheckoutSession(stripeSecretKey, request);
  if (mockOrFallback.mode === "mock") {
    return mockOrFallback;
  }

  const priceId = prices[request.tier];
  if (!priceId.trim()) {
    return {
      mode: "stripe",
      error: `Stripe price ID not configured for tier ${request.tier}`,
    };
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url:
        request.successUrl ??
        "https://checkout.solanaideaslab.local/success?session={CHECKOUT_SESSION_ID}",
      cancel_url:
        request.cancelUrl ?? "https://checkout.solanaideaslab.local/cancel",
      client_reference_id: request.userId,
      metadata: { tier: request.tier, userId: request.userId },
      subscription_data: {
        metadata: { tier: request.tier, userId: request.userId },
      },
    });

    if (!session.url) {
      return {
        mode: "stripe",
        error: "Stripe session missing checkout URL",
      };
    }

    return {
      mode: "stripe",
      checkoutUrl: session.url,
      sessionId: session.id,
      tier: request.tier,
      priceUsd: TIER_DISPLAY_PRICES_USD[request.tier],
      message: "Stripe checkout session created.",
    };
  } catch (error) {
    return {
      mode: "stripe",
      error:
        error instanceof Error ? error.message : "Stripe checkout session failed",
    };
  }
};
