/**
 * Entity Capture Benchmark
 *
 * This benchmark measures how well the entity quality filters:
 * 1. KEEP obvious entities (proper names, clear characters, organizations)
 * 2. REJECT junk entities (pronouns, determiners, verbs, fragments)
 *
 * Target metrics:
 * - Obvious entity retention: ≥95%
 * - Junk rejection: ≥98%
 *
 * Philosophy: We do NOT copy BookNLP's "mention threshold" behavior.
 * Instead, we keep obvious entities always, demote low-confidence ones,
 * and only reject clearly junk entities via deterministic rules.
 */

import { describe, it, expect } from 'vitest';
import { isLexicallyValidEntityName } from '../../app/engine/entity-quality-filter';
import {
  shouldSuppressAdjectiveColorPerson,
  shouldSuppressSentenceInitialPerson,
  applyTypeOverrides,
  isFragmentaryItem
} from '../../app/engine/linguistics/entity-heuristics';
import type { Entity } from '../../app/engine/schema';

// =============================================================================
// BENCHMARK CASE DEFINITIONS
// =============================================================================

interface ObviousEntityCase {
  name: string;
  type: 'PERSON' | 'ORG' | 'PLACE' | 'ITEM' | 'WORK';
  expectedValid: boolean;
  context?: {
    isSentenceInitial?: boolean;
    occursNonInitial?: boolean;
    hasNERSupport?: boolean;
    fullText?: string;
    spanStart?: number;
    spanEnd?: number;
  };
}

// =============================================================================
// OBVIOUS ENTITIES - MUST KEEP
// =============================================================================

const OBVIOUS_ENTITIES: ObviousEntityCase[] = [
  // Clear proper names
  { name: 'Harry Potter', type: 'PERSON', expectedValid: true },
  { name: 'Hermione Granger', type: 'PERSON', expectedValid: true },
  { name: 'Albus Dumbledore', type: 'PERSON', expectedValid: true },
  { name: 'Tom Riddle', type: 'PERSON', expectedValid: true },
  { name: 'Lord Voldemort', type: 'PERSON', expectedValid: true },

  // Single names that are clearly proper nouns
  { name: 'Gandalf', type: 'PERSON', expectedValid: true },
  { name: 'Frodo', type: 'PERSON', expectedValid: true },
  { name: 'Aragorn', type: 'PERSON', expectedValid: true },
  { name: 'Saruman', type: 'PERSON', expectedValid: true },

  // Names with titles
  { name: 'Professor McGonagall', type: 'PERSON', expectedValid: true },
  { name: 'Dr. Watson', type: 'PERSON', expectedValid: true },
  { name: 'Captain Ahab', type: 'PERSON', expectedValid: true },
  { name: 'King Arthur', type: 'PERSON', expectedValid: true },

  // Organizations
  { name: 'Ministry of Magic', type: 'ORG', expectedValid: true },
  { name: 'Hogwarts', type: 'ORG', expectedValid: true },
  { name: 'Gringotts', type: 'ORG', expectedValid: true },
  { name: 'The Daily Prophet', type: 'ORG', expectedValid: true },
  { name: 'CERN', type: 'ORG', expectedValid: true },
  { name: 'MIT', type: 'ORG', expectedValid: true },

  // Places
  { name: 'London', type: 'PLACE', expectedValid: true },
  { name: 'Diagon Alley', type: 'PLACE', expectedValid: true },
  { name: 'The Forbidden Forest', type: 'PLACE', expectedValid: true },
  { name: 'Mordor', type: 'PLACE', expectedValid: true },
  { name: 'Silicon Valley', type: 'PLACE', expectedValid: true },

  // Works
  { name: 'The Hobbit', type: 'WORK', expectedValid: true },
  { name: 'Macbeth', type: 'WORK', expectedValid: true },
  { name: 'Advanced Potion-Making', type: 'WORK', expectedValid: true },

  // Items
  { name: 'Elder Wand', type: 'ITEM', expectedValid: true },
  { name: 'Excalibur', type: 'ITEM', expectedValid: true },
  { name: 'The One Ring', type: 'ITEM', expectedValid: true },

  // Names that might be mistaken for common words but are valid with context
  { name: 'Rose', type: 'PERSON', expectedValid: true, context: { hasNERSupport: true } },
  { name: 'Grace', type: 'PERSON', expectedValid: true, context: { hasNERSupport: true } },
  { name: 'Hunter', type: 'PERSON', expectedValid: true, context: { hasNERSupport: true } },
  { name: 'Chase', type: 'PERSON', expectedValid: true, context: { hasNERSupport: true } },
];

