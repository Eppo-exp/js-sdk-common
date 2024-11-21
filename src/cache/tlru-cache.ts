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

  private isCacheEntryValid(key: string): boolean {
    const now = new Date(Date.now());
    const evictionDate = this.cacheEntriesTTLRegistry.get(key);
    return evictionDate !== undefined ? now < evictionDate : false;
  }

  private setCacheEntryEvictionTime(key: string): void {
    this.cacheEntriesTTLRegistry.set(key, this.getCacheEntryEvictionTime());
  }

  private resetCacheEntryEvictionTime(key: string): void {
    this.clearCacheEntryEvictionTimeIfExists(key);
    this.setCacheEntryEvictionTime(key);
  }

  private evictExpiredCacheEntries() {
    let cacheKey: string;

    // Not using this.cache.forEach so we can break the loop once
    // we find the fist non-expired entry. Each entry after that
    // is guaranteed to also be non-expired, because iteration happens
    // in insertion order
    for (cacheKey of this.cache.keys()) {
      if (!this.isCacheEntryValid(cacheKey)) {
        this.delete(cacheKey);
      } else {
        break;
      }
    }
  }

  entries(): IterableIterator<[string, string]> {
    this.evictExpiredCacheEntries();
    return super.entries();
  }

  keys(): IterableIterator<string> {
    this.evictExpiredCacheEntries();
    return super.keys();
  }

  values(): IterableIterator<string> {
    this.evictExpiredCacheEntries();
    return super.values();
  }

  delete(key: string): boolean {
    this.clearCacheEntryEvictionTimeIfExists(key);
    return super.delete(key);
  }

  // has(key: string): boolean {
  //   const hasValue = this.cache.has(key);
  //
  //   if (!this.isCacheEntryValid(key)) {
  //     this.delete(key);
  //     return false;
  //   }
  //
  //   return hasValue;
  // }

  get(key: string): string | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    const value = this.cache.get(key);

    if (value !== undefined) {
      if (!this.isCacheEntryValid(key)) {
        this.delete(key);
        return undefined;
      }

      // Whenever we get a cache hit, we need to reset the timer
      // for eviction, because it is now considered most recently
      // accessed thus the timer should start over. Not doing that
      // will cause a de-sync that will stop proper eviction
      this.resetCacheEntryEvictionTime(key);
    }
    return value;
  }

  set(key: string, value: string): this {
    const cache = super.set(key, value);
    this.resetCacheEntryEvictionTime(key);
    return cache;
  }
}
