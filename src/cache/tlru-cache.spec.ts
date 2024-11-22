import { TLRUCache } from './tlru-cache';

describe('TLRU Cache', () => {
  let cache: TLRUCache;
  const expectedCacheTimeoutMs = 10;

  beforeEach(async () => {
    cache = new TLRUCache(2, expectedCacheTimeoutMs);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
  });

  it('should evict cache after expiration', () => {
    jest.useFakeTimers();

    cache.set('a', 'apple');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);

    expect(cache.get('a')).toBeUndefined();
  });

  it('should not evict cache before expiration', () => {
    jest.useFakeTimers();

    cache.set('a', 'apple');
    jest.advanceTimersByTime(expectedCacheTimeoutMs - 1);
    expect(cache.get('a')).toBe('apple');
  });

  it('should evict all expired entries on .entries() call', () => {
    jest.useFakeTimers();

    cache.set('a', 'avocado');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);
    cache.set('b', 'banana');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);

    const cacheEntries = [];

    for (const entry of cache.entries()) {
      cacheEntries.push(entry);
    }

    expect(cacheEntries.length).toBe(0);
  });

  it('should evict all expired entries on .keys() call', () => {
    jest.useFakeTimers();

    cache = new TLRUCache(3, expectedCacheTimeoutMs);
    cache.set('a', 'avocado');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);
    cache.set('b', 'banana');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);
    cache.set('c', 'cherry');

    const cacheKeys = [];

    for (const key of cache.keys()) {
      cacheKeys.push(key);
    }

    expect(cacheKeys.length).toBe(1);
    expect(cache.get('c')).toBe('cherry');
  });

  it('should evict all expired entries on .values() call', () => {
    jest.useFakeTimers();
    cache = new TLRUCache(3, expectedCacheTimeoutMs);

    cache.set('a', 'avocado');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);
    cache.set('b', 'banana');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);
    cache.set('c', 'cherry');

    const cacheValues = [];

    for (const value of cache.values()) {
      cacheValues.push(value);
    }

    expect(cacheValues.length).toBe(1);
    expect(cache.get('c')).toBe('cherry');
  });

  it('should overwrite existing cache entry', () => {
    jest.useFakeTimers();

    cache.set('a', 'apple');
    jest.advanceTimersByTime(expectedCacheTimeoutMs - 1);
    cache.set('a', 'avocado');

    // spin the clock by 5sec. After that time cache entry should be still valid.
    jest.advanceTimersByTime(expectedCacheTimeoutMs / 2);

    // setting assertion in a weird way because calling cache.get()
    // will reset eviction timer which will mess up next assertion
    let avocadoInCache = false;
    cache.forEach((value, key) => {
      if (key === 'a' && value === 'avocado') {
        avocadoInCache = true;
      }
    });
    expect(avocadoInCache).toBe(true);

    // after another spin of 5 sec, cache entry should evict itself
    jest.advanceTimersByTime(expectedCacheTimeoutMs / 2);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should check if a key exists', () => {
    cache.set('a', 'apple');
    expect(cache.has('a')).toBeTruthy();
    expect(cache.has('b')).toBeFalsy();
  });

  it('should handle the cache capacity of zero', () => {
    const zeroCache = new TLRUCache(0, expectedCacheTimeoutMs);
    zeroCache.set('a', 'apple');
    expect(zeroCache.get('a')).toBeFalsy();
  });

  it('should handle the cache capacity of one', () => {
    jest.useFakeTimers();
    const oneCache = new TLRUCache(1, expectedCacheTimeoutMs);
    oneCache.set('a', 'apple');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);
    expect(oneCache.get('a')).toBeUndefined();

    oneCache.set('a', 'avocado');
    expect(oneCache.get('a')).toBe('avocado');
    oneCache.set('b', 'banana');
    expect(oneCache.get('a')).toBeFalsy();
    expect(oneCache.get('b')).toBe('banana');
  });

  it('should evict oldest entry when capacity limit is reached', () => {
    cache.set('a', 'apple');
    cache.set('b', 'banana');
    cache.set('c', 'cherry');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.has('b')).toBeTruthy();
    expect(cache.has('c')).toBeTruthy();
  });

  /**
    This test case might be an overkill but in case Map() changes,
    or we want to ditch it completely this will remind us that insertion
    order is crucial for this cache to work properly
  **/
  it('should preserve insertion order when inserting on capacity limit', () => {
    cache.set('a', 'apple');
    cache.set('b', 'banana');
    cache.set('c', 'cherry');

    let keys = Array.from(cache.keys());
    expect(keys[0]).toBe('b');
    expect(keys[1]).toBe('c');

    cache = new TLRUCache(2, expectedCacheTimeoutMs);
    cache.set('a', 'apple');
    cache.set('b', 'banana');
    cache.get('a');
    cache.set('c', 'cherry');

    keys = Array.from(cache.keys());
    expect(keys[0]).toBe('a');
    expect(keys[1]).toBe('c');
  });
});
