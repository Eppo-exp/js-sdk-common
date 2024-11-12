import { LRUCache } from './lru-cache';

/**
 * Time-aware, least-recently-used (TLRU), variant of LRU where entries have valid lifetime.
 * @param {number} maxSize - Maximum cache size
 * @param {number} ttl - Time in milliseconds after which cache entry will evict itself
 **/
export class TLRUCache extends LRUCache {
  private readonly cacheEntriesTimoutIds = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(readonly maxSize: number, readonly ttl: number) {
    super(maxSize);
  }

  private clearCacheEntryTimeoutIfExists(key: string): void {
    if (this.cacheEntriesTimoutIds.has(key)) {
      const timeoutId = this.cacheEntriesTimoutIds.get(key);
      clearTimeout(timeoutId);
      this.cacheEntriesTimoutIds.delete(key);
    }
  }

  private setCacheEntryTimeout(key: string): void {
    const timeoutId = setTimeout(() => {
      this.delete(key);
    }, this.ttl);

    this.cacheEntriesTimoutIds.set(key, timeoutId);
  }

  delete(key: string): boolean {
    this.clearCacheEntryTimeoutIfExists(key);
    return super.delete(key);
  }

  get(key: string): string | undefined {
    const value = super.get(key);

    if (value) {
      // Whenever we get a cache hit, we need to reset the timer
      // for eviction, because it is now considered most recently
      // accessed thus the timer should start over. Not doing that
      // will cause a de-sync that will stop proper eviction
      this.clearCacheEntryTimeoutIfExists(key);
      this.setCacheEntryTimeout(key);
    }
    return value;
  }

  set(key: string, value: string): this {
    const cache = super.set(key, value);
    this.clearCacheEntryTimeoutIfExists(key);
    this.setCacheEntryTimeout(key);

    return cache;
  }
}
