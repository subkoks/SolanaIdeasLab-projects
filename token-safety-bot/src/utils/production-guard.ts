const DEFAULT_JWT_SECRET = "token-safety-bot-dev-secret";

export const isProductionRuntime = (): boolean =>
  process.env.NODE_ENV === "production";

const isDevelopmentOrTestRuntime = (): boolean =>
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export const assertProductionConfig = (): void => {
  if (isProductionRuntime()) {
    const jwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
    if (!jwtSecret || jwtSecret === DEFAULT_JWT_SECRET) {
      throw new Error(
        "JWT_SECRET must be set to a non-default value in production",
      );
    }
  }

  if (
    process.env.SKIP_WALLET_SIGNATURE_VERIFY === "true" &&
    !isDevelopmentOrTestRuntime()
  ) {
    throw new Error(
      "SKIP_WALLET_SIGNATURE_VERIFY is only allowed in development or test",
    );
  }

  if (
    process.env.SKIP_AUTH_IN_DEV === "true" &&
    !isDevelopmentOrTestRuntime()
  ) {
    throw new Error("SKIP_AUTH_IN_DEV is only allowed in development or test");
  }

  if (
    process.env.BILLING_DEV_UPGRADE === "true" &&
    !isDevelopmentOrTestRuntime()
  ) {
    throw new Error(
      "BILLING_DEV_UPGRADE is only allowed in development or test",
    );
  }
};
