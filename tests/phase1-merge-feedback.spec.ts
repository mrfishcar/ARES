/**
 * Phase 1.3 Tests: Merge Feedback Validation
 *
 * Verifies that the merge system:
 * - Computes unified quality scores for merged entities
 * - Preserves tier information after merges
 * - Flags merged entities that fail quality validation
 * - Maintains provenance of original cluster entities
 *
 * Key invariants:
 * 1. Merged entities should have computed tiers
 * 2. Quality metadata should be preserved in attrs
 * 3. Original cluster info should be preserved for multi-entity merges
 * 4. Failed quality validation should be flagged
 */

import { describe, it, expect } from 'vitest';
import {
  mergeEntitiesAcrossDocs,
  jaroWinkler,
  MergeResult,
} from '../app/engine/merge';
import type { Entity, EntityTier } from '../app/engine/schema';

// Test entity factory
function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: `test-${Math.random().toString(36).substr(2, 9)}`,
    type: 'PERSON',
    canonical: 'Test Person',
    aliases: [],
    created_at: new Date().toISOString(),
    confidence: 0.7,
    ...overrides,
  };
}

describe('Phase 1.3: Merge Feedback Validation', () => {
  describe('Tier Computation for Merged Entities', () => {
    it('should compute tier for single entity cluster', () => {
      const entity = createTestEntity({
        canonical: 'John Smith',
        type: 'PERSON',
        confidence: 0.8,
      });

      const result = mergeEntitiesAcrossDocs([entity]);

      expect(result.globals).toHaveLength(1);
      const merged = result.globals[0];

      // Should have computed tier
      expect(merged.tier).toBeDefined();
      expect(['TIER_A', 'TIER_B', 'TIER_C']).toContain(merged.tier);

      // Should have quality metadata
      expect(merged.attrs).toBeDefined();
      expect(merged.attrs?.qualityScore).toBeDefined();
      expect(merged.attrs?.qualityScore?.namehoodScore).toBeGreaterThanOrEqual(0);
      expect(merged.attrs?.qualityScore?.passesFilter).toBeDefined();
    });

    it('should compute tier for multi-entity cluster merge', () => {
      const entities = [
        createTestEntity({
          id: 'e1',
          canonical: 'John Smith',
          type: 'PERSON',
          confidence: 0.7,
        }),
        createTestEntity({
          id: 'e2',
          canonical: 'John Smith',
          aliases: ['J. Smith'],
          type: 'PERSON',
          confidence: 0.8,
        }),
      ];

      const result = mergeEntitiesAcrossDocs(entities);

      // Should merge into single entity
      expect(result.globals).toHaveLength(1);
      const merged = result.globals[0];

      // Should have computed tier
      expect(merged.tier).toBeDefined();
      expect(['TIER_A', 'TIER_B', 'TIER_C']).toContain(merged.tier);

      // Should preserve original cluster info for multi-entity merges
      expect(merged.attrs?.mergedFrom).toBeDefined();
      expect(merged.attrs?.mergedFrom).toHaveLength(2);
    });

    it('should assign higher tier to multi-token names with good evidence', () => {
      // Multi-token name should get higher namehood score
      const multiToken = createTestEntity({
        canonical: 'Professor John Smith',
        type: 'PERSON',
        confidence: 0.8,
        attrs: { nerLabel: 'PERSON' },
      });

      // Single token name should get lower namehood score
      const singleToken = createTestEntity({
        canonical: 'John',
        type: 'PERSON',
        confidence: 0.8,
      });

      const multiResult = mergeEntitiesAcrossDocs([multiToken]);
      const singleResult = mergeEntitiesAcrossDocs([singleToken]);

      const multiScore = multiResult.globals[0].attrs?.qualityScore?.namehoodScore ?? 0;
      const singleScore = singleResult.globals[0].attrs?.qualityScore?.namehoodScore ?? 0;

      expect(multiScore).toBeGreaterThan(singleScore);
    });
  });

  describe('Quality Metadata Preservation', () => {
    it('should store quality score breakdown in attrs', () => {
      const entity = createTestEntity({
        canonical: 'Dr. Jane Doe',
        type: 'PERSON',
        confidence: 0.85,
        attrs: { nerLabel: 'PERSON' },
      });

      const result = mergeEntitiesAcrossDocs([entity]);
      const merged = result.globals[0];

      expect(merged.attrs?.qualityScore).toBeDefined();
      expect(merged.attrs?.qualityScore).toHaveProperty('namehoodScore');
      expect(merged.attrs?.qualityScore).toHaveProperty('finalConfidence');
      expect(merged.attrs?.qualityScore).toHaveProperty('tierReason');
      expect(merged.attrs?.qualityScore).toHaveProperty('passesFilter');
    });

    it('should preserve original entity tiers in mergedFrom', () => {
      const entities = [
        createTestEntity({
          id: 'e1',
          canonical: 'Robert Smith',
          type: 'PERSON',
          tier: 'TIER_A' as EntityTier,
          confidence: 0.9,
        }),
        createTestEntity({
          id: 'e2',
          canonical: 'Robert Smith',
          type: 'PERSON',
          tier: 'TIER_B' as EntityTier,
          confidence: 0.6,
        }),
      ];

      const result = mergeEntitiesAcrossDocs(entities);
      const merged = result.globals[0];

      // Check mergedFrom records original tiers
      expect(merged.attrs?.mergedFrom).toBeDefined();
      const mergedFrom = merged.attrs?.mergedFrom as Array<{
        id: string;
        originalTier: string;
        originalConfidence: number;
      }>;

      expect(mergedFrom).toHaveLength(2);
      expect(mergedFrom.some(m => m.originalTier === 'TIER_A')).toBe(true);
      expect(mergedFrom.some(m => m.originalTier === 'TIER_B')).toBe(true);
    });

    it('should not add mergedFrom for single-entity clusters', () => {
      const entity = createTestEntity({
        canonical: 'Solo Person',
        type: 'PERSON',
      });

      const result = mergeEntitiesAcrossDocs([entity]);
      const merged = result.globals[0];

      // Single entities should not have mergedFrom
      expect(merged.attrs?.mergedFrom).toBeUndefined();
    });
  });

  describe('Quality Validation Tracking', () => {
    it('should track passed validation in stats', () => {
      const entities = [
        createTestEntity({
          canonical: 'Valid Person',
          type: 'PERSON',
          confidence: 0.8,
        }),
        createTestEntity({
          canonical: 'Another Valid',
          type: 'PERSON',
          confidence: 0.7,
        }),
      ];

      const result = mergeEntitiesAcrossDocs(entities);

      // Stats should track quality validation
      expect(result.stats.quality_validation).toBeDefined();
      expect(result.stats.quality_validation.passed).toBeGreaterThanOrEqual(0);
      expect(result.stats.quality_validation.failed).toBeGreaterThanOrEqual(0);
    });

    it('should report quality validation in result stats', () => {
      const entity = createTestEntity({
        canonical: 'Test Entity',
        type: 'PERSON',
      });

      const result = mergeEntitiesAcrossDocs([entity]);

      expect(result.stats).toBeDefined();
      expect(result.stats.quality_validation).toBeDefined();
      expect(typeof result.stats.quality_validation.passed).toBe('number');
      expect(typeof result.stats.quality_validation.failed).toBe('number');
      expect(Array.isArray(result.stats.quality_validation.failed_entities)).toBe(true);
    });
  });

  describe('Merge Decision Tracking', () => {
    it('should record merge decisions with confidence', () => {
      const entities = [
        createTestEntity({
          id: 'e1',
          canonical: 'Michael Johnson',
          type: 'PERSON',
        }),
        createTestEntity({
          id: 'e2',
          canonical: 'Michael Johnson',
          type: 'PERSON',
        }),
      ];

      const result = mergeEntitiesAcrossDocs(entities);

      // Should have merge decisions
      expect(result.decisions.length).toBeGreaterThanOrEqual(2);

      // Each decision should have required fields
      for (const decision of result.decisions) {
        expect(decision.local_entity_id).toBeDefined();
        expect(decision.global_entity_id).toBeDefined();
        expect(decision.confidence).toBeGreaterThanOrEqual(0);
        expect(decision.confidence).toBeLessThanOrEqual(1);
        expect(decision.method).toBeDefined();
        expect(['substring_match', 'jaro_winkler_strong', 'jaro_winkler_weak']).toContain(
          decision.method
        );
      }
    });

    it('should calculate stats correctly', () => {
      const entities = [
        createTestEntity({
          canonical: 'Person A',
          type: 'PERSON',
        }),
        createTestEntity({
          canonical: 'Person B',
          type: 'PERSON',
        }),
        createTestEntity({
          canonical: 'Place A',
          type: 'PLACE',
        }),
      ];

      const result = mergeEntitiesAcrossDocs(entities);

      expect(result.stats.total_entities).toBe(3);
      expect(result.stats.merged_clusters).toBe(result.globals.length);
      expect(result.stats.avg_confidence).toBeGreaterThanOrEqual(0);
      expect(result.stats.avg_confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Jaro-Winkler Clustering', () => {
    it('should merge entities with high similarity', () => {
      const entities = [
        createTestEntity({
          canonical: 'Elizabeth Warren',
          type: 'PERSON',
        }),
        createTestEntity({
          canonical: 'Elizabeth Warren',
          type: 'PERSON',
        }),
      ];

      const result = mergeEntitiesAcrossDocs(entities);

      // Should merge into single entity
      expect(result.globals).toHaveLength(1);
      expect(result.globals[0].canonical).toBe('Elizabeth Warren');
    });

    it('should NOT merge entities with different types', () => {
      const entities = [
        createTestEntity({
          canonical: 'Apple',
          type: 'PERSON',
        }),
        createTestEntity({
          canonical: 'Apple',
          type: 'ORG',
        }),
      ];

      const result = mergeEntitiesAcrossDocs(entities);

      // Should remain separate due to different types
      expect(result.globals).toHaveLength(2);
    });

    it('should NOT merge entities with different surnames', () => {
      const entities = [
        createTestEntity({
          canonical: 'Harry Potter',
          type: 'PERSON',
        }),
        createTestEntity({
          canonical: 'Lily Evans',
          type: 'PERSON',
        }),
      ];

      const result = mergeEntitiesAcrossDocs(entities);

      // Should remain separate
      expect(result.globals).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty entity list', () => {
      const result = mergeEntitiesAcrossDocs([]);

      expect(result.globals).toHaveLength(0);
      expect(result.decisions).toHaveLength(0);
      expect(result.stats.total_entities).toBe(0);
    });

    it('should handle entity with missing confidence', () => {
      const entity = createTestEntity({
        canonical: 'No Confidence Person',
        type: 'PERSON',
        confidence: undefined,
      });

      const result = mergeEntitiesAcrossDocs([entity]);

      expect(result.globals).toHaveLength(1);
      const merged = result.globals[0];
      expect(merged.tier).toBeDefined();
      expect(merged.attrs?.qualityScore).toBeDefined();
    });

    it('should handle entity with missing tier', () => {
      const entity = createTestEntity({
        canonical: 'No Tier Person',
        type: 'PERSON',
        tier: undefined,
      });

      const result = mergeEntitiesAcrossDocs([entity]);

      expect(result.globals).toHaveLength(1);
      const merged = result.globals[0];
      // Should compute tier even if original was missing
      expect(merged.tier).toBeDefined();
    });
  });
});

describe('Jaro-Winkler Algorithm', () => {
  it('should return 1.0 for identical strings', () => {
    expect(jaroWinkler('hello', 'hello')).toBe(1.0);
  });

  it('should return 0.0 for completely different strings', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0.0);
  });

  it('should return high score for similar strings', () => {
    const score = jaroWinkler('Johnson', 'Jonhson'); // Common typo
    expect(score).toBeGreaterThan(0.9);
  });

  it('should return lower score for less similar strings', () => {
    const score = jaroWinkler('Aragorn', 'Arathorn');
    expect(score).toBeLessThan(0.92); // Below strong threshold
  });

  it('should give prefix boost for common prefixes', () => {
    const withPrefix = jaroWinkler('Robert', 'Roberto');
    const withoutPrefix = jaroWinkler('Robert', 'Trebor');
    expect(withPrefix).toBeGreaterThan(withoutPrefix);
  });
});
