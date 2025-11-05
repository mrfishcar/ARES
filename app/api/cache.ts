/**
 * LRU Cache with TTL and Version Support
 * Sprint R4 - Performance optimization for list queries
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  version: number;
}

export class LRUCache<K, V> {
  private cache: Map<string, CacheEntry<V>>;
  private maxSize: number;
  private ttlMs: number;
  private currentVersion: number = 0;

  constructor(maxSize: number = 100, ttlMs: number = 2000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get a value from cache if not expired and version matches
   */
  get(key: K): V | undefined {
    const keyStr = this.serializeKey(key);
    const entry = this.cache.get(keyStr);

    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(keyStr);
      return undefined;
    }

    // Check version mismatch (invalidation)
    if (entry.version !== this.currentVersion) {
      this.cache.delete(keyStr);
      return undefined;
    }

    // LRU: move to end (most recently used)
    this.cache.delete(keyStr);
    this.cache.set(keyStr, entry);

    return entry.value;
  }

  /**
   * Set a value in cache with current version
   */
  set(key: K, value: V): void {
    const keyStr = this.serializeKey(key);

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(keyStr)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(keyStr, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      version: this.currentVersion
    });
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Bump version to invalidate all cached entries
   * Call this on ingest/approve/dismiss/snapshot-restore
   */
  invalidate(): void {
    this.currentVersion++;
    // Optionally: this.clear() for immediate cleanup, or let lazy eviction handle it
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Serialize cache key to string
   */
  private serializeKey(key: K): string {
    if (typeof key === 'string') {
      return key;
    }
    return JSON.stringify(key);
  }
}

/**
 * Create a versioned cache key for API queries
 */
export function createCacheKey(
  project: string,
  queryName: string,
  args: Record<string, any>,
  version: number
): string {
  const argsStr = JSON.stringify(args, Object.keys(args).sort());
  return `${project}|${queryName}|${argsStr}|${version}`;
}
