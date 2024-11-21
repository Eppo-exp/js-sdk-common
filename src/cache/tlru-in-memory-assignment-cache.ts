import { DEFAULT_TLRU_TTL_MS } from '../constants';

import { AbstractAssignmentCache } from './abstract-assignment-cache';
import { TLRUCache } from './tlru-cache';

/**
 * Variation of LRU caching mechanism that will automatically evict items after
 * set time of milliseconds.
 *
 * It is used to limit the size of the cache.
 *
 * @param {number} maxSize - Maximum cache size
 * @param {number} ttl - Time in milliseconds after cache will expire.
 */
export class TLRUInMemoryAssignmentCache extends AbstractAssignmentCache<TLRUCache> {
  constructor(maxSize: number, ttl = DEFAULT_TLRU_TTL_MS) {
    super(new TLRUCache(maxSize, ttl));
  }
}
