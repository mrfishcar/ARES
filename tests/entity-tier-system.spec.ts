/**
 * Entity Tier System Tests
 *
 * Tests for the multi-tier entity model that enables graduated recall:
 * - TIER_A: High-confidence, graph-worthy
 * - TIER_B: Medium-confidence, supporting
 * - TIER_C: Low-confidence, candidates (isolated)
 */

import { describe, it, expect } from 'vitest';
import {
  assignEntityTier,
  extractTierFeatures,
  assignTiersToEntities,
  canMergeByTier,
  filterByTier,
  getTierStats,
  TIER_CONFIDENCE_THRESHOLDS,
} from '../app/engine/entity-tier-assignment';
import {
  filterAndTierEntities,
  getEntitiesAtMinTier,
} from '../app/engine/entity-quality-filter';
import type { Entity, EntityTier } from '../app/engine/schema';

// Helper to create test entities
function createEntity(
  canonical: string,
  type: string = 'PERSON',
  confidence: number = 0.8,
  attrs: Record<string, unknown> = {}
): Entity {
  return {
    id: `test-${canonical.toLowerCase().replace(/\s+/g, '-')}`,
    type: type as Entity['type'],
    canonical,
    aliases: [canonical],
    confidence,
    attrs: attrs as Record<string, string | number | boolean>,
    created_at: new Date().toISOString(),
  };
}

