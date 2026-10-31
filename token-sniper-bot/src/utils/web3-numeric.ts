/**
 * Converts Web3.js v3 branded numeric RPC values at the app boundary.
 * v3 represents lamports and unix timestamps as branded bigints; this
 * module turns them into JS numbers only when they fit the safe integer range.
 */

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

export function bigintToSafeNumber(value: bigint, label: string): number {
  if (value < MIN_SAFE || value > MAX_SAFE) {
    throw new RangeError(`${label} is outside the safe integer range`);
  }
  return Number(value);
}

export function lamportsToSafeNumber(lamports: bigint | number): number {
  if (typeof lamports === "number") {
    if (!Number.isSafeInteger(lamports) || lamports < 0) {
      throw new RangeError("Lamports number is not a safe non-negative integer");
    }
    return lamports;
  }
  if (lamports < 0n) {
    throw new RangeError("Lamports value is negative");
  }
  return bigintToSafeNumber(lamports, "Lamports");
}

export function unixSecondsToMillis(
  value: bigint | number | null | undefined,
  fallbackUnixSeconds: number = Math.floor(Date.now() / 1000),
): number {
  if (value == null) {
    return unixSecondsToMillis(fallbackUnixSeconds, fallbackUnixSeconds);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError("Unix timestamp is not finite");
    }
    return value * 1000;
  }
  return bigintToSafeNumber(value, "Unix timestamp") * 1000;
}
