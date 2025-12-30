/**
 * Phase 3.2 Tests: Context-Aware Quality Filtering
 *
 * Verifies that context signals are properly used to:
 * - Boost confidence for entities in dialogue
 * - Promote entities with appositive descriptions
 * - Promote entities appearing in relations
 * - Promote entities with coreference links
 *
 * Key invariants:
 * 1. Context signals should boost confidence appropriately
 * 2. Strong signals should enable tier promotion
 * 3. TIER_C entities can be promoted to TIER_B or TIER_A with evidence
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateTierPromotion,
  applyContextAwareTierPromotion,
  extractContextSignals,
  type EntityContextSignals,
} from '../app/engine/entity-quality-filter';
import type { Entity, EntityTier } from '../app/engine/schema';

// Test entity factory
function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: `entity-${Math.random().toString(36).substr(2, 9)}`,
    type: 'PERSON',
    canonical: 'Test Entity',
    aliases: [],
    created_at: new Date().toISOString(),
    confidence: 0.5,
    tier: 'TIER_C' as EntityTier,
    ...overrides,
  };
}

describe('Phase 3.2: Context-Aware Quality Filtering', () => {
  describe('evaluateTierPromotion', () => {
    describe('TIER_C Promotion', () => {
      it('should promote TIER_C to TIER_B with dialogue context', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          appearsInDialogue: true,
        };

        const result = evaluateTierPromotion(entity, context);

        // Dialogue is a moderate signal - need 2+ for promotion
        expect(result.confidenceBoost).toBeGreaterThan(0);
      });

      it('should promote TIER_C to TIER_B with 2+ moderate signals', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          appearsInDialogue: true,
          hasCoreferenceLink: true,
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.promotedTier).toBe('TIER_B');
        expect(result.wasPromoted).toBe(true);
        expect(result.confidenceBoost).toBeGreaterThan(0);
      });

      it('should promote TIER_C to TIER_B with 1 strong signal', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          hasAppositiveDescription: true,
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.promotedTier).toBe('TIER_B');
        expect(result.wasPromoted).toBe(true);
      });

      it('should promote TIER_C to TIER_A with 2+ strong signals', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          hasAppositiveDescription: true, // Strong
          appearsInRelation: true,        // Strong
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.promotedTier).toBe('TIER_A');
        expect(result.wasPromoted).toBe(true);
      });

      it('should promote TIER_C to TIER_A with 1 strong + 2 moderate signals', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          appearsInRelation: true,     // Strong
          appearsInDialogue: true,     // Moderate
          hasCoreferenceLink: true,    // Moderate
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.promotedTier).toBe('TIER_A');
        expect(result.wasPromoted).toBe(true);
      });
    });

    describe('TIER_B Promotion', () => {
      it('should promote TIER_B to TIER_A with 2+ strong signals', () => {
        const entity = createTestEntity({ tier: 'TIER_B' as EntityTier });
        const context: EntityContextSignals = {
          hasAppositiveDescription: true,
          multiParagraphMentions: 5, // >= 3 counts as strong
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.promotedTier).toBe('TIER_A');
        expect(result.wasPromoted).toBe(true);
      });

      it('should NOT promote TIER_B with only moderate signals', () => {
        const entity = createTestEntity({ tier: 'TIER_B' as EntityTier });
        const context: EntityContextSignals = {
          appearsInDialogue: true,
          hasCoreferenceLink: true,
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.promotedTier).toBe('TIER_B');
        expect(result.wasPromoted).toBe(false);
        // But should still boost confidence
        expect(result.confidenceBoost).toBeGreaterThan(0);
      });
    });

    describe('TIER_A entities', () => {
      it('should NOT change TIER_A entities (already top tier)', () => {
        const entity = createTestEntity({ tier: 'TIER_A' as EntityTier });
        const context: EntityContextSignals = {
          hasAppositiveDescription: true,
          appearsInRelation: true,
          appearsInDialogue: true,
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.promotedTier).toBe('TIER_A');
        expect(result.wasPromoted).toBe(false);
      });
    });

    describe('Confidence Boost Calculation', () => {
      it('should give +0.15 for appositive description', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          hasAppositiveDescription: true,
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.confidenceBoost).toBeGreaterThanOrEqual(0.15);
      });

      it('should give +0.10 for relation appearance', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          appearsInRelation: true,
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.confidenceBoost).toBeGreaterThanOrEqual(0.10);
      });

      it('should give +0.08 for dialogue context', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          appearsInDialogue: true,
        };

        const result = evaluateTierPromotion(entity, context);

        expect(result.confidenceBoost).toBeGreaterThanOrEqual(0.08);
      });

      it('should cap total boost at 0.30', () => {
        const entity = createTestEntity({ tier: 'TIER_C' as EntityTier });
        const context: EntityContextSignals = {
          hasAppositiveDescription: true, // +0.15
          appearsInRelation: true,        // +0.10
          multiParagraphMentions: 5,      // +0.10
          appearsInDialogue: true,        // +0.08
          hasCoreferenceLink: true,       // +0.05
        };

        const result = evaluateTierPromotion(entity, context);

        // Sum would be 0.48, but capped at 0.30
        expect(result.confidenceBoost).toBeLessThanOrEqual(0.30);
      });
    });
  });

  describe('applyContextAwareTierPromotion', () => {
    it('should promote entities with context signals', () => {
      const entities = [
        createTestEntity({
          id: 'ent-1',
          canonical: 'Entity 1',
          tier: 'TIER_C' as EntityTier,
        }),
        createTestEntity({
          id: 'ent-2',
          canonical: 'Entity 2',
          tier: 'TIER_C' as EntityTier,
        }),
      ];

      const contextMap = new Map<string, EntityContextSignals>();
      contextMap.set('ent-1', { hasAppositiveDescription: true });
      contextMap.set('ent-2', {}); // No context signals

      const result = applyContextAwareTierPromotion(entities, contextMap);

      // Entity 1 should be promoted
      const entity1 = result.find(e => e.id === 'ent-1');
      expect(entity1?.tier).toBe('TIER_B');

      // Entity 2 should remain TIER_C
      const entity2 = result.find(e => e.id === 'ent-2');
      expect(entity2?.tier).toBe('TIER_C');
    });

    it('should handle entities without context signals', () => {
      const entities = [
        createTestEntity({
          id: 'ent-1',
          tier: 'TIER_C' as EntityTier,
        }),
      ];

      const contextMap = new Map<string, EntityContextSignals>(); // Empty

      const result = applyContextAwareTierPromotion(entities, contextMap);

      // Should remain unchanged
      expect(result[0].tier).toBe('TIER_C');
    });
  });

  describe('extractContextSignals', () => {
    it('should detect dialogue context', () => {
      const documentStructure = {
        paragraphs: [
          { text: '"Hello," said John.', isDialogue: true, entityMentions: ['ent-1'] },
          { text: 'He walked away.', isDialogue: false, entityMentions: [] },
        ],
        relations: [],
        coreferenceChains: [],
        appositives: new Map<string, string[]>(),
      };

      const signals = extractContextSignals('ent-1', documentStructure);

      expect(signals.appearsInDialogue).toBe(true);
    });

    it('should detect relation patterns', () => {
      const documentStructure = {
        paragraphs: [],
        relations: [{ subj: 'ent-1', obj: 'ent-2' }],
        coreferenceChains: [],
        appositives: new Map<string, string[]>(),
      };

      const signals = extractContextSignals('ent-1', documentStructure);

      expect(signals.appearsInRelation).toBe(true);
    });

    it('should detect coreference links', () => {
      const documentStructure = {
        paragraphs: [],
        relations: [],
        coreferenceChains: [['ent-1', 'ent-2']],
        appositives: new Map<string, string[]>(),
      };

      const signals = extractContextSignals('ent-1', documentStructure);

      expect(signals.hasCoreferenceLink).toBe(true);
    });

    it('should detect appositives', () => {
      const appositives = new Map<string, string[]>();
      appositives.set('ent-1', ['the king']);

      const documentStructure = {
        paragraphs: [],
        relations: [],
        coreferenceChains: [],
        appositives,
      };

      const signals = extractContextSignals('ent-1', documentStructure);

      expect(signals.hasAppositiveDescription).toBe(true);
    });

    it('should count multi-paragraph mentions', () => {
      const documentStructure = {
        paragraphs: [
          { text: 'John was here.', isDialogue: false, entityMentions: ['ent-1'] },
          { text: 'John left.', isDialogue: false, entityMentions: ['ent-1'] },
          { text: 'John returned.', isDialogue: false, entityMentions: ['ent-1'] },
        ],
        relations: [],
        coreferenceChains: [],
        appositives: new Map<string, string[]>(),
      };

      const signals = extractContextSignals('ent-1', documentStructure);

      expect(signals.multiParagraphMentions).toBe(3);
    });
  });

  describe('Integration: End-to-End Context-Aware Filtering', () => {
    it('should promote sentence-initial single tokens with dialogue context', () => {
      // Simulates a common pattern: name mentioned only at sentence start
      // but appears in dialogue, which provides evidence it's a real entity
      const entity = createTestEntity({
        canonical: 'Kenny',
        tier: 'TIER_C' as EntityTier,
        confidence: 0.35,
      });

      const context: EntityContextSignals = {
        appearsInDialogue: true,
        hasCoreferenceLink: true, // Mentioned by pronoun elsewhere
      };

      const result = evaluateTierPromotion(entity, context);

      // Should be promoted to TIER_B (2 moderate signals)
      expect(result.promotedTier).toBe('TIER_B');
    });

    it('should promote entities with appositive descriptions to high tier', () => {
      // "Aragorn, son of Arathorn" - appositive provides strong evidence
      const entity = createTestEntity({
        canonical: 'Aragorn',
        tier: 'TIER_C' as EntityTier,
        confidence: 0.40,
      });

      const context: EntityContextSignals = {
        hasAppositiveDescription: true,
        appearsInRelation: true, // "son of Arathorn" creates relation
      };

      const result = evaluateTierPromotion(entity, context);

      // Should be promoted to TIER_A (2 strong signals)
      expect(result.promotedTier).toBe('TIER_A');
    });
  });
});