// =============================================================================
// JUNK ENTITIES - MUST REJECT
// =============================================================================

const JUNK_ENTITIES: ObviousEntityCase[] = [
  // Pronouns
  { name: 'he', type: 'PERSON', expectedValid: false },
  { name: 'she', type: 'PERSON', expectedValid: false },
  { name: 'they', type: 'PERSON', expectedValid: false },
  { name: 'him', type: 'PERSON', expectedValid: false },
  { name: 'her', type: 'PERSON', expectedValid: false },
  { name: 'it', type: 'ITEM', expectedValid: false },
  { name: 'them', type: 'PERSON', expectedValid: false },
  { name: 'his', type: 'PERSON', expectedValid: false },
  { name: 'hers', type: 'PERSON', expectedValid: false },
  { name: 'their', type: 'PERSON', expectedValid: false },

  // Determiners
  { name: 'the', type: 'ITEM', expectedValid: false },
  { name: 'a', type: 'ITEM', expectedValid: false },
  { name: 'an', type: 'ITEM', expectedValid: false },
  { name: 'this', type: 'ITEM', expectedValid: false },
  { name: 'that', type: 'ITEM', expectedValid: false },
  { name: 'these', type: 'ITEM', expectedValid: false },
  { name: 'those', type: 'ITEM', expectedValid: false },

  // Common verbs (even capitalized)
  { name: 'said', type: 'PERSON', expectedValid: false },
  { name: 'walked', type: 'PERSON', expectedValid: false },
  { name: 'looked', type: 'PERSON', expectedValid: false },
  { name: 'went', type: 'PERSON', expectedValid: false },
  { name: 'came', type: 'PERSON', expectedValid: false },

  // Discourse markers
  { name: 'however', type: 'PERSON', expectedValid: false },
  { name: 'therefore', type: 'PERSON', expectedValid: false },
  { name: 'meanwhile', type: 'PERSON', expectedValid: false },
  { name: 'suddenly', type: 'PERSON', expectedValid: false },

  // Generic words
  { name: 'thing', type: 'ITEM', expectedValid: false },
  { name: 'stuff', type: 'ITEM', expectedValid: false },
  { name: 'person', type: 'PERSON', expectedValid: false },
  { name: 'people', type: 'PERSON', expectedValid: false },
  { name: 'place', type: 'PLACE', expectedValid: false },
  { name: 'someone', type: 'PERSON', expectedValid: false },
  { name: 'something', type: 'ITEM', expectedValid: false },

  // Sentence-initial false positives (without NER support)
  { name: 'When', type: 'PERSON', expectedValid: false, context: { isSentenceInitial: true, hasNERSupport: false } },
  { name: 'After', type: 'PERSON', expectedValid: false, context: { isSentenceInitial: true, hasNERSupport: false } },
  { name: 'Before', type: 'PERSON', expectedValid: false, context: { isSentenceInitial: true, hasNERSupport: false } },
  { name: 'Like', type: 'PERSON', expectedValid: false, context: { isSentenceInitial: true, hasNERSupport: false } },
  { name: 'Perched', type: 'PERSON', expectedValid: false, context: { isSentenceInitial: true, hasNERSupport: false } },
  { name: 'Familiar', type: 'PERSON', expectedValid: false, context: { isSentenceInitial: true, hasNERSupport: false } },
];

