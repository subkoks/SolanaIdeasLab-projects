import { assertProductionConfig } from "../src/utils/production-guard";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

/** Build a clean production env with only the given overrides. */
function prodEnv(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string> = {
    NODE_ENV: "production",
    JWT_SECRET: "a-strong-production-secret-at-least-16-chars",
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env as NodeJS.ProcessEnv;
}

describe("production-guard", () => {
  it("rejects SKIP_AUTH_IN_DEV in production", () => {
    process.env = prodEnv({ SKIP_AUTH_IN_DEV: "true" });
    expect(() => assertProductionConfig()).toThrow(/SKIP_AUTH_IN_DEV/);
  });

  it("rejects the default dev JWT secret in production", () => {
    process.env = prodEnv({ JWT_SECRET: "token-safety-bot-dev-secret" });
    expect(() => assertProductionConfig()).toThrow(/JWT_SECRET/);
  });

  it("rejects an empty JWT secret in production", () => {
    process.env = prodEnv({ JWT_SECRET: "" });
    expect(() => assertProductionConfig()).toThrow(/JWT_SECRET/);
  });

  it("rejects SKIP_WALLET_SIGNATURE_VERIFY in production", () => {
    process.env = prodEnv({ SKIP_WALLET_SIGNATURE_VERIFY: "true" });
    expect(() => assertProductionConfig()).toThrow(/SKIP_WALLET_SIGNATURE_VERIFY/);
  });

  it("rejects BILLING_DEV_UPGRADE in production", () => {
    process.env = prodEnv({ BILLING_DEV_UPGRADE: "true" });
    expect(() => assertProductionConfig()).toThrow(/BILLING_DEV_UPGRADE/);
  });

  it("allows the development runtime to keep the dev bypass + default secret", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      SKIP_AUTH_IN_DEV: "true",
      JWT_SECRET: "token-safety-bot-dev-secret",
    };
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("allows a production runtime with a real secret and no bypass flags", () => {
    process.env = prodEnv();
    expect(() => assertProductionConfig()).not.toThrow();
  });
});
