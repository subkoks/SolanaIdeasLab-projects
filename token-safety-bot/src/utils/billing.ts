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
    error: "Stripe Checkout session creation pending SDK integration.",
  };
};
