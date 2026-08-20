const DEFAULT_JWT_SECRET = "token-sniper-bot-dev-secret";
const DEFAULT_REFRESH_SECRET = "token-sniper-bot-dev-refresh";

export const isProductionRuntime = (): boolean =>
  process.env.NODE_ENV === "production";

export const assertProductionConfig = (): void => {
  if (!isProductionRuntime()) {
    return;
  }

  const jwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  if (
    !jwtSecret ||
    jwtSecret === DEFAULT_JWT_SECRET ||
    jwtSecret === "change-me-in-production"
  ) {
    throw new Error(
      "JWT_SECRET must be set to a non-default value in production",
    );
  }

  const refreshSecret =
    process.env.REFRESH_TOKEN_SECRET ?? DEFAULT_REFRESH_SECRET;
  if (
    !refreshSecret ||
    refreshSecret === DEFAULT_REFRESH_SECRET ||
    refreshSecret === "change-me-refresh-in-production"
  ) {
    throw new Error(
      "REFRESH_TOKEN_SECRET must be set to a non-default value in production",
    );
  }

  if (process.env.SKIP_WALLET_SIGNATURE_VERIFY === "true") {
    throw new Error(
      "SKIP_WALLET_SIGNATURE_VERIFY must not be enabled in production",
    );
  }

  if (process.env.SKIP_AUTH_IN_DEV === "true") {
    throw new Error("SKIP_AUTH_IN_DEV must not be enabled in production");
  }

  if (process.env.BILLING_DEV_UPGRADE === "true") {
    throw new Error("BILLING_DEV_UPGRADE must not be enabled in production");
  }
};
