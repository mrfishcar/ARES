/**
 * Phase 4 Tests: Learning System
 *
 * Verifies that the learning system:
 * - Extracts patterns from user corrections
 * - Stores patterns with appropriate confidence
 * - Matches patterns against new entities
 * - Applies patterns during extraction
 *
 * Key invariants:
 * 1. Patterns should be extracted from type corrections
 * 2. Similar patterns should merge and boost confidence
 * 3. Pattern application should be configurable
 * 4. Pattern stats should be tracked accurately
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractPatternFromCorrection,
  mergePatterns,
  updatePatternStats,
  matchPatternsForEntity,
  LearningEngine,
  createLearningEngine,
} from '../app/engine/learning-engine';
import {
  applyPatternsToEntity,
  applyPatternsToBatch,
  PatternApplier,
  createPatternApplier,
  DEFAULT_APPLIER_CONFIG,
} from '../app/engine/pattern-applier';
import type { Correction, LearnedPattern, Entity, EntityType } from '../app/engine/schema';

// ============================================================================
// TEST FACTORIES
// ============================================================================

function createTestCorrection(overrides: Partial<Correction> = {}): Correction {
  return {
    id: `corr-${Math.random().toString(36).substr(2, 9)}`,
    type: 'entity_type',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createTestPattern(overrides: Partial<LearnedPattern> = {}): LearnedPattern {
  return {
    id: `pattern-${Math.random().toString(36).substr(2, 9)}`,
    type: 'entity_type',
    pattern: 'Test Pattern',
    condition: {},
    action: {},
    stats: {
      timesApplied: 0,
      timesValidated: 0,
      timesRejected: 0,
    },
    sourceCorrections: [],
    active: true,
    confidence: 0.5,
    ...overrides,
  };
}

function createTestEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: `entity-${Math.random().toString(36).substr(2, 9)}`,
    type: 'PERSON',
    canonical: 'Test Entity',
    aliases: [],
    created_at: new Date().toISOString(),
    confidence: 0.5,
    ...overrides,
  };
}

// ============================================================================
// PHASE 4.1: PATTERN EXTRACTION
// ============================================================================

describe('Phase 4.1: Pattern Extraction', () => {
  describe('extractPatternFromCorrection', () => {
    it('should extract pattern from entity type correction', () => {
      const correction = createTestCorrection({
        type: 'entity_type',
        before: { entityType: 'MISC', canonical: 'Kingdom of Gondor' },
        after: { entityType: 'PLACE' },
      });

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern).not.toBeNull();
      expect(pattern?.type).toBe('entity_type');
      expect(pattern?.action.setType).toBe('PLACE');
    });

    it('should extract geographic pattern from "Kingdom of X"', () => {
      const correction = createTestCorrection({
        type: 'entity_type',
        before: { entityType: 'MISC', canonical: 'Kingdom of Rohan' },
        after: { entityType: 'PLACE' },
      });

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern?.pattern).toContain('kingdom');
      expect(pattern?.confidence).toBeGreaterThan(0.3); // Generalized patterns have higher confidence
    });

    it('should extract organization pattern from "X University"', () => {
      const correction = createTestCorrection({
        type: 'entity_type',
        before: { entityType: 'MISC', canonical: 'Harvard University' },
        after: { entityType: 'ORG' },
      });

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern?.action.setType).toBe('ORG');
      expect(pattern?.pattern).toContain('university');
    });

    it('should extract house pattern from "House X"', () => {
      const correction = createTestCorrection({
        type: 'entity_type',
        before: { entityType: 'MISC', canonical: 'House Stark' },
        after: { entityType: 'HOUSE' },
      });

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern?.action.setType).toBe('HOUSE');
      expect(pattern?.pattern).toContain('house');
    });

    it('should extract merge pattern from entity merge correction', () => {
      const correction = createTestCorrection({
        type: 'entity_merge',
        before: {
          entities: [
            { canonical: 'John', type: 'PERSON' },
            { canonical: 'John Smith', type: 'PERSON' },
          ],
        },
        after: { canonical: 'John Smith' },
      });

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern?.type).toBe('entity_name');
      expect(pattern?.action.merge).toBe(true);
    });

    it('should extract rejection pattern from entity reject correction', () => {
      const correction = createTestCorrection({
        type: 'entity_reject',
        before: { entity: { canonical: 'Garbage Text' } },
      });

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern?.action.reject).toBe(true);
    });

    it('should return null for same-type corrections', () => {
      const correction = createTestCorrection({
        type: 'entity_type',
        before: { entityType: 'PERSON', canonical: 'John' },
        after: { entityType: 'PERSON' }, // Same type
      });

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern).toBeNull();
    });
  });

  describe('mergePatterns', () => {
    it('should add new pattern when no similar exists', () => {
      const existing: LearnedPattern[] = [];
      const newPattern = createTestPattern({
        pattern: 'New Pattern',
        confidence: 0.5,
      });

      const result = mergePatterns(existing, newPattern);

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('New Pattern');
    });

    it('should boost confidence when similar pattern exists', () => {
      const existing = [
        createTestPattern({
          id: 'p1',
          pattern: 'Kingdom of *',
          type: 'entity_type',
          confidence: 0.5,
        }),
      ];
      const newPattern = createTestPattern({
        pattern: 'Kingdom of *',
        type: 'entity_type',
        confidence: 0.5,
      });

      const result = mergePatterns(existing, newPattern);

      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBeGreaterThan(0.5); // Boosted
    });

    it('should track source corrections when merging', () => {
      const existing = [
        createTestPattern({
          id: 'p1',
          pattern: 'Test',
          sourceCorrections: ['corr-1'],
        }),
      ];
      const newPattern = createTestPattern({
        pattern: 'Test',
        sourceCorrections: ['corr-2'],
      });

      const result = mergePatterns(existing, newPattern);

      expect(result[0].sourceCorrections).toContain('corr-1');
      expect(result[0].sourceCorrections).toContain('corr-2');
    });
  });

  describe('updatePatternStats', () => {
    it('should increment applied count', () => {
      const patterns = [
        createTestPattern({
          id: 'p1',
          stats: { timesApplied: 0, timesValidated: 0, timesRejected: 0 },
        }),
      ];

      const result = updatePatternStats(patterns, 'p1', 'applied');

      expect(result[0].stats.timesApplied).toBe(1);
      expect(result[0].stats.lastApplied).toBeDefined();
    });

    it('should increment validated count', () => {
      const patterns = [
        createTestPattern({
          id: 'p1',
          stats: { timesApplied: 0, timesValidated: 5, timesRejected: 0 },
        }),
      ];

      const result = updatePatternStats(patterns, 'p1', 'validated');

      expect(result[0].stats.timesValidated).toBe(6);
    });

    it('should increment rejected count and update confidence', () => {
      const patterns = [
        createTestPattern({
          id: 'p1',
          confidence: 0.8,
          stats: { timesApplied: 10, timesValidated: 3, timesRejected: 1 },
        }),
      ];

      const result = updatePatternStats(patterns, 'p1', 'rejected');

      expect(result[0].stats.timesRejected).toBe(2);
      // After rejection: timesValidated=3, timesRejected=2, total=5
      // confidence = 3/5 = 0.6, which is less than 0.8
      expect(result[0].confidence).toBeLessThan(0.8);
    });

    it('should deactivate patterns with very low confidence', () => {
      const patterns = [
        createTestPattern({
          id: 'p1',
          confidence: 0.3,
          active: true,
          stats: { timesApplied: 10, timesValidated: 1, timesRejected: 10 },
        }),
      ];

      const result = updatePatternStats(patterns, 'p1', 'rejected');

      expect(result[0].active).toBe(false);
    });
  });

  describe('matchPatternsForEntity', () => {
    it('should match entity against text patterns', () => {
      const patterns = [
        createTestPattern({
          type: 'entity_type',
          pattern: 'Kingdom of *',
          condition: { textPattern: 'Kingdom of *' },
          action: { setType: 'PLACE' as EntityType },
          active: true,
        }),
      ];

      const matches = matchPatternsForEntity('Kingdom of Gondor', 'MISC', patterns);

      expect(matches).toHaveLength(1);
      expect(matches[0].pattern.action.setType).toBe('PLACE');
    });

    it('should match wildcard patterns correctly', () => {
      const patterns = [
        createTestPattern({
          pattern: '* River',
          condition: { textPattern: '* River' },
          active: true,
        }),
      ];

      const matches = matchPatternsForEntity('Black River', 'MISC', patterns);
      expect(matches).toHaveLength(1);

      const noMatch = matchPatternsForEntity('River Black', 'MISC', patterns);
      expect(noMatch).toHaveLength(0);
    });

    it('should skip inactive patterns', () => {
      const patterns = [
        createTestPattern({
          pattern: 'Test',
          condition: { textPattern: 'Test' },
          active: false, // Inactive
        }),
      ];

      const matches = matchPatternsForEntity('Test', 'PERSON', patterns);

      expect(matches).toHaveLength(0);
    });

    it('should sort matches by confidence', () => {
      const patterns = [
        createTestPattern({
          id: 'p1',
          pattern: 'Test',
          condition: { textPattern: 'Test' },
          confidence: 0.3,
          active: true,
        }),
        createTestPattern({
          id: 'p2',
          pattern: 'Test',
          condition: { textPattern: 'Test' },
          confidence: 0.8,
          active: true,
        }),
      ];

      const matches = matchPatternsForEntity('Test', 'PERSON', patterns);

      expect(matches[0].pattern.id).toBe('p2'); // Higher confidence first
    });
  });
});

// ============================================================================
// PHASE 4.2: PATTERN APPLICATION
// ============================================================================

describe('Phase 4.2: Pattern Application', () => {
  describe('applyPatternsToEntity', () => {
    it('should apply type correction pattern', () => {
      const entity = createTestEntity({
        canonical: 'Kingdom of Gondor',
        type: 'MISC',
      });
      const patterns = [
        createTestPattern({
          type: 'entity_type',
          pattern: 'Kingdom of *',
          condition: { textPattern: 'Kingdom of *' },
          action: { setType: 'PLACE' as EntityType },
          confidence: 0.8,
          active: true,
        }),
      ];

      const result = applyPatternsToEntity(entity, patterns);

      expect(result.changed).toBe(true);
      expect(result.modified.type).toBe('PLACE');
      expect(result.appliedPatterns).toHaveLength(1);
    });

    it('should reject entity based on rejection pattern', () => {
      const entity = createTestEntity({
        canonical: 'Garbage Text',
        type: 'PERSON',
      });
      const patterns = [
        createTestPattern({
          pattern: 'Garbage Text',
          condition: { textPattern: 'Garbage Text' },
          action: { reject: true },
          confidence: 0.7,
          active: true,
        }),
      ];

      const result = applyPatternsToEntity(entity, patterns);

      expect(result.rejected).toBe(true);
      expect(result.rejectionReason).toContain('Garbage Text');
    });

    it('should respect minimum confidence threshold', () => {
      const entity = createTestEntity({
        canonical: 'Test Entity',
        type: 'MISC',
      });
      const patterns = [
        createTestPattern({
          pattern: 'Test Entity',
          condition: { textPattern: 'Test Entity' },
          action: { setType: 'PERSON' as EntityType },
          confidence: 0.3, // Below default threshold
          active: true,
        }),
      ];

      const result = applyPatternsToEntity(entity, patterns);

      expect(result.changed).toBe(false);
    });

    it('should track applied patterns in entity attrs', () => {
      const entity = createTestEntity({
        canonical: 'Kingdom of Test',
        type: 'MISC',
      });
      const patterns = [
        createTestPattern({
          id: 'p1',
          pattern: 'Kingdom of *',
          condition: { textPattern: 'Kingdom of *' },
          action: { setType: 'PLACE' as EntityType },
          confidence: 0.8,
          active: true,
        }),
      ];

      const result = applyPatternsToEntity(entity, patterns);

      expect(result.modified.attrs?.appliedPatterns).toContain('p1');
    });
  });

  describe('applyPatternsToBatch', () => {
    it('should process multiple entities', () => {
      const entities = [
        createTestEntity({ canonical: 'Kingdom of A', type: 'MISC' }),
        createTestEntity({ canonical: 'Kingdom of B', type: 'MISC' }),
        createTestEntity({ canonical: 'John Smith', type: 'PERSON' }),
      ];
      const patterns = [
        createTestPattern({
          pattern: 'Kingdom of *',
          condition: { textPattern: 'Kingdom of *' },
          action: { setType: 'PLACE' as EntityType },
          confidence: 0.8,
          active: true,
        }),
      ];

      const result = applyPatternsToBatch(entities, patterns);

      expect(result.stats.total).toBe(3);
      expect(result.stats.modified).toBe(2); // Two kingdoms modified
    });

    it('should separate rejected entities', () => {
      const entities = [
        createTestEntity({ canonical: 'Valid Entity', type: 'PERSON' }),
        createTestEntity({ canonical: 'Garbage Text', type: 'PERSON' }),
      ];
      const patterns = [
        createTestPattern({
          pattern: 'Garbage Text',
          condition: { textPattern: 'Garbage Text' },
          action: { reject: true },
          confidence: 0.8,
          active: true,
        }),
      ];

      const result = applyPatternsToBatch(entities, patterns);

      expect(result.entities).toHaveLength(1);
      expect(result.rejected).toHaveLength(1);
      expect(result.stats.rejected).toBe(1);
    });
  });

  describe('PatternApplier class', () => {
    let applier: PatternApplier;

    beforeEach(() => {
      applier = createPatternApplier();
    });

    it('should apply patterns and log applications', () => {
      const patterns = [
        createTestPattern({
          id: 'p1',
          pattern: 'Test Entity',
          condition: { textPattern: 'Test Entity' },
          action: { setType: 'ORG' as EntityType },
          confidence: 0.8,
          active: true,
        }),
      ];
      applier.setPatterns(patterns);

      const entity = createTestEntity({ canonical: 'Test Entity', type: 'MISC' });
      const result = applier.apply(entity);

      expect(result.changed).toBe(true);
      expect(applier.getApplicationLog()).toHaveLength(1);
    });

    it('should provide application statistics', () => {
      const patterns = [
        createTestPattern({
          id: 'p1',
          pattern: 'Test',
          condition: { textPattern: 'Test' },
          action: { setType: 'ORG' as EntityType },
          confidence: 0.8,
          active: true,
        }),
      ];
      applier.setPatterns(patterns);

      // Apply to multiple entities
      applier.apply(createTestEntity({ canonical: 'Test', type: 'MISC' }));
      applier.apply(createTestEntity({ canonical: 'Test', type: 'MISC' }));

      const stats = applier.getStats();

      expect(stats.totalApplications).toBe(2);
      expect(stats.byPattern['p1']).toBe(2);
    });

    it('should clear application log', () => {
      const patterns = [
        createTestPattern({
          pattern: 'Test',
          condition: { textPattern: 'Test' },
          action: { setType: 'ORG' as EntityType },
          confidence: 0.8,
          active: true,
        }),
      ];
      applier.setPatterns(patterns);

      applier.apply(createTestEntity({ canonical: 'Test', type: 'MISC' }));
      applier.clearLog();

      expect(applier.getApplicationLog()).toHaveLength(0);
    });
  });
});

// ============================================================================
// LEARNING ENGINE
// ============================================================================

describe('LearningEngine', () => {
  let engine: LearningEngine;

  beforeEach(() => {
    engine = createLearningEngine();
  });

  it('should learn from corrections', () => {
    const correction = createTestCorrection({
      type: 'entity_type',
      before: { entityType: 'MISC', canonical: 'Kingdom of Test' },
      after: { entityType: 'PLACE' },
    });

    const pattern = engine.learnFromCorrection(correction);

    expect(pattern).not.toBeNull();
    expect(engine.getPatterns()).toHaveLength(1);
  });

  it('should match patterns for entities', () => {
    // Learn a pattern
    engine.learnFromCorrection(createTestCorrection({
      type: 'entity_type',
      before: { entityType: 'MISC', canonical: 'Kingdom of Test' },
      after: { entityType: 'PLACE' },
    }));

    const matches = engine.matchForEntity('Kingdom of Gondor', 'MISC');

    expect(matches.length).toBeGreaterThan(0);
  });

  it('should track pattern application', () => {
    engine.learnFromCorrection(createTestCorrection({
      type: 'entity_type',
      before: { entityType: 'MISC', canonical: 'Test' },
      after: { entityType: 'PLACE' },
    }));

    const patternId = engine.getPatterns()[0].id;
    engine.recordApplication(patternId, 'applied');

    expect(engine.getPatterns()[0].stats.timesApplied).toBe(1);
  });

  it('should enable/disable patterns', () => {
    engine.learnFromCorrection(createTestCorrection({
      type: 'entity_type',
      before: { entityType: 'MISC', canonical: 'Test' },
      after: { entityType: 'PLACE' },
    }));

    const patternId = engine.getPatterns()[0].id;
    engine.setPatternActive(patternId, false);

    expect(engine.getActivePatterns()).toHaveLength(0);
  });

  it('should provide statistics', () => {
    engine.learnFromCorrection(createTestCorrection({
      type: 'entity_type',
      before: { entityType: 'MISC', canonical: 'Test' },
      after: { entityType: 'PLACE' },
    }));

    const stats = engine.getStats();

    expect(stats.total).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.byType['entity_type']).toBe(1);
  });
});
