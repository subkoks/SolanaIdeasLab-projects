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
      throw new RangeError(
        "Lamports number is not a safe non-negative integer",
      );
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
  const timestamp = value ?? fallbackUnixSeconds;
  const seconds =
    typeof timestamp === "bigint"
      ? bigintToSafeNumber(timestamp, "Unix timestamp")
      : timestamp;

  if (!Number.isSafeInteger(seconds)) {
    throw new RangeError("Unix timestamp is not a safe integer");
  }

  const milliseconds = seconds * 1000;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new RangeError(
      "Unix timestamp in milliseconds is not a safe integer",
    );
  }

  return milliseconds;
}
