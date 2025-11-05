/**
 * Cache Layer - Sprint R6 Phase 7
 * LRU cache with versioned keys for GraphQL query results
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Simple LRU cache implementation
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 300, ttlMs: number = 2500) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T): void {
    // Remove if exists (to update timestamp)
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate specific key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching pattern
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs
    };
  }
}

/**
 * Global cache instances for different query types
 */
export const queryCache = new LRUCache<any>(300, 2500); // 2.5s TTL, 300 entries max
export const graphCache = new LRUCache<any>(100, 5000);  // 5s TTL for graph queries
export const searchCache = new LRUCache<any>(200, 3000); // 3s TTL for search results

/**
 * Generate cache key with version and parameters
 */
export function generateCacheKey(
  queryName: string,
  project: string,
  params: Record<string, any> = {}
): string {
  // Sort params for consistent keys
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join('|');

  return `${queryName}:${project}:${sortedParams}`;
}

/**
 * Invalidate all cache entries for a project
 * Call this after mutations (ingest, approve, dismiss)
 */
export function invalidateProjectCache(project: string): void {
  queryCache.invalidatePattern(`^[^:]+:${project}:`);
  graphCache.invalidatePattern(`^[^:]+:${project}:`);
  searchCache.invalidatePattern(`^[^:]+:${project}:`);
}

/**
 * Clear all caches (for testing)
 */
export function clearAllCaches(): void {
  queryCache.clear();
  graphCache.clear();
  searchCache.clear();
}

/**
 * Get cache statistics for all caches
 */
export function getAllCacheStats(): {
  query: ReturnType<typeof queryCache.stats>;
  graph: ReturnType<typeof graphCache.stats>;
  search: ReturnType<typeof searchCache.stats>;
} {
  return {
    query: queryCache.stats(),
    graph: graphCache.stats(),
    search: searchCache.stats()
  };
}
