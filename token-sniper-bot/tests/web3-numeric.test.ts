import {
  bigintToSafeNumber,
  lamportsToSafeNumber,
  unixSecondsToMillis,
} from "../src/utils/web3-numeric";

describe("Web3.js numeric conversions", () => {
  it("converts safe lamport balances", () => {
    expect(lamportsToSafeNumber(1_500n)).toBe(1_500);
    expect(lamportsToSafeNumber(1_500)).toBe(1_500);
  });

  it("rejects negative and unsafe lamport balances", () => {
    expect(() => lamportsToSafeNumber(-1n)).toThrow(RangeError);
    expect(() => lamportsToSafeNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
    expect(() =>
      lamportsToSafeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    ).toThrow(RangeError);
  });

  it("converts Unix seconds to safe milliseconds", () => {
    expect(unixSecondsToMillis(1_700_000_000)).toBe(1_700_000_000_000);
    expect(unixSecondsToMillis(1_700_000_000n)).toBe(1_700_000_000_000);
    expect(unixSecondsToMillis(null, 1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("rejects timestamps that cannot be represented safely in milliseconds", () => {
    expect(() => unixSecondsToMillis(Number.MAX_SAFE_INTEGER)).toThrow(
      RangeError,
    );
    expect(() => unixSecondsToMillis(1.5)).toThrow(RangeError);
    expect(() =>
      bigintToSafeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n, "test"),
    ).toThrow(RangeError);
  });
});
