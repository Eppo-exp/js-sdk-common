import { LRUCache } from './lru-cache';

/**
 * Time-aware, least-recently-used (TLRU), variant of LRU where entries have valid lifetime.
 * @param {number} maxSize - Maximum cache size
 * @param {number} ttl - Time in milliseconds after which cache entry will evict itself
 **/
export class TLRUCache extends LRUCache {
  constructor(readonly maxSize: number, readonly ttl: number) {
    super(maxSize);
  }

  set(key: string, value: string): this {
    const cache = super.set(key, value);
    setTimeout(() => {
      this.delete(key);
    }, this.ttl);
    return cache;
  }
}
