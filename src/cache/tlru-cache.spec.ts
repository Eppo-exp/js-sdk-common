import { TLRUCache } from './lru-cache';

describe('TLRU Cache', () => {
  let cache: TLRUCache;
  const expectedCacheTimeoutMs = 50;

  beforeEach(async () => {
    cache = new TLRUCache(2, expectedCacheTimeoutMs);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  it('should evict cache after timeout', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');

    cache.set('a', 'apple');
    jest.advanceTimersByTime(expectedCacheTimeoutMs);

    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), expectedCacheTimeoutMs);
    expect(cache.get('a')).toBeUndefined();
  });
});
