/**
 * Unit tests for LRU Cache with TTL and Versioning
 * Sprint R4
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LRUCache, createCacheKey } from '../../app/api/cache';

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve values', () => {
    const cache = new LRUCache<string, string>(10, 1000);

    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    const cache = new LRUCache<string, string>(10, 1000);

    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should expire entries after TTL', () => {
    const cache = new LRUCache<string, string>(10, 1000);

    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    // Advance time past TTL
    vi.advanceTimersByTime(1001);

    expect(cache.get('key1')).toBeUndefined();
  });

  it('should not expire entries before TTL', () => {
    const cache = new LRUCache<string, string>(10, 1000);

    cache.set('key1', 'value1');

    // Advance time but stay within TTL
    vi.advanceTimersByTime(500);

    expect(cache.get('key1')).toBe('value1');
  });

  it('should evict oldest entry when at capacity', () => {
    const cache = new LRUCache<string, string>(3, 10000);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // All three should be present
    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');

    // Add a fourth item - should evict key1 (oldest)
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  it('should update LRU order on get', () => {
    const cache = new LRUCache<string, string>(3, 10000);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // Access key1 to make it most recently used
    cache.get('key1');

    // Add key4 - should evict key2 (now oldest)
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBe('value1'); // Still present (was refreshed)
    expect(cache.get('key2')).toBeUndefined(); // Evicted
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  it('should invalidate all entries on version bump', () => {
    const cache = new LRUCache<string, string>(10, 10000);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('value2');

    // Bump version
    cache.invalidate();

    // All entries should be invalidated
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
  });

  it('should allow new entries after invalidation', () => {
    const cache = new LRUCache<string, string>(10, 10000);

    cache.set('key1', 'value1');
    cache.invalidate();

    expect(cache.get('key1')).toBeUndefined();

    // New entries should work
    cache.set('key2', 'value2');
    expect(cache.get('key2')).toBe('value2');
  });

  it('should clear all entries', () => {
    const cache = new LRUCache<string, string>(10, 10000);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    expect(cache.size).toBe(2);

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
  });

  it('should handle object keys', () => {
    const cache = new LRUCache<{ id: string }, string>(10, 1000);

    const key = { id: 'test' };
    cache.set(key, 'value');

    // Same structure should retrieve the value
    expect(cache.get({ id: 'test' })).toBe('value');
  });

  it('should update existing keys without eviction', () => {
    const cache = new LRUCache<string, string>(3, 10000);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // Update key1 - should not trigger eviction
    cache.set('key1', 'updated1');

    expect(cache.size).toBe(3);
    expect(cache.get('key1')).toBe('updated1');
  });
});

describe('createCacheKey', () => {
  it('should create consistent cache keys', () => {
    const key1 = createCacheKey('project1', 'listEntities', { type: 'PERSON' }, 1);
    const key2 = createCacheKey('project1', 'listEntities', { type: 'PERSON' }, 1);

    expect(key1).toBe(key2);
  });

  it('should create different keys for different projects', () => {
    const key1 = createCacheKey('project1', 'listEntities', {}, 1);
    const key2 = createCacheKey('project2', 'listEntities', {}, 1);

    expect(key1).not.toBe(key2);
  });

  it('should create different keys for different queries', () => {
    const key1 = createCacheKey('project1', 'listEntities', {}, 1);
    const key2 = createCacheKey('project1', 'listRelations', {}, 1);

    expect(key1).not.toBe(key2);
  });

  it('should create different keys for different versions', () => {
    const key1 = createCacheKey('project1', 'listEntities', {}, 1);
    const key2 = createCacheKey('project1', 'listEntities', {}, 2);

    expect(key1).not.toBe(key2);
  });

  it('should sort args keys for consistency', () => {
    const key1 = createCacheKey('p', 'q', { b: '2', a: '1' }, 1);
    const key2 = createCacheKey('p', 'q', { a: '1', b: '2' }, 1);

    expect(key1).toBe(key2);
  });
});
