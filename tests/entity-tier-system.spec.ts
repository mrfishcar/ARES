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
    it('assigns TIER_A based on namehood evidence (not just confidence)', () => {
      // STRUCTURAL: multi-token (2) + mention (1) = 3 → TIER_A
      const entity = createEntity('Barty Beauregard', 'PERSON', 0.85);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
      // Reason reflects structural scoring, not raw confidence
      expect(reason).toMatch(/namehood_score|ner_backed/);
    });

    it('multi-token names reach TIER_A regardless of confidence', () => {
      // STRUCTURAL: multi-token (2) + mention (1) = 3 → TIER_A threshold
      // Confidence alone doesn't demote structural evidence
      const entity = createEntity('Barty Beauregard', 'PERSON', 0.55);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
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

    it('multi-token names reach TIER_A even with low confidence', () => {
      // STRUCTURAL: multi-token (2) + mention (1) = 3 → TIER_A
      // Multi-token IS strong namehood evidence
      const entity = createEntity('Roy Burkley', 'PERSON', 0.35);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
    });

    it('single-token titles without following names are ambiguous (TIER_C)', () => {
      // STRUCTURAL: "Doctor" alone is ambiguous - could be a title or literal word
      // Only "Doctor Smith" (title + name) gets promoted
      const entity = createEntity('Doctor', 'PERSON', 0.35);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('minimal_evidence');
    });

    it('title-prefixed multi-token names get TIER_A/B based on evidence', () => {
      // STRUCTURAL: "Mr. Green" has honorific + name → strong namehood evidence
      const entity = createEntity('Mr. Green', 'PERSON', 0.55);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      // Multi-token (2) + honorific (2) + mention (1) = 5 → TIER_A
      expect(['TIER_A', 'TIER_B']).toContain(tier);
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
        // Use sentence-initial single token - passes quality filter but TIER_C
        createEntity('Kenny', 'PERSON', 0.35, {
          isSentenceInitial: true,
          occursNonInitial: false,
        }),
      ];

      const result = filterAndTierEntities(entities);

      // STRUCTURAL: Both multi-token names get TIER_A:
      // - "Barty Beauregard": NER-backed → TIER_A
      // - "Mr. Green": multi-token (2) + honorific (2) + mention (1) = 5 → TIER_A
      expect(result.tierA.length).toBe(2);
      expect(result.tierA.some(e => e.canonical === 'Barty Beauregard')).toBe(true);
      expect(result.tierA.some(e => e.canonical === 'Mr. Green')).toBe(true);

      // Kenny (sentence-initial-only single token) → TIER_C
      expect(result.tierC.length).toBeGreaterThanOrEqual(1);

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

    // STRUCTURAL: multi-token (2) + mention (1) = 3 → TIER_A threshold
    // Multi-token names have strong namehood evidence regardless of confidence
    expect(result.allAccepted.length).toBe(1);
    expect(['TIER_A', 'TIER_B']).toContain(result.allAccepted[0].tier);
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

  it('single-token entities without namehood evidence get TIER_B (not A)', () => {
    // STRUCTURAL approach: These are ambiguous without context
    // They get TIER_B because single-token + high confidence, but NOT TIER_A
    // (no mid-sentence evidence, no recurrence, no NER backing)
    const testCases = [
      { name: 'Darkness', type: 'PERSON' as const },
      { name: 'Black', type: 'MAGIC' as const },    // Type-capped anyway
      { name: 'Weak', type: 'SPELL' as const },     // Type-capped anyway
    ];

    for (const tc of testCases) {
      const entity = createEntity(tc.name, tc.type, 0.98);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      // MAGIC and SPELL are type-capped to TIER_B
      // PERSON gets TIER_B for single_token_high_confidence
      expect(tier).toBe('TIER_B');
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

// =============================================================================
// NEW TIER BOUNDARY REGRESSION TESTS
// Tests structural namehood scoring approach (no blocklists)
// =============================================================================

describe('Tier Boundary Regression Tests', () => {
  describe('Type-Based TIER_B Caps', () => {
    it('EVENT types are capped at TIER_B even with high confidence', () => {
      // Multi-token EVENT with high confidence should be TIER_B (type-capped)
      const entity = createEntity('the Family Reunion', 'EVENT', 0.98);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_B');
    });

    it('SPELL types are capped at TIER_B', () => {
      const entity = createEntity('Expelliarmus Charm', 'SPELL', 0.95);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_B');
    });

    it('MATERIAL types are capped at TIER_B', () => {
      const entity = createEntity('Mithril Ore', 'MATERIAL', 0.95);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_B');
    });

    it('MAGIC types are capped at TIER_B', () => {
      const entity = createEntity('Arcane Power', 'MAGIC', 0.95);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_B');
    });

    it('PERSON and PLACE types can reach TIER_A with sufficient evidence', () => {
      // Multi-token names have structural evidence
      const person = createEntity('Barty Beauregard', 'PERSON', 0.98);
      const multiTokenPlace = createEntity('Mont Linola', 'PLACE', 0.98);

      const personFeatures = extractTierFeatures(person);
      const placeFeatures = extractTierFeatures(multiTokenPlace);

      const personResult = assignEntityTier(person, personFeatures);
      const placeResult = assignEntityTier(multiTokenPlace, placeFeatures);

      expect(personResult.tier).toBe('TIER_A');
      expect(placeResult.tier).toBe('TIER_A');
    });

    it('single-token PLACE with only confidence gets TIER_B', () => {
      // STRUCTURAL: "Lakefront" has high confidence but no structural evidence
      // Single-token names need additional evidence (NER, recurrence) for TIER_A
      const place = createEntity('Lakefront', 'PLACE', 0.98);
      const features = extractTierFeatures(place);
      const result = assignEntityTier(place, features);

      // High confidence single-token → TIER_B (not rejected, just conservative)
      expect(result.tier).toBe('TIER_B');
      expect(result.reason).toBe('single_token_high_confidence');
    });
  });

  describe('School Name Fragment Detection', () => {
    it('demotes school fragments typed as PERSON to TIER_C', () => {
      const testCases = [
        { name: 'Mont Linola Junior', type: 'PERSON' as const },
        { name: 'Oakdale High', type: 'PERSON' as const },
        { name: 'Central Middle', type: 'PERSON' as const },
        { name: 'Washington Elementary', type: 'PERSON' as const },
      ];

      for (const tc of testCases) {
        const entity = createEntity(tc.name, tc.type, 0.98);
        const features = extractTierFeatures(entity);
        const { tier, reason } = assignEntityTier(entity, features);

        expect(tier).toBe('TIER_C');
        expect(reason).toBe('school_fragment_mistyped');
      }
    });

    it('allows school names typed as ORG to reach higher tiers', () => {
      const entity = createEntity('Mont Linola Junior High', 'ORG', 0.98);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      // Multi-token ORG gets at least TIER_B, can reach TIER_A with high confidence
      expect(['TIER_A', 'TIER_B']).toContain(tier);
    });
  });

  describe('Namehood Evidence Scoring', () => {
    it('single-token sentence-initial-only gets TIER_C (minimal evidence)', () => {
      // No mid-sentence occurrence, no recurrence, no honorific
      const entity = createEntity('Watson', 'PERSON', 0.85, {
        isSentenceInitial: true,
        occursNonInitial: false,
      });

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('sentence_initial_single_token');
    });

    it('single-token with mid-sentence occurrence gets higher tier', () => {
      // Mid-sentence occurrence is strong namehood evidence
      const entity = createEntity('Watson', 'PERSON', 0.85, {
        isSentenceInitial: true,
        occursNonInitial: true,
      });

      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      // Should get TIER_A or TIER_B based on namehood score
      expect(['TIER_A', 'TIER_B']).toContain(tier);
    });

    it('multi-token names get at least TIER_B', () => {
      // Multi-token is structural evidence of namehood
      const entity = createEntity('Sheriff Wilson', 'PERSON', 0.55);
      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(['TIER_A', 'TIER_B']).toContain(tier);
    });

    it('honorific prefix requires following name for boost', () => {
      // "Doctor" alone doesn't get honorific boost - could be literal word
      const standaloneTitle = createEntity('Doctor', 'PERSON', 0.35);
      const standaloneFeatures = extractTierFeatures(standaloneTitle);
      const standaloneResult = assignEntityTier(standaloneTitle, standaloneFeatures);

      // Single token without evidence → TIER_C
      expect(standaloneResult.tier).toBe('TIER_C');

      // But "Doctor Smith" DOES get the honorific boost
      const withName = createEntity('Doctor Smith', 'PERSON', 0.35);
      const withNameFeatures = extractTierFeatures(withName);
      const withNameResult = assignEntityTier(withName, withNameFeatures);

      // Multi-token (2) + honorific (2) + mention (1) = 5 → TIER_A
      expect(withNameResult.tier).toBe('TIER_A');
    });
  });

  describe('NER-Backed Type Cap Interaction', () => {
    it('NER-backed EVENT goes to TIER_B (not TIER_A)', () => {
      const entity = createEntity('the Christmas Party', 'EVENT', 0.45, {
        nerLabel: 'EVENT',
      });

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_B');
      expect(reason).toBe('ner_backed_type_capped');
    });

    it('NER-backed PERSON goes to TIER_A', () => {
      const entity = createEntity('Barty', 'PERSON', 0.45, {
        nerLabel: 'PERSON',
      });

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
      expect(reason).toBe('ner_backed');
    });
  });

  describe('Structural Garbage Rejection', () => {
    it('rejects truncated artifacts', () => {
      const testCases = ['er cars', 'e obeyed', 'nd march'];

      for (const name of testCases) {
        const entity = createEntity(name, 'PERSON', 0.98);
        const features = extractTierFeatures(entity);
        const { tier, reason } = assignEntityTier(entity, features);

        expect(tier).toBe('TIER_C');
        expect(reason).toBe('truncated_artifact');
      }
    });

    it('rejects sentence fragments with verb morphology', () => {
      const entity = createEntity('The pair sprang', 'PERSON', 0.98);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('sentence_fragment');
    });

    it('rejects encoding artifacts', () => {
      const entity = createEntity('ifying� in', 'SPELL', 0.95);
      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('encoding_issues');
    });
  });
});
