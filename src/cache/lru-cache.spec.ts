import { LRUCache } from './lru-cache';

describe('LRUCache', () => {
  let cache: LRUCache;

  beforeEach(() => {
    cache = new LRUCache(2);
  });

  it('should insert and retrieve a value', () => {
    cache.set('a', 'apple');
    expect(cache.get('a')).toBe('apple');
  });

  it('should return undefined for missing values', () => {
    expect(cache.get('missing')).toBeFalsy();
  });

  it('should overwrite existing values', () => {
    cache.set('a', 'apple');
    cache.set('a', 'avocado');
    expect(cache.get('a')).toBe('avocado');
  });

  it('should evict least recently used item', () => {
    cache.set('a', 'apple');
    cache.set('b', 'banana');
    cache.set('c', 'cherry');
    expect(cache.get('a')).toBeFalsy();
    expect(cache.get('b')).toBe('banana');
    expect(cache.get('c')).toBe('cherry');
  });

  it('should move recently used item to the end of the cache', () => {
    cache.set('a', 'apple');
    cache.set('b', 'banana');
    cache.get('a'); // Access 'a' to make it recently used
    cache.set('c', 'cherry');
    expect(cache.get('a')).toBe('apple');
    expect(cache.get('b')).toBeFalsy();
    expect(cache.get('c')).toBe('cherry');
  });

  it('should check if a key exists', () => {
    cache.set('a', 'apple');
    expect(cache.has('a')).toBeTruthy();
    expect(cache.has('b')).toBeFalsy();
  });

  it('should handle the cache capacity of zero', () => {
    const zeroCache = new LRUCache(0);
    zeroCache.set('a', 'apple');
    expect(zeroCache.get('a')).toBeFalsy();
  });

  it('should handle the cache capacity of one', () => {
    const oneCache = new LRUCache(1);
    oneCache.set('a', 'apple');
    expect(oneCache.get('a')).toBe('apple');
    oneCache.set('b', 'banana');
    expect(oneCache.get('a')).toBeFalsy();
    expect(oneCache.get('b')).toBe('banana');
  });
});