describe('Entity Tier Assignment', () => {
  describe('assignEntityTier', () => {
    it('assigns TIER_A to high-confidence entities', () => {
      const entity = createEntity('Barty Beauregard', 'PERSON', 0.85);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
      expect(reason).toContain('confidence');
    });

    it('assigns TIER_B to medium-confidence entities', () => {
      const entity = createEntity('Barty Beauregard', 'PERSON', 0.55);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_B');
    });

    it('assigns TIER_C to low-confidence single-token entities', () => {
      // Note: Multi-token names get promoted to TIER_B, so use single token
      const entity = createEntity('Stranger', 'PERSON', 0.35);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
    });

    it('promotes NER-backed entities to TIER_A', () => {
      const entity = createEntity('Barty', 'PERSON', 0.45, { nerLabel: 'PERSON' });
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
      expect(reason).toBe('ner_backed');
    });

    it('promotes multi-token names from TIER_C to TIER_B', () => {
      const entity = createEntity('Roy Burkley', 'PERSON', 0.35);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_B');
      expect(reason).toBe('multi_token_name');
    });

    it('promotes title-prefixed single-token entities from TIER_C to TIER_B', () => {
      // Note: Multi-token names get promoted by multi_token_name first
      // So we test a single-token title like "Doctor" which is in TITLE_PREFIXES
      const entity = createEntity('Doctor', 'PERSON', 0.35);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_B');
      expect(reason).toBe('title_prefix');
    });

    it('demotes sentence-initial single tokens to TIER_C', () => {
      const entity = createEntity('Barty', 'PERSON', 0.75, {
        isSentenceInitial: true,
        occursNonInitial: false,
      });
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('sentence_initial_single_token');
    });

    it('does not demote if entity occurs non-initially', () => {
      const entity = createEntity('Barty', 'PERSON', 0.75, {
        isSentenceInitial: true,
        occursNonInitial: true,
      });
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
    });
  });

  describe('canMergeByTier', () => {
    it('allows TIER_A to merge with TIER_A', () => {
      const entity1 = createEntity('Barty', 'PERSON', 0.85);
      entity1.tier = 'TIER_A';
      const entity2 = createEntity('Beauregard', 'PERSON', 0.80);
      entity2.tier = 'TIER_A';

      const { canMerge } = canMergeByTier(entity1, entity2);
      expect(canMerge).toBe(true);
    });

    it('allows TIER_B to merge with TIER_A', () => {
      const entity1 = createEntity('Barty', 'PERSON', 0.55);
      entity1.tier = 'TIER_B';
      const entity2 = createEntity('Beauregard', 'PERSON', 0.80);
      entity2.tier = 'TIER_A';

      const { canMerge } = canMergeByTier(entity1, entity2);
      expect(canMerge).toBe(true);
    });

    it('prevents TIER_C from merging with TIER_A', () => {
      const entity1 = createEntity('Barty', 'PERSON', 0.35);
      entity1.tier = 'TIER_C';
      const entity2 = createEntity('Beauregard', 'PERSON', 0.80);
      entity2.tier = 'TIER_A';

      const { canMerge, reason } = canMergeByTier(entity1, entity2);
      expect(canMerge).toBe(false);
      expect(reason).toBe('tier_c_isolated');
    });

    it('prevents TIER_C from merging with TIER_C', () => {
      const entity1 = createEntity('Barty', 'PERSON', 0.35);
      entity1.tier = 'TIER_C';
      const entity2 = createEntity('Beauregard', 'PERSON', 0.35);
      entity2.tier = 'TIER_C';

      const { canMerge } = canMergeByTier(entity1, entity2);
      expect(canMerge).toBe(false);
    });
  });

  describe('filterByTier', () => {
    const entities: Entity[] = [
      { ...createEntity('A', 'PERSON', 0.9), tier: 'TIER_A' as EntityTier },
      { ...createEntity('B', 'PERSON', 0.6), tier: 'TIER_B' as EntityTier },
      { ...createEntity('C', 'PERSON', 0.35), tier: 'TIER_C' as EntityTier },
    ];

    it('filters to TIER_A only', () => {
      const result = filterByTier(entities, 'TIER_A');
      expect(result.length).toBe(1);
      expect(result[0].canonical).toBe('A');
    });

    it('filters to TIER_A and TIER_B', () => {
      const result = filterByTier(entities, 'TIER_B');
      expect(result.length).toBe(2);
      expect(result.map(e => e.canonical)).toContain('A');
      expect(result.map(e => e.canonical)).toContain('B');
    });

    it('includes all tiers when filtering to TIER_C', () => {
      const result = filterByTier(entities, 'TIER_C');
      expect(result.length).toBe(3);
    });
  });

  describe('getTierStats', () => {
    it('counts entities by tier', () => {
      const entities: Entity[] = [
        { ...createEntity('A', 'PERSON'), tier: 'TIER_A' as EntityTier },
        { ...createEntity('B', 'PERSON'), tier: 'TIER_A' as EntityTier },
        { ...createEntity('C', 'PERSON'), tier: 'TIER_B' as EntityTier },
        { ...createEntity('D', 'PERSON'), tier: 'TIER_C' as EntityTier },
        createEntity('E', 'PERSON'), // unassigned
      ];

      const stats = getTierStats(entities);
      expect(stats.total).toBe(5);
      expect(stats.tierA).toBe(2);
      expect(stats.tierB).toBe(1);
      expect(stats.tierC).toBe(1);
      expect(stats.unassigned).toBe(1);
    });
  });
});

