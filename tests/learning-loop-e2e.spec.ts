/**
 * Learning Loop End-to-End Test
 *
 * PROOF OF LIFE: This test demonstrates the complete learning loop:
 *
 * 1. User makes a correction (e.g., "Kingdom of Gondor" → PLACE instead of PERSON)
 * 2. Learning engine extracts a pattern ("Kingdom of *" → PLACE)
 * 3. Pattern is stored in the knowledge graph
 * 4. On next extraction, the pattern is applied to similar entities
 *
 * This is a deterministic, reproducible test that proves the learning system works.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Learning engine imports
import {
  extractPatternFromCorrection,
  mergePatterns,
  matchPatternsForEntity,
  type LearnedPattern,
} from '../app/engine/learning-engine';

// Pattern applier imports
import {
  applyPatternsToEntity,
  applyPatternsToBatch,
} from '../app/engine/pattern-applier';

// Schema types
import type { Entity, Correction, EntityType } from '../app/engine/schema';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestEntity(canonical: string, type: EntityType): Entity {
  return {
    id: `test-${canonical.toLowerCase().replace(/\s+/g, '-')}`,
    type,
    canonical,
    aliases: [],
    created_at: new Date().toISOString(),
    confidence: 0.8,
    tier: 'TIER_B',
  };
}

function createTypeCorrection(
  entityName: string,
  beforeType: EntityType,
  afterType: EntityType,
  reason?: string
): Correction {
  return {
    id: `correction-${Date.now()}`,
    type: 'entity_type',
    timestamp: new Date().toISOString(),
    entityId: `entity-${entityName.toLowerCase().replace(/\s+/g, '-')}`,
    before: {
      entityType: beforeType,
      canonical: entityName,
    },
    after: {
      entityType: afterType,
    },
    reason: reason || `Changed "${entityName}" from ${beforeType} to ${afterType}`,
    learned: {
      patternExtracted: false,
      appliedToCount: 0,
    },
    rolledBack: false,
  };
}

// ============================================================================
// DETERMINISTIC LEARNING LOOP TESTS
// ============================================================================

describe('Learning Loop End-to-End', () => {
  describe('Step 1: Pattern Extraction from Corrections', () => {
    it('should extract "Kingdom of *" → PLACE pattern from correction', () => {
      // User corrects "Kingdom of Gondor" from PERSON to PLACE
      const correction = createTypeCorrection(
        'Kingdom of Gondor',
        'PERSON',
        'PLACE',
        'Kingdoms are places, not people'
      );

      // Learning engine extracts pattern
      const pattern = extractPatternFromCorrection(correction);

      // Verify pattern was extracted
      expect(pattern).not.toBeNull();
      expect(pattern!.type).toBe('entity_type');
      expect(pattern!.condition?.textPattern).toBe('kingdom of *');
      expect(pattern!.action?.setType).toBe('PLACE');
      expect(pattern!.active).toBe(true);
    });

    it('should extract "* River" → PLACE pattern from correction', () => {
      const correction = createTypeCorrection(
        'Anduin River',
        'PERSON',
        'PLACE',
        'Rivers are geographical features'
      );

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern).not.toBeNull();
      expect(pattern!.condition?.textPattern).toBe('* river');
      expect(pattern!.action?.setType).toBe('PLACE');
    });

    it('should extract pattern from PLACE correction (e.g., Mountains)', () => {
      const correction = createTypeCorrection(
        'Misty Mountains',
        'PERSON',
        'PLACE'
      );

      const pattern = extractPatternFromCorrection(correction);

      expect(pattern).not.toBeNull();
      // Pattern may be the exact name if no generalizable pattern found
      expect(pattern!.action?.setType).toBe('PLACE');
      expect(pattern!.type).toBe('entity_type');
    });
  });

  describe('Step 2: Pattern Storage and Merging', () => {
    it('should merge duplicate patterns when they have same text pattern', () => {
      // First correction: Kingdom of Gondor
      const correction1 = createTypeCorrection('Kingdom of Gondor', 'PERSON', 'PLACE');
      const pattern1 = extractPatternFromCorrection(correction1)!;

      // Second correction: Kingdom of Rohan
      const correction2 = createTypeCorrection('Kingdom of Rohan', 'PERSON', 'PLACE');
      const pattern2 = extractPatternFromCorrection(correction2)!;

      // Both should have same text pattern "kingdom of *"
      expect(pattern1.condition?.textPattern).toBe('kingdom of *');
      expect(pattern2.condition?.textPattern).toBe('kingdom of *');

      // Merge patterns
      let patterns: LearnedPattern[] = [pattern1];
      patterns = mergePatterns(patterns, pattern2);

      // Should still be 1 pattern (merged because same textPattern)
      expect(patterns.length).toBe(1);
      expect(patterns[0].condition?.textPattern).toBe('kingdom of *');
    });
  });

  describe('Step 3: Pattern Matching for New Entities', () => {
    it('should match "Kingdom of *" pattern to new entity', () => {
      // Create pattern
      const correction = createTypeCorrection('Kingdom of Gondor', 'PERSON', 'PLACE');
      const pattern = extractPatternFromCorrection(correction)!;
      const patterns = [pattern];

      // Test matching against new entity
      const matches = matchPatternsForEntity('Kingdom of Arnor', 'PERSON', patterns);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.action?.setType).toBe('PLACE');
    });

    it('should NOT match pattern to unrelated entity', () => {
      const correction = createTypeCorrection('Kingdom of Gondor', 'PERSON', 'PLACE');
      const pattern = extractPatternFromCorrection(correction)!;
      const patterns = [pattern];

      // "Aragorn" should NOT match "Kingdom of *" pattern
      const matches = matchPatternsForEntity('Aragorn', 'PERSON', patterns);

      expect(matches.length).toBe(0);
    });
  });

  describe('Step 4: Pattern Application to Entities', () => {
    it('should apply pattern and change entity type', () => {
      // Create pattern from correction
      const correction = createTypeCorrection('Kingdom of Gondor', 'PERSON', 'PLACE');
      const pattern = extractPatternFromCorrection(correction)!;
      const patterns = [pattern];

      // Create new entity that should match
      const entity = createTestEntity('Kingdom of Mordor', 'PERSON');

      // Apply patterns
      const result = applyPatternsToEntity(entity, patterns);

      // Entity type should be corrected (use actual return type)
      expect(result.modified.type).toBe('PLACE');
      expect(result.changed).toBe(true);
      expect(result.appliedPatterns.length).toBeGreaterThan(0);
    });

    it('should apply patterns to batch of entities', () => {
      // Create patterns
      const correction1 = createTypeCorrection('Kingdom of Gondor', 'PERSON', 'PLACE');
      const correction2 = createTypeCorrection('Anduin River', 'PERSON', 'PLACE');
      const pattern1 = extractPatternFromCorrection(correction1)!;
      const pattern2 = extractPatternFromCorrection(correction2)!;
      const patterns = [pattern1, pattern2];

      // Create batch of entities
      const entities = [
        createTestEntity('Kingdom of Arnor', 'PERSON'),
        createTestEntity('Brandywine River', 'PERSON'),
        createTestEntity('Frodo Baggins', 'PERSON'), // Should NOT be affected
        createTestEntity('Kingdom of Dale', 'PERSON'),
      ];

      // Apply patterns to batch
      const result = applyPatternsToBatch(entities, patterns);

      // Check results (use actual return type: stats.modified)
      expect(result.stats.modified).toBe(3); // 2 Kingdoms + 1 River
      expect(result.stats.patternApplications).toBe(3);

      // Verify specific entities in the result
      const arnor = result.entities.find(e => e.canonical === 'Kingdom of Arnor');
      const brandywine = result.entities.find(e => e.canonical === 'Brandywine River');
      const frodo = result.entities.find(e => e.canonical === 'Frodo Baggins');
      const dale = result.entities.find(e => e.canonical === 'Kingdom of Dale');

      expect(arnor?.type).toBe('PLACE');
      expect(brandywine?.type).toBe('PLACE');
      expect(frodo?.type).toBe('PERSON'); // Unchanged
      expect(dale?.type).toBe('PLACE');
    });
  });

  describe('Full Learning Loop: Correction → Pattern → Application', () => {
    it('should complete full learning loop deterministically', () => {
      // ===============================================
      // STEP 1: User makes a correction
      // ===============================================
      const userCorrection = createTypeCorrection(
        'Kingdom of Gondor',
        'PERSON',
        'PLACE',
        'User identified this as a place, not a person'
      );

      // ===============================================
      // STEP 2: Learning engine extracts pattern
      // ===============================================
      const learnedPattern = extractPatternFromCorrection(userCorrection);
      expect(learnedPattern).not.toBeNull();
      expect(learnedPattern!.type).toBe('entity_type');

      console.log('\n[LEARNING LOOP TEST]');
      console.log('Step 1: User corrected "Kingdom of Gondor" from PERSON to PLACE');
      console.log(`Step 2: Extracted pattern: "${learnedPattern!.condition?.textPattern}" → ${learnedPattern!.action?.setType}`);

      // ===============================================
      // STEP 3: Simulate saving pattern to graph
      // (In production, this is done in corrections.ts)
      // ===============================================
      let graphPatterns: LearnedPattern[] = [];
      graphPatterns = mergePatterns(graphPatterns, learnedPattern!);
      expect(graphPatterns.length).toBe(1);

      console.log(`Step 3: Pattern stored in graph (${graphPatterns.length} pattern total)`);

      // ===============================================
      // STEP 4: Next extraction encounters similar entities
      // ===============================================
      const newEntities = [
        createTestEntity('Kingdom of Rohan', 'PERSON'),
        createTestEntity('Kingdom of Arnor', 'PERSON'),
        createTestEntity('Aragorn', 'PERSON'), // Should NOT be affected
      ];

      console.log('Step 4: New extraction encounters:');
      for (const e of newEntities) {
        console.log(`  - "${e.canonical}" (type: ${e.type})`);
      }

      // ===============================================
      // STEP 5: Pattern applier corrects entities
      // ===============================================
      const result = applyPatternsToBatch(newEntities, graphPatterns);

      console.log(`Step 5: Pattern applier results:`);
      console.log(`  - Type corrections: ${result.stats.modified}`);
      console.log(`  - Total patterns applied: ${result.stats.patternApplications}`);
      for (const e of result.entities) {
        console.log(`  - "${e.canonical}" → type: ${e.type}`);
      }

      // ===============================================
      // VERIFY: The loop worked!
      // ===============================================
      expect(result.stats.modified).toBe(2); // Both kingdoms

      const rohan = result.entities.find(e => e.canonical === 'Kingdom of Rohan');
      const arnor = result.entities.find(e => e.canonical === 'Kingdom of Arnor');
      const aragorn = result.entities.find(e => e.canonical === 'Aragorn');

      expect(rohan?.type).toBe('PLACE');
      expect(arnor?.type).toBe('PLACE');
      expect(aragorn?.type).toBe('PERSON'); // Correctly NOT affected

      console.log('\n✅ LEARNING LOOP COMPLETE:');
      console.log('  1. User correction → Pattern extraction');
      console.log('  2. Pattern storage → Graph persistence');
      console.log('  3. New extraction → Pattern application');
      console.log('  4. Entities automatically corrected based on learned pattern');
    });
  });

  describe('Pattern Confidence and Validation', () => {
    it('should track pattern timesApplied after merging', () => {
      const correction = createTypeCorrection('Kingdom of Gondor', 'PERSON', 'PLACE');
      let pattern = extractPatternFromCorrection(correction)!;
      let patterns = [pattern];

      // Initial timesApplied
      const initialCount = patterns[0].stats.timesApplied;
      expect(initialCount).toBeGreaterThanOrEqual(0);

      // Another correction strengthens the pattern
      const correction2 = createTypeCorrection('Kingdom of Rohan', 'PERSON', 'PLACE');
      const pattern2 = extractPatternFromCorrection(correction2)!;
      patterns = mergePatterns(patterns, pattern2);

      // timesApplied should increase or stay same
      expect(patterns[0].stats.timesApplied).toBeGreaterThanOrEqual(initialCount);
    });

    it('should respect minimum confidence threshold', () => {
      const correction = createTypeCorrection('Kingdom of Gondor', 'PERSON', 'PLACE');
      const pattern = extractPatternFromCorrection(correction)!;

      // Set very low confidence in stats
      pattern.stats.confidence = 0.1;

      const entity = createTestEntity('Kingdom of Mordor', 'PERSON');

      // With high threshold, pattern should not apply
      const result = applyPatternsToEntity(entity, [pattern], {
        minConfidence: 0.8,  // High threshold
        applyTypeCorrections: true,
        applyConfidenceBoosts: true,
        applyRejections: true,
        maxConfidenceBoost: 0.2,
      });

      // Pattern was not applied because confidence too low
      expect(result.changed).toBe(false);
      expect(result.modified.type).toBe('PERSON'); // Unchanged
    });
  });
});
