export class AlertNotificationThrottle {
  private readonly dedupe = new Map<string, number>();
  private readonly rateBuckets = new Map<number, number[]>();

  constructor(
    private readonly dedupeMs: number,
    private readonly rateWindowMs: number,
    private readonly rateMax: number,
  ) {}

  shouldNotify(
    chatId: number,
    tokenAddress: string,
    alertType: string,
  ): boolean {
    const now = Date.now();
    const dedupeKey = `${chatId}:${tokenAddress}:${alertType}`;
    const lastSent = this.dedupe.get(dedupeKey);

    if (lastSent !== undefined && now - lastSent < this.dedupeMs) {
      return false;
    }

    const recent = (this.rateBuckets.get(chatId) ?? []).filter(
      (timestamp) => now - timestamp < this.rateWindowMs,
    );

    if (recent.length >= this.rateMax) {
      return false;
    }

    recent.push(now);
    this.rateBuckets.set(chatId, recent);
    this.dedupe.set(dedupeKey, now);
    return true;
  }
}
