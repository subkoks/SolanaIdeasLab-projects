const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

describe("getSolUsdPrice (mock source)", () => {
  it("returns the configured mock price with source 'mock' when PREFER_MOCK_SOL_PRICE is set", async () => {
    process.env = {
      ...originalEnv,
      PREFER_MOCK_SOL_PRICE: "true",
      MOCK_SOL_USD_PRICE: "123.45",
    };
    jest.resetModules();
    const { getSolUsdPrice } =
      require("../src/lib/sol-price") as typeof import("../src/lib/sol-price");

    const result = await getSolUsdPrice();

    expect(result.source).toBe("mock");
    expect(result.priceUsd).toBe(123.45);
  });

  it("uses the default mock price (150) when no mock value is provided", async () => {
    process.env = {
      ...originalEnv,
      PREFER_MOCK_SOL_PRICE: "true",
    };
    delete process.env.MOCK_SOL_USD_PRICE;
    jest.resetModules();
    const { getSolUsdPrice } =
      require("../src/lib/sol-price") as typeof import("../src/lib/sol-price");

    const result = await getSolUsdPrice();

    expect(result.source).toBe("mock");
    expect(result.priceUsd).toBe(150);
  });

  it("falls back to mock source when the live fetch throws (network/HTTP failure)", async () => {
    // No PREFER_MOCK flag, but force the fetch to fail so the catch path returns mock.
    process.env = {
      ...originalEnv,
      PREFER_MOCK_SOL_PRICE: "",
    };
    // Make global fetch throw to simulate a network failure.
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));

    jest.resetModules();
    const { getSolUsdPrice, resetSolPriceCacheForTests } =
      require("../src/lib/sol-price") as typeof import("../src/lib/sol-price");
    resetSolPriceCacheForTests();

    const result = await getSolUsdPrice();

    expect(result.source).toBe("mock");
    expect(Number.isFinite(result.priceUsd)).toBe(true);

    global.fetch = originalFetch;
  });
});
