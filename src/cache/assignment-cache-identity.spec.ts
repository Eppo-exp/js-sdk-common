import { NonExpiringInMemoryAssignmentCache } from './non-expiring-in-memory-cache-assignment';

describe('assignment cache identity', () => {
  it('ignores property insertion order', () => {
    const cache = new NonExpiringInMemoryAssignmentCache();
    cache.set({
      subjectKey: 'subject',
      flagKey: 'flag',
      allocationKey: 'allocation',
      variationKey: 'A',
    });
    expect(
      cache.has({
        variationKey: 'A',
        allocationKey: 'allocation',
        flagKey: 'flag',
        subjectKey: 'subject',
      }),
    ).toBe(true);
  });

  it('does not confuse delimiters inside assignment fields', () => {
    const cache = new NonExpiringInMemoryAssignmentCache();
    cache.set({
      subjectKey: 'subject',
      flagKey: 'flag',
      allocationKey: 'a;b',
      variationKey: 'c',
    });
    expect(
      cache.has({
        subjectKey: 'subject',
        flagKey: 'flag',
        allocationKey: 'a',
        variationKey: 'b;c',
      }),
    ).toBe(false);
  });

  it('keeps distinct subject and flag pairs separate', () => {
    const cache = new NonExpiringInMemoryAssignmentCache();
    cache.set({
      subjectKey: 'a;b',
      flagKey: 'c',
      allocationKey: 'allocation',
      variationKey: 'A',
    });
    expect(
      cache.has({
        subjectKey: 'a',
        flagKey: 'b;c',
        allocationKey: 'allocation',
        variationKey: 'A',
      }),
    ).toBe(false);
  });

  it('keeps variation and bandit assignments separate', () => {
    const cache = new NonExpiringInMemoryAssignmentCache();
    cache.set({
      subjectKey: 'subject',
      flagKey: 'flag',
      allocationKey: 'allocation',
      variationKey: 'A',
    });
    expect(
      cache.has({
        subjectKey: 'subject',
        flagKey: 'flag',
        banditKey: 'allocation',
        actionKey: 'A',
      }),
    ).toBe(false);
  });
});
