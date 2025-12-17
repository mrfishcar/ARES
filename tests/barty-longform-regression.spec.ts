/**
 * Barty Long-Form Regression Tests
 *
 * Tests for edge cases commonly found in long-form narratives like the Barty manuscript:
 * - Sentence-initial single-token names
 * - Dialogue-only names
 * - Title entities ("the librarian")
 * - Encoding issues and truncated artifacts
 * - Common word misclassifications
 *
 * These tests do NOT require the spaCy parser - they test tier assignment logic directly.
 */

import { describe, it, expect } from 'vitest';
import {
  assignEntityTier,
  extractTierFeatures,
  assignTiersToEntities,
  canMergeByTier,
  filterByTier,
  getTierStats,
} from '../app/engine/entity-tier-assignment';
import {
  filterAndTierEntities,
  getEntitiesAtMinTier,
} from '../app/engine/entity-quality-filter';
import { extractTitleBasedEntities } from '../app/engine/linguistics/title-based-entities';
import type { Entity, EntityTier } from '../app/engine/schema';

// Helper to create test entities simulating extraction output
function createEntity(
  canonical: string,
  type: Entity['type'],
  confidence: number = 0.98,
  attrs: Record<string, unknown> = {}
): Entity {
  return {
    id: `test-${canonical.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    type,
    canonical,
    aliases: [canonical],
    confidence,
    attrs: attrs as Record<string, string | number | boolean>,
    created_at: new Date().toISOString(),
  };
}

describe('Barty Long-Form Regression Tests', () => {
  describe('Sentence-Initial Single-Token Names', () => {
    it('demotes sentence-initial-only names to TIER_C', () => {
      // Names like "Kenny" that only appear at sentence starts
      // should be TIER_C (provisional, isolated)
      const entity = createEntity('Kenny', 'PERSON', 0.85, {
        isSentenceInitial: true,
        occursNonInitial: false,
      });

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('sentence_initial_single_token');
    });

    it('keeps sentence-initial names that also occur non-initially in TIER_A', () => {
      // "Barty" appears sentence-initial but also mid-sentence
      const entity = createEntity('Barty', 'PERSON', 0.98, {
        isSentenceInitial: true,
        occursNonInitial: true,
      });

      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
    });

    it('NER-backed sentence-initial names stay in TIER_A', () => {
      // If spaCy tagged it as PERSON, trust it
      // Use lower confidence so NER promotion is needed
      const entity = createEntity('Fredericks', 'PERSON', 0.45, {
        isSentenceInitial: true,
        occursNonInitial: false,
        nerLabel: 'PERSON',
      });

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
      expect(reason).toBe('ner_backed');
    });
  });

  describe('Dialogue-Only Names', () => {
    it('treats dialogue names with low confidence as TIER_C', () => {
      // Names mentioned only in dialogue without NER support
      const entity = createEntity('Charlie', 'PERSON', 0.45, {
        source: 'coreference',
      });

      const result = filterAndTierEntities([entity]);

      // Should be accepted but as TIER_C (low confidence single token)
      expect(result.allAccepted.length).toBe(1);
      expect(result.tierC.length).toBe(1);
    });

    it('promotes dialogue names with multiple mentions to TIER_A', () => {
      // STRUCTURAL: 5 mentions → capped at 3 points → TIER_A threshold
      // Multiple mentions IS strong namehood evidence
      const entity = createEntity('Morty', 'PERSON', 0.45, {
        mentionCount: 5,
      });

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      // 3+ mentions reaches TIER_A threshold
      expect(tier).toBe('TIER_A');
      expect(reason).toBe('namehood_score_3');
    });
  });

  describe('Title-Based Entities', () => {
    it('extracts title entities from text with role words', () => {
      // Use patterns where role word is followed by punctuation or capitalized word
      // The regex captures up to 2 words, so "The Sheriff." works but "The sheriff arrived" doesn't
      const text = 'The Sheriff. The Mayor! The Stranger?';
      const entities = extractTitleBasedEntities(text);

      // Should extract title entities
      expect(entities.length).toBeGreaterThanOrEqual(1);

      // Each extracted entity should be PERSON type with TIER_C
      entities.forEach(e => {
        expect(e.type).toBe('PERSON');
        expect(e.tier).toBe('TIER_C');
      });
    });

    it('extracts place-based title entities', () => {
      // Test PLACE type extractions
      const text = 'They went to The City. Then to The Village. Finally The Castle.';
      const entities = extractTitleBasedEntities(text);

      // Should extract at least one PLACE entity
      const places = entities.filter(e => e.type === 'PLACE');
      expect(places.length).toBeGreaterThanOrEqual(1);
    });

    it('assigns title entities to TIER_C for isolation', () => {
      // Title entities are created with tier=TIER_C directly
      const text = 'The Sheriff. He told them the rules.';
      const entities = extractTitleBasedEntities(text);

      // Each entity should already have tier=TIER_C
      entities.forEach(e => {
        expect(e.tier).toBe('TIER_C');
        expect(e.confidence).toBeLessThan(0.50);
      });
    });

    it('promotes title-prefixed proper names to TIER_B', () => {
      // "Mr. Green" should be TIER_B or TIER_A
      const entity = createEntity('Mr. Green', 'PERSON', 0.55);

      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      // Multi-token (Mr. Green) so promoted to TIER_B minimum
      expect(['TIER_A', 'TIER_B']).toContain(tier);
    });
  });

  describe('Encoding Issues and Artifacts', () => {
    it('demotes entities with unicode replacement characters', () => {
      const entity = createEntity('ifying\ufffd in', 'SPELL', 0.95);

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_C');
      expect(reason).toBe('encoding_issues');
    });

    it('demotes truncated word artifacts', () => {
      const testCases = [
        { name: 'er cars', expected: 'truncated_artifact' },
        { name: 'e obeyed', expected: 'truncated_artifact' },
        { name: 'nd march', expected: 'truncated_artifact' },
      ];

      for (const tc of testCases) {
        const entity = createEntity(tc.name, 'MATERIAL', 0.95);
        const features = extractTierFeatures(entity);
        const { tier, reason } = assignEntityTier(entity, features);

        expect(tier).toBe('TIER_C');
        expect(reason).toBe(tc.expected);
      }
    });

    it('demotes sentence fragments', () => {
      const testCases = [
        'The pair sprang',
        'The family gathered',
      ];

      for (const name of testCases) {
        const entity = createEntity(name, 'PERSON', 0.98);
        const features = extractTierFeatures(entity);
        const { tier, reason } = assignEntityTier(entity, features);

        expect(tier).toBe('TIER_C');
        expect(reason).toBe('sentence_fragment');
      }
    });
  });

  describe('Single-Token Names Without Evidence', () => {
    // STRUCTURAL approach: no blocklists, tier based on evidence
    // Single-token high-confidence names get TIER_B (supporting, not graph-worthy)
    // TIER_C is for truly ambiguous cases (sentence-initial-only, encoding issues)

    it('single-token PERSON with only confidence gets TIER_B', () => {
      const testCases = [
        { name: 'Darkness', type: 'PERSON' as const },
        { name: 'Silence', type: 'PERSON' as const },
        { name: 'Fear', type: 'PERSON' as const },
      ];

      for (const tc of testCases) {
        const entity = createEntity(tc.name, tc.type, 0.98);
        const features = extractTierFeatures(entity);
        const { tier, reason } = assignEntityTier(entity, features);

        // STRUCTURAL: No evidence beyond confidence → TIER_B
        expect(tier).toBe('TIER_B');
        expect(reason).toBe('single_token_high_confidence');
      }
    });

    it('single-token MAGIC is type-capped to TIER_B', () => {
      const entity = createEntity('Black', 'MAGIC', 0.95);

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      // MAGIC type is capped at TIER_B, confidence fallback applies
      expect(tier).toBe('TIER_B');
      expect(reason).toBe('confidence_type_capped');
    });

    it('single-token SPELL is type-capped to TIER_B', () => {
      const entity = createEntity('Weak', 'SPELL', 0.95);

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      // SPELL type is capped at TIER_B, confidence fallback applies
      expect(tier).toBe('TIER_B');
      expect(reason).toBe('confidence_type_capped');
    });

    it('multi-token names reach TIER_A even with common word component', () => {
      // "Sirius Black" - multi-token overrides any common word concern
      const entity = createEntity('Sirius Black', 'PERSON', 0.85);

      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
    });
  });

  describe('Multi-Token Proper Names', () => {
    it('multi-token names reach TIER_A regardless of confidence', () => {
      // STRUCTURAL: multi-token (2) + mention (1) = 3 → TIER_A threshold
      const entity = createEntity('Roy Burkley', 'PERSON', 0.35);

      const features = extractTierFeatures(entity);
      const { tier, reason } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
      expect(reason).toBe('namehood_score_3');
    });

    it('keeps high-confidence multi-token names in TIER_A', () => {
      const entity = createEntity('Barty Beauregard', 'PERSON', 0.98);

      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
    });

    it('handles three-part names correctly', () => {
      const entity = createEntity('Fabulous Fraud Cory Allen', 'PERSON', 0.85);

      const features = extractTierFeatures(entity);
      const { tier } = assignEntityTier(entity, features);

      expect(tier).toBe('TIER_A');
    });
  });

  describe('Cross-Type Safety', () => {
    it('maintains type separation in tier assignment', () => {
      // Same canonical but different types should both be accepted
      const place = createEntity('Mont Linola', 'PLACE', 0.75);
      const org = createEntity('Mont Linola Junior High', 'ORG', 0.85);

      const result = filterAndTierEntities([place, org]);

      expect(result.allAccepted.length).toBe(2);
      expect(result.allAccepted.some(e => e.type === 'PLACE')).toBe(true);
      expect(result.allAccepted.some(e => e.type === 'ORG')).toBe(true);
    });

    it('does not merge TIER_C garbage with legitimate TIER_A entities', () => {
      const garbage = createEntity('ifying\ufffd in', 'SPELL', 0.95);
      const legitimate = createEntity('Barty Beauregard', 'PERSON', 0.98);

      // Assign tiers
      garbage.tier = assignEntityTier(garbage, extractTierFeatures(garbage)).tier;
      legitimate.tier = assignEntityTier(legitimate, extractTierFeatures(legitimate)).tier;

      // Verify tiers
      expect(garbage.tier).toBe('TIER_C');
      expect(legitimate.tier).toBe('TIER_A');

      // Verify merge prevention
      const { canMerge, reason } = canMergeByTier(garbage, legitimate);
      expect(canMerge).toBe(false);
      expect(reason).toBe('tier_c_isolated');
    });
  });

  describe('Tier Distribution Verification', () => {
    it('correctly categorizes a realistic mix of Barty entities', () => {
      const entities = [
        // TIER_A: Multi-token names with namehood evidence
        createEntity('Barty Beauregard', 'PERSON', 0.98),
        createEntity('Mr. Green', 'PERSON', 0.98),
        createEntity('Roy Burkley', 'PERSON', 0.98),
        createEntity('Adaline Garbotholow', 'PERSON', 0.98),
        createEntity('Mont Linola Junior High', 'ORG', 0.85),

        // TIER_B: Single-token high confidence, or type-capped
        // (Darkness, Black - no longer blocklist-rejected)

        // TIER_C: Structural garbage only
        createEntity('ifying\ufffd in', 'SPELL', 0.95), // encoding issues
        createEntity('er cars', 'SPELL', 0.95),         // truncated
        createEntity('The pair sprang', 'PERSON', 0.98), // sentence fragment
      ];

      const tiered = assignTiersToEntities(entities);
      const stats = getTierStats(tiered);

      // STRUCTURAL: Multi-token names → TIER_A, structural garbage → TIER_C
      expect(stats.tierA).toBeGreaterThanOrEqual(5);
      expect(stats.tierC).toBeGreaterThanOrEqual(3);

      // Verify specific entities
      const barty = tiered.find(e => e.canonical === 'Barty Beauregard');
      expect(barty?.tier).toBe('TIER_A');

      const garbage = tiered.find(e => e.canonical === 'ifying\ufffd in');
      expect(garbage?.tier).toBe('TIER_C');
    });

    it('provides correct graphWorthy count', () => {
      const entities = [
        createEntity('Barty Beauregard', 'PERSON', 0.98),
        // Use sentence-initial single token for TIER_C candidate
        createEntity('Kenny', 'PERSON', 0.35, {
          isSentenceInitial: true,
          occursNonInitial: false,
        }),
        // Single-token high confidence → TIER_B
        createEntity('Darkness', 'PERSON', 0.98),
      ];

      const result = filterAndTierEntities(entities);
      const graphWorthy = getEntitiesAtMinTier(result, 'TIER_A');

      // Only Barty Beauregard has structural namehood evidence for TIER_A
      expect(graphWorthy.length).toBe(1);
      expect(graphWorthy[0].canonical).toBe('Barty Beauregard');
    });
  });

  describe('Recall Improvement Cases', () => {
    it('accepts previously-rejected sentence-initial names as TIER_C candidates', () => {
      // Previously: Kenny at sentence start would be rejected
      // Now: accepted as TIER_C candidate for potential later promotion
      const entity = createEntity('Kenny', 'PERSON', 0.45, {
        isSentenceInitial: true,
        occursNonInitial: false,
      });

      const result = filterAndTierEntities([entity]);

      expect(result.allAccepted.length).toBe(1);
      expect(result.tierC.length).toBe(1);
    });

    it('accepts title-based entities for recall', () => {
      // Use patterns where role word is followed by punctuation
      const text = 'The Sheriff. The Mayor. The Doctor.';
      const entities = extractTitleBasedEntities(text);

      // Should extract at least 2 title entities
      expect(entities.length).toBeGreaterThanOrEqual(2);

      // All should have low confidence (TIER_C worthy)
      expect(entities.every(e => (e.confidence ?? 0) < 0.50)).toBe(true);
    });

    it('maintains precision by isolating low-confidence entities', () => {
      const highConf = createEntity('Barty Beauregard', 'PERSON', 0.98);
      // Use "Morton" instead of "Stranger" (which is in COMMON_WORD_BLOCKLIST)
      const lowConf = createEntity('Morton', 'PERSON', 0.35);

      const result = filterAndTierEntities([highConf, lowConf]);

      // Both accepted
      expect(result.allAccepted.length).toBe(2);

      // But separated by tier
      expect(result.tierA.length).toBe(1);
      expect(result.tierC.length).toBe(1);

      // Low confidence cannot merge with high confidence
      const { canMerge } = canMergeByTier(result.tierC[0], result.tierA[0]);
      expect(canMerge).toBe(false);
    });
  });
});
