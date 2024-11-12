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

  private clearCacheEntryTimeout(key: string): void {
    const timeoutId = this.cacheEntriesTimoutIds.get(key);
    clearTimeout(timeoutId);
    this.cacheEntriesTimoutIds.delete(key);
  }

  private setCacheEntryTimout(key: string): void {
    const timeOutId = setTimeout(() => {
      this.delete(key);
    }, this.ttl);

    this.cacheEntriesTimoutIds.set(key, timeOutId);
  }

  delete(key: string): boolean {
    this.clearCacheEntryTimeout(key);
    return super.delete(key);
  }

  get(key: string): string | undefined {
    const value = super.get(key);

    // Whenever we get a cache hit, we need to reset the timer
    // for eviction, because it is now considered most recently
    // accessed thus the timer should start over. Not doing that
    // will cause a de-sync that will stop proper eviction
    this.clearCacheEntryTimeout(key);
    if (value) {
      this.setCacheEntryTimout(key);
    }
    return value;
  }

  set(key: string, value: string): this {
    const cache = super.set(key, value);
    if (this.cacheEntriesTimoutIds.has(key)) {
      this.clearCacheEntryTimeout(key);
    }
    this.setCacheEntryTimout(key);

    return cache;
  }
}
