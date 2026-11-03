/** Runtime retry budget; exhausted events remain FAILED in the durable outbox. */
export class DeliveryRetry {
  private readonly attempts = new Map<string, { count: number; next: number }>();
  constructor(private readonly now: () => number = Date.now, private readonly maximum = 8) {}
  excluded(): string[] {
    return [...this.attempts].filter(([, v]) => v.count >= this.maximum || v.next > this.now()).map(([k]) => k);
  }
  failed(id: string | number): boolean {
    const key = String(id), count = (this.attempts.get(key)?.count ?? 0) + 1;
    this.attempts.set(key, { count, next: this.now() + Math.min(60_000, 1000 * 2 ** (count - 1)) });
    return count >= this.maximum;
  }
  succeeded(id: string | number): void { this.attempts.delete(String(id)); }
}
