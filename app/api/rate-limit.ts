/**
 * Rate Limiter - Sprint R6 Phase 7
 * Token bucket algorithm for API rate limiting
 */

import { incrementCounter } from '../monitor/metrics';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private buckets: Map<string, TokenBucket>;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private enabled: boolean;

  constructor(maxTokens: number = 12, refillRate: number = 12, enabled: boolean = true) {
    this.buckets = new Map();
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.enabled = enabled;
  }

  /**
   * Check if request is allowed for client
   * Returns { allowed: boolean, retryAfter?: number }
   */
  checkLimit(clientId: string): { allowed: boolean; retryAfter?: number } {
    if (!this.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    // Create bucket if doesn't exist
    if (!bucket) {
      bucket = {
        tokens: this.maxTokens - 1,
        lastRefill: now
      };
      this.buckets.set(clientId, bucket);
      return { allowed: true };
    }

    // Refill tokens based on time elapsed
    const elapsedMs = now - bucket.lastRefill;
    const elapsedSeconds = elapsedMs / 1000;
    const tokensToAdd = elapsedSeconds * this.refillRate;

    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if request can proceed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    // Calculate retry-after in seconds
    const tokensNeeded = 1 - bucket.tokens;
    const retryAfter = Math.ceil(tokensNeeded / this.refillRate);

    // Track rate limit hit
    incrementCounter('api_rate_limited_total');

    return {
      allowed: false,
      retryAfter
    };
  }

  /**
   * Reset bucket for client
   */
  reset(clientId: string): void {
    this.buckets.delete(clientId);
  }

  /**
   * Clear all buckets
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Get current bucket state (for testing/debugging)
   */
  getBucket(clientId: string): TokenBucket | null {
    return this.buckets.get(clientId) || null;
  }

  /**
   * Enable/disable rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get stats
   */
  stats(): {
    totalClients: number;
    maxTokens: number;
    refillRate: number;
    enabled: boolean;
  } {
    return {
      totalClients: this.buckets.size,
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      enabled: this.enabled
    };
  }
}

/**
 * Global rate limiter instance
 * Default: 12 requests per second max, refills at 12/sec
 */
export const globalRateLimiter = new RateLimiter(12, 12, true);

/**
 * Extract client ID from request
 * Uses X-Forwarded-For header if available, falls back to IP
 */
export function extractClientId(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ip.split(',')[0].trim();
  }

  const realIp = headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fallback to connection remote address (not in headers)
  return 'unknown';
}