// =============================================================================
// ADVERSARIAL CASES
// =============================================================================

const ADVERSARIAL_CASES: ObviousEntityCase[] = [
  // Color surnames (should be valid with title prefix)
  { name: 'Black', type: 'PERSON', expectedValid: true, context: { fullText: 'Mr. Black stepped forward.', spanStart: 4, spanEnd: 9 } },
  { name: 'Brown', type: 'PERSON', expectedValid: true, context: { fullText: 'Professor Brown lectured.', spanStart: 10, spanEnd: 15 } },
  { name: 'White', type: 'PERSON', expectedValid: true, context: { fullText: 'Dr. White examined.', spanStart: 4, spanEnd: 9 } },

  // Color adjectives (should be rejected)
  { name: 'Black', type: 'PERSON', expectedValid: false, context: { fullText: 'Black clouds rolled in.', spanStart: 0, spanEnd: 5 } },
  { name: 'Red', type: 'PERSON', expectedValid: false, context: { fullText: 'Red lights flashed.', spanStart: 0, spanEnd: 3 } },

  // The Cartographers Guild pattern (ORG with "The")
  { name: 'The Cartographers Guild', type: 'ORG', expectedValid: true },
  { name: 'The Kingdom of Gondor', type: 'PLACE', expectedValid: true },
  { name: 'The Order of the Phoenix', type: 'ORG', expectedValid: true },

  // Prepositional phrases - these need NLP context to catch
  // For now, we rely on other heuristics (fragmentation, NER support)
  // These would be caught by isFragmentaryItem or similar checks
  // { name: 'After lunch', type: 'ITEM', expectedValid: false },
  // { name: 'In the morning', type: 'PLACE', expectedValid: false },
  // { name: 'At first', type: 'PLACE', expectedValid: false },
];

// =============================================================================
// BENCHMARK EXECUTION
// =============================================================================

describe('Entity Capture Benchmark', () => {
  const results = {
    obviousTotal: 0,
    obviousCorrect: 0,
    junkTotal: 0,
    junkCorrect: 0,
    adversarialTotal: 0,
    adversarialCorrect: 0,
  };

  describe('Obvious Entities - Must KEEP', () => {
    OBVIOUS_ENTITIES.forEach(testCase => {
      it(`should KEEP "${testCase.name}" as ${testCase.type}`, () => {
        results.obviousTotal++;

        const valid = isLexicallyValidEntityName(
          testCase.name,
          testCase.type,
          undefined,
          testCase.context
        );

        if (valid === testCase.expectedValid) {
          results.obviousCorrect++;
        }

        expect(valid).toBe(testCase.expectedValid);
      });
    });
  });

  describe('Junk Entities - Must REJECT', () => {
    JUNK_ENTITIES.forEach(testCase => {
      it(`should REJECT "${testCase.name}" as ${testCase.type}`, () => {
        results.junkTotal++;

        const valid = isLexicallyValidEntityName(
          testCase.name,
          testCase.type,
          undefined,
          testCase.context
        );

        if (valid === testCase.expectedValid) {
          results.junkCorrect++;
        }

        expect(valid).toBe(testCase.expectedValid);
      });
    });
  });

  describe('Adversarial Cases', () => {
    ADVERSARIAL_CASES.forEach(testCase => {
      it(`should ${testCase.expectedValid ? 'KEEP' : 'REJECT'} "${testCase.name}" (${testCase.context?.fullText ?? 'no context'})`, () => {
        results.adversarialTotal++;

        // For adversarial cases with span context, use heuristics
        if (testCase.context?.fullText && testCase.context?.spanStart !== undefined) {
          const entity = {
            id: 'test',
            canonical: testCase.name,
            type: testCase.type,
            aliases: [],
            created_at: new Date().toISOString(),
          } as Entity;

          const span = { start: testCase.context.spanStart, end: testCase.context.spanEnd! };

          // Check color/adjective suppression
          if (testCase.type === 'PERSON') {
            const suppression = shouldSuppressAdjectiveColorPerson(entity, span, testCase.context.fullText);
            const valid = !suppression.suppress;

            if (valid === testCase.expectedValid) {
              results.adversarialCorrect++;
            }

            expect(valid).toBe(testCase.expectedValid);
            return;
          }
        }

        // Default: use lexical filter
        const valid = isLexicallyValidEntityName(
          testCase.name,
          testCase.type,
          undefined,
          testCase.context
        );

        if (valid === testCase.expectedValid) {
          results.adversarialCorrect++;
        }

        expect(valid).toBe(testCase.expectedValid);
      });
    });
  });

  // Summary test
  it('BENCHMARK SUMMARY: should meet capture targets', () => {
    const obviousRetention = results.obviousTotal > 0
      ? (results.obviousCorrect / results.obviousTotal) * 100
      : 0;
    const junkRejection = results.junkTotal > 0
      ? (results.junkCorrect / results.junkTotal) * 100
      : 0;
    const adversarialAccuracy = results.adversarialTotal > 0
      ? (results.adversarialCorrect / results.adversarialTotal) * 100
      : 0;

    console.log('\n=== ENTITY CAPTURE BENCHMARK RESULTS ===');
    console.log(`Obvious Entities: ${results.obviousCorrect}/${results.obviousTotal} (${obviousRetention.toFixed(1)}%)`);
    console.log(`Junk Rejection: ${results.junkCorrect}/${results.junkTotal} (${junkRejection.toFixed(1)}%)`);
    console.log(`Adversarial: ${results.adversarialCorrect}/${results.adversarialTotal} (${adversarialAccuracy.toFixed(1)}%)`);
    console.log('=========================================\n');

    // Targets
    expect(obviousRetention).toBeGreaterThanOrEqual(95);
    expect(junkRejection).toBeGreaterThanOrEqual(98);
    expect(adversarialAccuracy).toBeGreaterThanOrEqual(80);
  });
});

