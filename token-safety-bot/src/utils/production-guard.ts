const DEFAULT_JWT_SECRET = "token-safety-bot-dev-secret";

export const isProductionRuntime = (): boolean =>
  process.env.NODE_ENV === "production";

export const assertProductionConfig = (): void => {
  if (!isProductionRuntime()) {
    return;
  }

  const jwtSecret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  if (!jwtSecret || jwtSecret === DEFAULT_JWT_SECRET) {
    throw new Error(
      "JWT_SECRET must be set to a non-default value in production",
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
};
