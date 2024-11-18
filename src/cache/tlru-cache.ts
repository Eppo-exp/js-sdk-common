import { LRUCache } from './lru-cache';

/**
 * Time-aware, least-recently-used cache (TLRU). Variant of LRU where entries have valid lifetime.
 * @param {number} maxSize - Maximum cache size
 * @param {number} ttl - Time in milliseconds after which cache entry will evict itself
 * @param {number} evictionInterval - Frequency of cache entries eviction check
 **/
export class TLRUCache extends LRUCache {
  private readonly cacheEntriesTTLRegistry = new Map<string, Date>();
  constructor(readonly maxSize: number, readonly ttl: number) {
    super(maxSize);
  }

  private getCacheEntryEvictionTime(): Date {
    return new Date(Date.now() + this.ttl);
  }

  private clearCacheEntryEvictionTimeIfExists(key: string): void {
    if (this.cacheEntriesTTLRegistry.has(key)) {
      this.cacheEntriesTTLRegistry.delete(key);
    }
  }

  private setCacheEntryEvictionTime(key: string): void {
    this.cacheEntriesTTLRegistry.set(key, this.getCacheEntryEvictionTime());
  }

  private resetCacheEntryEvictionTime(key: string): void {
    this.clearCacheEntryEvictionTimeIfExists(key);
    this.setCacheEntryEvictionTime(key);
  }

  private evictExpiredCacheEntries() {
    const now = new Date(Date.now());
    let cacheKey: string;
    let evictionDate: Date;

    // Not using this.cache.forEach so we can break the loop once
    // we find the fist non-expired entry. Each entry after that
    // is guaranteed to also be non-expired, because they are oldest->newest
    for ([cacheKey, evictionDate] of this.cacheEntriesTTLRegistry.entries()) {
      if (now >= evictionDate) {
        this.delete(cacheKey);
      } else {
        break;
      }
    }
  }

  delete(key: string): boolean {
    this.clearCacheEntryEvictionTimeIfExists(key);
    return super.delete(key);
  }

  get(key: string): string | undefined {
    this.evictExpiredCacheEntries();

    const value = super.get(key);
    if (value !== undefined) {
      // Whenever we get a cache hit, we need to reset the timer
      // for eviction, because it is now considered most recently
      // accessed thus the timer should start over. Not doing that
      // will cause a de-sync that will stop proper eviction
      this.resetCacheEntryEvictionTime(key);
    }
    return value;
  }

  set(key: string, value: string): this {
    this.evictExpiredCacheEntries();

    const cache = super.set(key, value);
    this.resetCacheEntryEvictionTime(key);
    return cache;
  }
}