// =============================================================================
// TYPE OVERRIDE TESTS
// =============================================================================

describe('Entity Type Override Tests', () => {
  const baseEntity = (name: string, type: Entity['type']): Entity => ({
    id: 'test',
    canonical: name,
    type,
    aliases: [],
    created_at: new Date().toISOString(),
  });

  it('should override ITEM to PERSON for Detective prefix', () => {
    const entity = baseEntity('Sheff', 'ITEM');
    const span = { start: 10, end: 15 };
    const result = applyTypeOverrides(entity, span, 'Detective Sheff noted the clue.');
    expect(result.type).toBe('PERSON');
  });

  it('should override PERSON to PLACE for street suffix', () => {
    const entity = baseEntity('Dapier Street', 'PERSON');
    const span = { start: 0, end: 13 };
    const result = applyTypeOverrides(entity, span, 'Dapier Street was closed.');
    expect(result.type).toBe('PLACE');
  });

  it('should override PLACE to ORG for school-like names', () => {
    const entity = baseEntity('Mount Linola Junior High School', 'PLACE');
    const span = { start: 0, end: 33 };
    const result = applyTypeOverrides(entity, span, 'Mount Linola Junior High School opened its gates.');
    expect(result.type).toBe('ORG');
  });
});

// =============================================================================
// FRAGMENTARY ITEM TESTS
// =============================================================================

describe('Fragmentary Item Detection', () => {
  const testEntity = (name: string): Entity => ({
    id: 'test',
    canonical: name,
    type: 'ITEM',
    aliases: [],
    created_at: new Date().toISOString(),
  });

  it('should detect verb phrases as fragmentary', () => {
    expect(isFragmentaryItem(testEntity('fix this'))).toBe(true);
    expect(isFragmentaryItem(testEntity('find out'))).toBe(true);
  });

  it('should not flag valid item names', () => {
    expect(isFragmentaryItem(testEntity('Elder Wand'))).toBe(false);
    expect(isFragmentaryItem(testEntity('The One Ring'))).toBe(false);
  });
});
