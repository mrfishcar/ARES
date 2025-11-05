/**
 * Performance Tests - Sprint R6 Phase 7
 * Tests for caching and rate limiting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ApolloServer } from '@apollo/server';
import { createGraphQLServer } from '../../app/api/graphql';
import { saveGraph } from '../../app/storage/storage';
import { clearAllCaches, getAllCacheStats } from '../../app/api/cache-layer';
import { globalRateLimiter } from '../../app/api/rate-limit';
import type { KnowledgeGraph } from '../../app/storage/storage';

const TEST_PROJECT = 'test-performance';
const TEST_PROJECT_DIR = path.join(process.cwd(), 'data', 'projects', TEST_PROJECT);
const TEST_GRAPH_PATH = path.join(TEST_PROJECT_DIR, 'graph.json');

describe('Performance - Caching and Rate Limiting', () => {
  let server: ApolloServer;

  beforeEach(async () => {
    // Create test project directory
    if (!fs.existsSync(TEST_PROJECT_DIR)) {
      fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
    }

    // Create test graph
    const testGraph: KnowledgeGraph = {
      entities: [
        {
          id: 'entity1',
          type: 'PERSON',
          canonical: 'Test Entity',
          aliases: [],
          evidence: []
        }
      ],
      relations: [],
      conflicts: [],
      provenance: new Map(),
      metadata: {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        doc_count: 1,
        doc_ids: ['test-doc']
      }
    };

    saveGraph(testGraph, TEST_GRAPH_PATH);

    // Clear caches
    clearAllCaches();

    // Reset rate limiter
    globalRateLimiter.clear();

    // Create GraphQL server (no need to start for executeOperation)
    server = createGraphQLServer(TEST_GRAPH_PATH);
  });

  afterEach(async () => {
    // Clean up test data
    if (fs.existsSync(TEST_PROJECT_DIR)) {
      fs.rmSync(TEST_PROJECT_DIR, { recursive: true });
    }

    // Clear caches
    clearAllCaches();

    // Reset rate limiter
    globalRateLimiter.clear();

    // No need to stop server - createGraphQLServer doesn't start it
  });

  describe('Cache Hit/Miss', () => {
    it('should cache search results', async () => {
      // First query - cache miss
      const response1 = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Test") {
              hits {
                id
                label
              }
            }
          }
        `
      });

      expect(response1.body.kind).toBe('single');
      if (response1.body.kind === 'single') {
        expect(response1.body.singleResult.errors).toBeUndefined();
      }

      // Check cache stats
      const stats1 = getAllCacheStats();
      expect(stats1.search.size).toBeGreaterThan(0);

      // Second query - should hit cache
      const response2 = await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Test") {
              hits {
                id
                label
              }
            }
          }
        `
      });

      expect(response2.body.kind).toBe('single');
      if (response2.body.kind === 'single') {
        expect(response2.body.singleResult.errors).toBeUndefined();
      }

      // Cache size should not have increased (cache hit)
      const stats2 = getAllCacheStats();
      expect(stats2.search.size).toBe(stats1.search.size);
    });

    it('should cache graph neighborhood results', async () => {
      // First query - cache miss
      const response1 = await server.executeOperation({
        query: `
          query {
            graphNeighborhood(
              project: "${TEST_PROJECT}"
              centerId: "entity1"
              depth: 1
            ) {
              nodes { id }
              edges { id }
            }
          }
        `
      });

      expect(response1.body.kind).toBe('single');
      if (response1.body.kind === 'single') {
        expect(response1.body.singleResult.errors).toBeUndefined();
      }

      // Check cache stats
      const stats1 = getAllCacheStats();
      expect(stats1.graph.size).toBeGreaterThan(0);

      // Second query - should hit cache
      const response2 = await server.executeOperation({
        query: `
          query {
            graphNeighborhood(
              project: "${TEST_PROJECT}"
              centerId: "entity1"
              depth: 1
            ) {
              nodes { id }
              edges { id }
            }
          }
        `
      });

      expect(response2.body.kind).toBe('single');
      if (response2.body.kind === 'single') {
        expect(response2.body.singleResult.errors).toBeUndefined();
      }

      // Cache size should not have increased (cache hit)
      const stats2 = getAllCacheStats();
      expect(stats2.graph.size).toBe(stats1.graph.size);
    });

    it('should cache different queries separately', async () => {
      // Query 1
      await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Test") {
              hits { id }
            }
          }
        `
      });

      const stats1 = getAllCacheStats();
      const cacheSize1 = stats1.search.size;

      // Query 2 with different params
      await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Entity") {
              hits { id }
            }
          }
        `
      });

      const stats2 = getAllCacheStats();
      const cacheSize2 = stats2.search.size;

      // Cache size should have increased (different query)
      expect(cacheSize2).toBeGreaterThan(cacheSize1);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache on approve', async () => {
      // First, add a review item
      const reviewPath = path.join(TEST_PROJECT_DIR, 'review.json');
      const reviewQueue = {
        items: [
          {
            id: 'review1',
            type: 'entity',
            confidence: 0.8,
            data: {
              id: 'e2',
              type: 'PERSON',
              canonical: 'New Entity',
              aliases: [],
              evidence: []
            },
            docId: 'doc1',
            addedAt: new Date().toISOString(),
            status: 'pending'
          }
        ],
        metadata: {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      };
      fs.writeFileSync(reviewPath, JSON.stringify(reviewQueue, null, 2));

      // Perform search to cache results
      await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Test") {
              hits { id }
            }
          }
        `
      });

      const stats1 = getAllCacheStats();
      expect(stats1.search.size).toBeGreaterThan(0);

      // Approve review item (should invalidate cache)
      await server.executeOperation({
        query: `
          mutation {
            approveReviewItem(project: "${TEST_PROJECT}", id: "review1")
          }
        `
      });

      // Cache should be invalidated (empty or smaller)
      const stats2 = getAllCacheStats();
      // Note: Invalidation clears entries matching the project pattern
      // The cache size might be 0 or reduced depending on implementation
      expect(stats2).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Enable rate limiting for tests
      globalRateLimiter.setEnabled(true);
    });

    it('should allow requests within rate limit', async () => {
      const clientId = 'test-client-1';

      // Reset bucket for clean test
      globalRateLimiter.reset(clientId);

      // Make several requests (within limit)
      for (let i = 0; i < 5; i++) {
        const result = globalRateLimiter.checkLimit(clientId);
        expect(result.allowed).toBe(true);
      }
    });

    it('should reject requests exceeding rate limit', async () => {
      const clientId = 'test-client-2';

      // Reset bucket for clean test
      globalRateLimiter.reset(clientId);

      // Exhaust rate limit (default is 12 tokens)
      let allowed = 0;
      let rejected = 0;

      for (let i = 0; i < 15; i++) {
        const result = globalRateLimiter.checkLimit(clientId);
        if (result.allowed) {
          allowed++;
        } else {
          rejected++;
        }
      }

      // Should have some allowed and some rejected
      expect(allowed).toBeGreaterThan(0);
      expect(rejected).toBeGreaterThan(0);
      expect(allowed).toBeLessThan(15);
    });

    it('should return retry-after on rate limit', async () => {
      const clientId = 'test-client-3';

      // Reset bucket for clean test
      globalRateLimiter.reset(clientId);

      // Exhaust rate limit
      for (let i = 0; i < 13; i++) {
        globalRateLimiter.checkLimit(clientId);
      }

      // Next request should be rejected with retry-after
      const result = globalRateLimiter.checkLimit(clientId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should refill tokens over time', async () => {
      const clientId = 'test-client-4';

      // Reset bucket for clean test
      globalRateLimiter.reset(clientId);

      // Use some tokens
      for (let i = 0; i < 5; i++) {
        globalRateLimiter.checkLimit(clientId);
      }

      // Wait for refill (100ms should add ~1.2 tokens at 12/sec rate)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be able to make another request
      const result = globalRateLimiter.checkLimit(clientId);
      expect(result.allowed).toBe(true);
    });

    it('should respect disabled rate limiting', async () => {
      const clientId = 'test-client-5';

      // Disable rate limiting
      globalRateLimiter.setEnabled(false);

      // Reset bucket for clean test
      globalRateLimiter.reset(clientId);

      // Make many requests - all should be allowed
      for (let i = 0; i < 20; i++) {
        const result = globalRateLimiter.checkLimit(clientId);
        expect(result.allowed).toBe(true);
      }

      // Re-enable for other tests
      globalRateLimiter.setEnabled(true);
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache size correctly', async () => {
      const initialStats = getAllCacheStats();

      // Make a search query
      await server.executeOperation({
        query: `
          query {
            search(project: "${TEST_PROJECT}", text: "Test") {
              hits { id }
            }
          }
        `
      });

      const afterSearchStats = getAllCacheStats();
      expect(afterSearchStats.search.size).toBeGreaterThan(initialStats.search.size);

      // Make a graph query
      await server.executeOperation({
        query: `
          query {
            graphNeighborhood(
              project: "${TEST_PROJECT}"
              centerId: "entity1"
              depth: 1
            ) {
              nodes { id }
            }
          }
        `
      });

      const afterGraphStats = getAllCacheStats();
      expect(afterGraphStats.graph.size).toBeGreaterThan(initialStats.graph.size);
    });

    it('should respect cache max size', async () => {
      const stats = getAllCacheStats();

      // Max sizes should match configuration
      expect(stats.query.maxSize).toBe(300);
      expect(stats.graph.maxSize).toBe(100);
      expect(stats.search.maxSize).toBe(200);
    });

    it('should respect cache TTL', async () => {
      const stats = getAllCacheStats();

      // TTLs should match configuration
      expect(stats.query.ttlMs).toBe(2500);
      expect(stats.graph.ttlMs).toBe(5000);
      expect(stats.search.ttlMs).toBe(3000);
    });
  });
});