describe('Tiered Entity Filtering', () => {
  describe('filterAndTierEntities', () => {
    it('rejects absolute garbage (pronouns, stopwords)', () => {
      const entities = [
        createEntity('he', 'PERSON', 0.9),
        createEntity('the', 'PERSON', 0.9),
        createEntity('when', 'PERSON', 0.9),
        createEntity('Barty', 'PERSON', 0.9),
      ];

      const result = filterAndTierEntities(entities);

      expect(result.rejected.length).toBe(3);
      expect(result.allAccepted.length).toBe(1);
      expect(result.allAccepted[0].canonical).toBe('Barty');
    });

    it('assigns tiers to accepted entities', () => {
      const entities = [
        createEntity('Barty Beauregard', 'PERSON', 0.85, { nerLabel: 'PERSON' }),
        createEntity('Mr. Green', 'PERSON', 0.55),
        createEntity('Stranger', 'PERSON', 0.35),
      ];

      const result = filterAndTierEntities(entities);

      expect(result.tierA.length).toBe(1);
      expect(result.tierA[0].canonical).toBe('Barty Beauregard');

      // Mr. Green should be TIER_B due to title prefix
      expect(result.tierB.length).toBeGreaterThanOrEqual(1);

      // Stats should be accurate
      expect(result.stats.tierA).toBe(result.tierA.length);
      expect(result.stats.tierB).toBe(result.tierB.length);
      expect(result.stats.tierC).toBe(result.tierC.length);
    });

    it('maintains type safety (PLACE vs ORG)', () => {
      const entities = [
        createEntity('Mont Linola', 'PLACE', 0.75),
        createEntity('Mont Linola Junior High', 'ORG', 0.85),
      ];

      const result = filterAndTierEntities(entities);

      // Both should be accepted (different types)
      expect(result.allAccepted.length).toBe(2);

      // PLACE should have tier assigned
      const place = result.allAccepted.find(e => e.type === 'PLACE');
      expect(place).toBeDefined();
      expect(place?.tier).toBeDefined();
    });
  });

  describe('getEntitiesAtMinTier', () => {
    it('returns only TIER_A for strict mode', () => {
      const entities = [
        createEntity('A', 'PERSON', 0.9),
        createEntity('B', 'PERSON', 0.6),
        createEntity('C', 'PERSON', 0.35),
      ];

      const result = filterAndTierEntities(entities);
      const tierAOnly = getEntitiesAtMinTier(result, 'TIER_A');

      expect(tierAOnly.length).toBe(result.tierA.length);
    });

    it('returns TIER_A + TIER_B for balanced mode', () => {
      const entities = [
        createEntity('A', 'PERSON', 0.9),
        createEntity('B', 'PERSON', 0.6),
        createEntity('C', 'PERSON', 0.35),
      ];

      const result = filterAndTierEntities(entities);
      const tierAB = getEntitiesAtMinTier(result, 'TIER_B');

      expect(tierAB.length).toBe(result.tierA.length + result.tierB.length);
    });

    it('returns all tiers for maximum recall', () => {
      const entities = [
        createEntity('A', 'PERSON', 0.9),
        createEntity('B', 'PERSON', 0.6),
        createEntity('C', 'PERSON', 0.35),
      ];

      const result = filterAndTierEntities(entities);
      const all = getEntitiesAtMinTier(result, 'TIER_C');

      expect(all.length).toBe(result.allAccepted.length);
    });
  });
});

describe('Tier Isolation Safety', () => {
  it('TIER_C entities do not contaminate TIER_A clusters', () => {
    // This test ensures that low-confidence provisional entities
    // cannot pollute high-confidence entity alias clusters

    const tierA = createEntity('Barty Beauregard', 'PERSON', 0.9);
    tierA.tier = 'TIER_A';

    const tierC = createEntity('Barty', 'PERSON', 0.35);
    tierC.tier = 'TIER_C';

    // TIER_C cannot merge with TIER_A
    const { canMerge } = canMergeByTier(tierC, tierA);
    expect(canMerge).toBe(false);
  });

  it('maintains separate entity counts for different tiers', () => {
    const entities = [
      { ...createEntity('Barty', 'PERSON', 0.9), tier: 'TIER_A' as EntityTier },
      { ...createEntity('Barty', 'PERSON', 0.35), tier: 'TIER_C' as EntityTier },
    ];

    // Even if canonicals match, TIER_C should remain separate
    const stats = getTierStats(entities);
    expect(stats.tierA).toBe(1);
    expect(stats.tierC).toBe(1);
  });
});

