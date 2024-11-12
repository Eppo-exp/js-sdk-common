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

  it('should evict cache after timeout', () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    cache.set('a', 'apple');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);

    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), expectedCacheTimeoutMs);
    expect(cache.get('a')).toBeUndefined();
  });

  /**
   * This test assumes implementation which is not ideal, but that's
   * the only way I know of how to go around timers in jest
   **/
  it('should overwrite existing cache entry', () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');
    jest.spyOn(global, 'clearTimeout');

    cache.set('a', 'apple');
    jest.advanceTimersByTime(expectedCacheTimeoutMs - 1);
    cache.set('a', 'avocado');

    expect(setTimeout).toHaveBeenCalledTimes(2);
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), expectedCacheTimeoutMs);
    expect(clearTimeout).toHaveBeenCalledTimes(1);
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
    expect(cache.has('a')).toBeFalsy();
  });
});
