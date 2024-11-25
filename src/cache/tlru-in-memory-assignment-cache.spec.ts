import { DEFAULT_TLRU_TTL_MS } from '../constants';

import { TLRUInMemoryAssignmentCache } from './tlru-in-memory-assignment-cache';

describe('ExpiringLRUInMemoryAssignmentCache', () => {
  let cache: TLRUInMemoryAssignmentCache;
  const defaultTimout = DEFAULT_TLRU_TTL_MS; // 10 minutes

  beforeAll(() => {
    jest.useFakeTimers();
    cache = new TLRUInMemoryAssignmentCache(2);
  });

  afterAll(() => {
    jest.clearAllTimers();
  });

  it(`assignment cache's timeout should default to 10 minutes `, () => {
    const cacheEntry = { subjectKey: 'a', flagKey: 'b', banditKey: 'c', actionKey: 'd' };
    cache.set(cacheEntry);
    jest.advanceTimersByTime(defaultTimout);
    expect(cache.has(cacheEntry)).toBeFalsy();
  });

  it(`assignment cache's timeout value is used on construction`, () => {
    const expectedTimout = 88;
    cache = new TLRUInMemoryAssignmentCache(2, expectedTimout);
    const cacheEntry = { subjectKey: 'a', flagKey: 'b', banditKey: 'c', actionKey: 'd' };
    cache.set(cacheEntry);
    jest.advanceTimersByTime(expectedTimout);
    expect(cache.has(cacheEntry)).toBeFalsy();
  });

  it(`cache shouldn't be invalidated before timeout`, () => {
    const cacheEntry = { subjectKey: 'a', flagKey: 'b', banditKey: 'c', actionKey: 'd' };
    cache.set(cacheEntry);

    expect(cache.has(cacheEntry)).toBeTruthy();

    jest.advanceTimersByTime(defaultTimout);
    expect(cache.has(cacheEntry)).toBeFalsy();
  });
});
