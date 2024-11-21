import {
  assignmentCacheKeyToString,
  assignmentCacheValueToString,
} from './abstract-assignment-cache';
import { NonExpiringInMemoryAssignmentCache } from './non-expiring-in-memory-cache-assignment';

describe('NonExpiringInMemoryAssignmentCache', () => {
  it('read and write variation entries', () => {
    const cache = new NonExpiringInMemoryAssignmentCache();
    const key1 = { subjectKey: 'a', flagKey: 'b', allocationKey: 'c', variationKey: 'd' };
    const key2 = { subjectKey: '1', flagKey: '2', allocationKey: '3', variationKey: '4' };
    cache.set(key1);
    expect(cache.has(key1)).toBeTruthy();
    expect(cache.has(key2)).toBeFalsy();
    cache.set(key2);
    expect(cache.has(key2)).toBeTruthy();
    // this makes an assumption about the internal implementation of the cache, which is not ideal,
    // but it's the only way to test the cache without exposing the internal state
    expect(Array.from(cache.entries())).toEqual([
      [assignmentCacheKeyToString(key1), assignmentCacheValueToString(key1)],
      [assignmentCacheKeyToString(key2), assignmentCacheValueToString(key2)],
    ]);

    expect(cache.has({ ...key1, allocationKey: 'c1' })).toBeFalsy();
    expect(cache.has({ ...key2, variationKey: 'd1' })).toBeFalsy();
  });

  it('read and write bandit entries', () => {
    const cache = new NonExpiringInMemoryAssignmentCache();
    const key1 = { subjectKey: 'a', flagKey: 'b', banditKey: 'c', actionKey: 'd' };
    const key2 = { subjectKey: '1', flagKey: '2', banditKey: '3', actionKey: '4' };
    cache.set(key1);
    expect(cache.has(key1)).toBeTruthy();
    expect(cache.has(key2)).toBeFalsy();
    cache.set(key2);
    expect(cache.has(key2)).toBeTruthy();
    // this makes an assumption about the internal implementation of the cache, which is not ideal,
    // but it's the only way to test the cache without exposing the internal state
    expect(Array.from(cache.entries())).toEqual([
      [assignmentCacheKeyToString(key1), assignmentCacheValueToString(key1)],
      [assignmentCacheKeyToString(key2), assignmentCacheValueToString(key2)],
    ]);

    expect(cache.has({ ...key1, banditKey: 'c1' })).toBeFalsy();
    expect(cache.has({ ...key2, actionKey: 'd1' })).toBeFalsy();
  });
});