describe('Recall Improvement Verification', () => {
  it('accepts sentence-initial single tokens as TIER_C', () => {
    // Previously these would be rejected entirely
    // Now they should be accepted as TIER_C candidates

    const entity = createEntity('Kenny', 'PERSON', 0.45, {
      isSentenceInitial: true,
      occursNonInitial: false,
    });

    const result = filterAndTierEntities([entity]);

    // Should be accepted (not rejected)
    expect(result.allAccepted.length).toBe(1);
    // Should be TIER_C (low confidence, sentence-initial-only)
    expect(result.tierC.length).toBe(1);
  });

  it('promotes multi-token names even with low confidence', () => {
    const entity = createEntity('Kelly Prescott', 'PERSON', 0.35);

    const result = filterAndTierEntities([entity]);

    // Should be TIER_B (promoted due to multi-token)
    expect(result.tierB.length).toBe(1);
    expect(result.tierB[0].tier).toBe('TIER_B');
  });

  it('increases total entity count vs binary filtering', () => {
    const entities = [
      createEntity('Barty Beauregard', 'PERSON', 0.9),  // High confidence
      createEntity('Mr. Green', 'PERSON', 0.55),        // Medium confidence
      createEntity('Kenny', 'PERSON', 0.35),            // Low confidence
      createEntity('Morton', 'PERSON', 0.32),           // Very low confidence (not a role word)
    ];

    const result = filterAndTierEntities(entities);

    // All should be accepted (none are garbage)
    expect(result.allAccepted.length).toBe(4);
    // Distributed across tiers
    expect(result.stats.tierA).toBeGreaterThanOrEqual(1);
    expect(result.stats.accepted).toBe(4);
  });
});

describe('Quality-Based Demotions', () => {
  it('demotes entities with encoding issues to TIER_C', () => {
    const entity = createEntity('ifying\ufffd in', 'SPELL', 0.95);
    const features = extractTierFeatures(entity);
    const { tier, reason } = assignEntityTier(entity, features);

    expect(tier).toBe('TIER_C');
    expect(reason).toBe('encoding_issues');
  });

  it('demotes truncated artifacts to TIER_C', () => {
    const testCases = [
      { name: 'er cars', type: 'SPELL' as const },
      { name: 'e obeyed', type: 'MATERIAL' as const },
    ];

    for (const tc of testCases) {
      const entity = createEntity(tc.name, tc.type, 0.95);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('truncated_artifact');
    }
  });

  it('demotes sentence fragments to TIER_C', () => {
    const entity = createEntity('The pair sprang', 'PERSON', 0.98);
    const features = extractTierFeatures(entity);
    const { tier, reason } = assignEntityTier(entity, features);

    expect(tier).toBe('TIER_C');
    expect(reason).toBe('sentence_fragment');
  });

  it('demotes common words to TIER_C regardless of confidence', () => {
    const testCases = [
      { name: 'Darkness', type: 'PERSON' as const },
      { name: 'Black', type: 'MAGIC' as const },
      { name: 'Weak', type: 'SPELL' as const },
    ];

    for (const tc of testCases) {
      const entity = createEntity(tc.name, tc.type, 0.98);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('common_word');
    }
  });

  it('does NOT demote legitimate names that happen to contain common words', () => {
    // "Rose Potter" as a person name should be TIER_A
    const entity = createEntity('Rose Potter', 'PERSON', 0.85);
    const features = extractTierFeatures(entity);
    const { tier } = assignEntityTier(entity, features);

    expect(tier).toBe('TIER_A');
  });

  it('preserves TIER_C isolation after quality demotions', () => {
    const garbage = createEntity('ifying\ufffd in', 'SPELL', 0.95);
    const legitimate = createEntity('Barty Beauregard', 'PERSON', 0.90);

    const garbageFeatures = extractTierFeatures(garbage);
    const legitimateFeatures = extractTierFeatures(legitimate);

    const garbageResult = assignEntityTier(garbage, garbageFeatures);
    const legitimateResult = assignEntityTier(legitimate, legitimateFeatures);

    expect(garbageResult.tier).toBe('TIER_C');
    expect(legitimateResult.tier).toBe('TIER_A');

    // TIER_C cannot merge with TIER_A
    const mergeResult = canMergeByTier(
      { ...garbage, tier: garbageResult.tier },
      { ...legitimate, tier: legitimateResult.tier }
    );
    expect(mergeResult.canMerge).toBe(false);
    expect(mergeResult.reason).toBe('tier_c_isolated');
  });
});
