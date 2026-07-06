export const BILLING_TIERS = ["free", "basic", "pro", "enterprise"] as const;

export type BillingTier = (typeof BILLING_TIERS)[number];

export const isBillingMockMode = (stripeSecretKey: string): boolean =>
  stripeSecretKey.trim().length === 0;

export const getBillingStatus = (stripeSecretKey: string) => ({
  mode: isBillingMockMode(stripeSecretKey)
    ? ("mock" as const)
    : ("stripe" as const),
  tiers: BILLING_TIERS,
  message: isBillingMockMode(stripeSecretKey)
    ? "Stripe keys not configured — tier upgrades apply locally for development."
    : "Stripe billing is configured.",
});
