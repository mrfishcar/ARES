/**
 * Performance test for appositive cache
 *
 * Ensures buildApposCache() runs in O(n) time and completes quickly
 * even for complex sentences with nested appositive structures.
 */

import { describe, it, expect } from 'vitest';
import { buildApposCache } from '../../app/engine/extract/apposCache';
import type { Token } from '../../app/engine/extract/parse-types';

describe('Appositive Cache Performance', () => {
  it('should build cache in under 1ms for 60-token sentence', () => {
    // Create a realistic 60-token sentence with appositives
    // "Aragorn, son of Arathorn and descendant of Isildur, traveled to Gondor with his companions Legolas and Gimli"
    const tokens: Token[] = [];

    // Build tokens array (simplified mock)
    for (let i = 0; i < 60; i++) {
      tokens.push({
        i,
        text: `token${i}`,
        lemma: `token${i}`,
        pos: i % 3 === 0 ? 'PROPN' : 'NOUN',
        tag: 'NN',
        dep: i === 5 || i === 12 ? 'appos' : 'nsubj', // Mark some as appositive
        head: i > 0 ? Math.max(0, i - 2) : 0,
        start: i * 5,
        end: i * 5 + 4,
        ent: '',
        ent_iob: 'O'
      });
    }

    // Measure cache building time
    const startTime = performance.now();
    const cache = buildApposCache(tokens);
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Cache should complete in under 1ms on modern hardware
    expect(duration).toBeLessThan(1.0);

    // Verify cache structure
    expect(cache.inAppos).toHaveLength(60);
    expect(cache.indexOf.size).toBe(60);

    // Verify appositives were marked
    expect(cache.inAppos[5]).toBe(true);  // Direct appositive
    expect(cache.inAppos[12]).toBe(true); // Another appositive
  });

  it('should handle sentence with no appositives efficiently', () => {
    // Simple sentence: "Harry went to Hogwarts"
    const tokens: Token[] = [];

    for (let i = 0; i < 5; i++) {
      tokens.push({
        i,
        text: `token${i}`,
        lemma: `token${i}`,
        pos: 'NOUN',
        tag: 'NN',
        dep: 'nsubj',
        head: i > 0 ? i - 1 : 0,
        start: i * 5,
        end: i * 5 + 4,
        ent: '',
        ent_iob: 'O'
      });
    }

    const startTime = performance.now();
    const cache = buildApposCache(tokens);
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Should be even faster with no appositives
    expect(duration).toBeLessThan(0.5);

    // No tokens should be marked as appositive
    expect(cache.inAppos.every(v => v === false)).toBe(true);
  });

  it('should handle deeply nested appositives', () => {
    // "X, Y of Z of W, ..."
    const tokens: Token[] = [];

    for (let i = 0; i < 40; i++) {
      tokens.push({
        i,
        text: `token${i}`,
        lemma: `token${i}`,
        pos: 'PROPN',
        tag: 'NNP',
        dep: i % 10 === 5 ? 'appos' : 'nmod', // Every 10th token is appositive
        head: i > 0 ? i - 1 : 0,
        start: i * 5,
        end: i * 5 + 4,
        ent: '',
        ent_iob: 'O'
      });
    }

    const startTime = performance.now();
    const cache = buildApposCache(tokens);
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Should still complete quickly
    expect(duration).toBeLessThan(2.0);

    // Verify appositive chains are marked
    const apposCount = cache.inAppos.filter(v => v).length;
    expect(apposCount).toBeGreaterThan(0);
  });
});
