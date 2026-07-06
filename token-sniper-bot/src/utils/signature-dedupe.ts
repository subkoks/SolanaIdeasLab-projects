export class SignatureDedupe {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  public shouldProcess(signature: string, now = Date.now()): boolean {
    this.prune(now);

    const expiresAt = this.seen.get(signature);
    if (expiresAt !== undefined && expiresAt > now) {
      return false;
    }

    this.seen.set(signature, now + this.ttlMs);

    if (this.seen.size > this.maxEntries) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey) {
        this.seen.delete(oldestKey);
      }
    }

    return true;
  }

  public size(): number {
    return this.seen.size;
  }

  private prune(now: number): void {
    for (const [signature, expiresAt] of this.seen) {
      if (expiresAt <= now) {
        this.seen.delete(signature);
      }
    }
  }
}
