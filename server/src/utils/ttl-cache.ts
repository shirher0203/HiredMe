interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Minimal in-memory cache with per-entry TTL.
 *
 * TODO: can be swapped for Redis (member 5) later — keep the get/set surface
 * stable so the GitHub service does not need to change.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
