import {
  assertProductionConfig,
  isProductionRuntime,
} from "../src/utils/production-guard";

describe("production guard", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("detects production runtime", () => {
    process.env.NODE_ENV = "production";
    expect(isProductionRuntime()).toBe(true);
  });

  it("allows dev defaults outside production", () => {
    process.env.NODE_ENV = "development";
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("rejects default JWT secret in production", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "token-safety-bot-dev-secret";

    expect(() => assertProductionConfig()).toThrow(/JWT_SECRET/);
  });

  it("rejects skip wallet signature verify in production", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "prod-secret-value";
    process.env.SKIP_WALLET_SIGNATURE_VERIFY = "true";

    expect(() => assertProductionConfig()).toThrow(
      /SKIP_WALLET_SIGNATURE_VERIFY/,
    );
  });

  it("rejects direct billing upgrades in production", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "prod-secret-value";
    process.env.SKIP_WALLET_SIGNATURE_VERIFY = "false";
    process.env.SKIP_AUTH_IN_DEV = "false";
    process.env.BILLING_DEV_UPGRADE = "true";

    expect(() => assertProductionConfig()).toThrow(/BILLING_DEV_UPGRADE/);
  });

  it("rejects development bypasses outside development and test", () => {
    process.env.NODE_ENV = "staging";
    process.env.SKIP_WALLET_SIGNATURE_VERIFY = "false";
    process.env.SKIP_AUTH_IN_DEV = "true";

    expect(() => assertProductionConfig()).toThrow(/SKIP_AUTH_IN_DEV/);
  });
});
