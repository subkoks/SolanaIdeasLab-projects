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

  it("rejects default JWT secrets in production", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "change-me-in-production";
    process.env.REFRESH_TOKEN_SECRET = "refresh-secret";

    expect(() => assertProductionConfig()).toThrow(/JWT_SECRET/);
  });

  it("rejects default refresh secrets in production", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "jwt-secret";
    process.env.REFRESH_TOKEN_SECRET = "change-me-refresh-in-production";

    expect(() => assertProductionConfig()).toThrow(/REFRESH_TOKEN_SECRET/);
  });

  it("rejects development bypasses in production", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "jwt-secret";
    process.env.REFRESH_TOKEN_SECRET = "refresh-secret";
    process.env.SKIP_WALLET_SIGNATURE_VERIFY = "true";

    expect(() => assertProductionConfig()).toThrow(
      /SKIP_WALLET_SIGNATURE_VERIFY/,
    );
  });
});
