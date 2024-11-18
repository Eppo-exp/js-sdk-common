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

  it('should evict all expired entries', () => {
    jest.useFakeTimers();

    cache.set('a', 'avocado');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);
    cache.set('b', 'banana');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeUndefined();
  });

  /**
   * This test assumes implementation which is not ideal, but that's
   * the only way I know of how to go around timers in jest
   **/
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
});
