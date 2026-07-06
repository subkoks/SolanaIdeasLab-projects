const DEFAULT_BASE_MS = 5_000;
const DEFAULT_MAX_MS = 60_000;

export const getLaserStreamReconnectDelayMs = (
  attempt: number,
  baseMs = DEFAULT_BASE_MS,
  maxMs = DEFAULT_MAX_MS,
): number =>
  Math.min(baseMs * 2 ** Math.max(attempt - 1, 0), maxMs);
