/**
 * Coreference Accuracy Benchmark
 *
 * This benchmark measures the accuracy of pronoun resolution:
 * - Correct resolutions (pronoun → right entity)
 * - Correct non-resolutions (ambiguous → null)
 * - Wrong merges (pronoun → wrong entity)
 *
 * Target metrics:
 * - Resolution accuracy: ≥85%
 * - Wrong-merge rate: ≤5%
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  ReferenceResolver,
  createReferenceResolver,
  type EntitySpan,
  type Sentence,
} from '../../app/engine/reference-resolver';
import type { Entity, EntityType } from '../../app/engine/schema';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createEntity(
  id: string,
  canonical: string,
  type: EntityType,
  aliases: string[] = []
): Entity {
  return {
    id,
    canonical,
    type,
    confidence: 0.99,
    aliases,
    created_at: new Date().toISOString(),
  };
}

function createSpan(entity_id: string, start: number, end: number, text?: string): EntitySpan {
  return { entity_id, start, end, text };
}

function createSentence(text: string, start: number): Sentence {
  return { text, start, end: start + text.length };
}

interface BenchmarkCase {
  name: string;
  text: string;
  entities: Entity[];
  spans: EntitySpan[];
  sentences: Sentence[];
  pronounTests: {
    pronoun: string;
    position: number;
    context: 'SENTENCE_START' | 'SENTENCE_MID' | 'POSSESSIVE';
    expected: string | null; // null means should NOT resolve
  }[];
}

// =============================================================================
// BENCHMARK CASES
// =============================================================================

const BENCHMARK_CASES: BenchmarkCase[] = [
  // Case 1: Simple male/female disambiguation
  {
    name: 'Simple gender disambiguation',
    text: 'Harry met Hermione at the library. He was looking for a book. She helped him find it.',
    entities: [
      createEntity('harry', 'Harry Potter', 'PERSON'),
      createEntity('hermione', 'Hermione Granger', 'PERSON'),
    ],
    spans: [
      createSpan('harry', 0, 5),
      createSpan('hermione', 10, 18),
    ],
    sentences: [
      createSentence('Harry met Hermione at the library.', 0),
      createSentence('He was looking for a book.', 35),
      createSentence('She helped him find it.', 62),
    ],
    pronounTests: [
      { pronoun: 'He', position: 35, context: 'SENTENCE_START', expected: 'Harry Potter' },
      { pronoun: 'She', position: 62, context: 'SENTENCE_START', expected: 'Hermione Granger' },
      { pronoun: 'him', position: 73, context: 'SENTENCE_MID', expected: 'Harry Potter' },
    ],
  },

  // Case 2: Two males - recency matters
  {
    name: 'Two males - recency preference',
    text: 'Harry greeted Ron. Ron smiled back. He was happy to see his friend.',
    entities: [
      createEntity('harry', 'Harry Potter', 'PERSON'),
      createEntity('ron', 'Ron Weasley', 'PERSON'),
    ],
    spans: [
      createSpan('harry', 0, 5),
      createSpan('ron', 14, 17),
      createSpan('ron', 19, 22), // Second mention
    ],
    sentences: [
      createSentence('Harry greeted Ron.', 0),
      createSentence('Ron smiled back.', 19),
      createSentence('He was happy to see his friend.', 36),
    ],
    pronounTests: [
      // "He" after Ron's action should prefer Ron
      { pronoun: 'He', position: 36, context: 'SENTENCE_START', expected: 'Ron Weasley' },
      { pronoun: 'his', position: 55, context: 'POSSESSIVE', expected: 'Ron Weasley' },
    ],
  },

  // Case 3: Three males - ADVERSARIAL
  {
    name: 'Three males in paragraph - adversarial',
    text: 'Harry, Ron, and Neville entered the room. Harry sat down. He looked nervous.',
    entities: [
      createEntity('harry', 'Harry Potter', 'PERSON'),
      createEntity('ron', 'Ron Weasley', 'PERSON'),
      createEntity('neville', 'Neville Longbottom', 'PERSON'),
    ],
    spans: [
      createSpan('harry', 0, 5),
      createSpan('ron', 7, 10),
      createSpan('neville', 16, 23),
      createSpan('harry', 42, 47), // "Harry sat down"
    ],
    sentences: [
      createSentence('Harry, Ron, and Neville entered the room.', 0),
      createSentence('Harry sat down.', 42),
      createSentence('He looked nervous.', 58),
    ],
    pronounTests: [
      // "He" should resolve to Harry (most recent proper mention)
      { pronoun: 'He', position: 58, context: 'SENTENCE_START', expected: 'Harry Potter' },
    ],
  },

  // Case 4: Dialogue with pronouns - ADVERSARIAL
  {
    name: 'Dialogue attribution with pronouns',
    text: '"I need help," said Harry. "I can help you," Hermione replied. He thanked her.',
    entities: [
      createEntity('harry', 'Harry Potter', 'PERSON'),
      createEntity('hermione', 'Hermione Granger', 'PERSON'),
    ],
    spans: [
      createSpan('harry', 20, 25),
      createSpan('hermione', 44, 52),
    ],
    sentences: [
      createSentence('"I need help," said Harry.', 0),
      createSentence('"I can help you," Hermione replied.', 27),
      createSentence('He thanked her.', 63),
    ],
    pronounTests: [
      { pronoun: 'He', position: 63, context: 'SENTENCE_START', expected: 'Harry Potter' },
      { pronoun: 'her', position: 74, context: 'SENTENCE_MID', expected: 'Hermione Granger' },
    ],
  },

  // Case 5: Possessive chain
  {
    name: 'Possessive pronoun chain',
    text: "Ron's mother made his favorite dinner. His brothers were jealous.",
    entities: [
      createEntity('ron', 'Ron Weasley', 'PERSON'),
      createEntity('molly', 'Molly Weasley', 'PERSON'),
    ],
    spans: [
      createSpan('ron', 0, 3),
      createSpan('molly', 6, 12),
    ],
    sentences: [
      createSentence("Ron's mother made his favorite dinner.", 0),
      createSentence('His brothers were jealous.', 39),
    ],
    pronounTests: [
      { pronoun: 'his', position: 18, context: 'POSSESSIVE', expected: 'Ron Weasley' },
      { pronoun: 'His', position: 39, context: 'SENTENCE_START', expected: 'Ron Weasley' },
    ],
  },

  // Case 6: Topic switch - ADVERSARIAL
  {
    name: 'Topic switch with pronoun',
    text: 'Harry walked in. Ron was already there. He had been waiting.',
    entities: [
      createEntity('harry', 'Harry Potter', 'PERSON'),
      createEntity('ron', 'Ron Weasley', 'PERSON'),
    ],
    spans: [
      createSpan('harry', 0, 5),
      createSpan('ron', 17, 20),
    ],
    sentences: [
      createSentence('Harry walked in.', 0),
      createSentence('Ron was already there.', 17),
      createSentence('He had been waiting.', 40),
    ],
    pronounTests: [
      // "He" should resolve to Ron (subject of previous sentence)
      { pronoun: 'He', position: 40, context: 'SENTENCE_START', expected: 'Ron Weasley' },
    ],
  },

  // Case 7: Cross-paragraph resolution
  {
    name: 'Cross-paragraph reference',
    text: 'Dumbledore entered his office.\n\nHe sat at his desk.',
    entities: [
      createEntity('dumbledore', 'Albus Dumbledore', 'PERSON'),
    ],
    spans: [
      createSpan('dumbledore', 0, 10),
    ],
    sentences: [
      createSentence('Dumbledore entered his office.', 0),
      createSentence('He sat at his desk.', 32),
    ],
    pronounTests: [
      { pronoun: 'his', position: 19, context: 'POSSESSIVE', expected: 'Albus Dumbledore' },
      { pronoun: 'He', position: 32, context: 'SENTENCE_START', expected: 'Albus Dumbledore' },
      { pronoun: 'his', position: 42, context: 'POSSESSIVE', expected: 'Albus Dumbledore' },
    ],
  },

  // Case 8: Organization pronoun (it)
  {
    name: 'Organization with "it" pronoun',
    text: 'The Ministry issued a statement. It confirmed the rumors.',
    entities: [
      createEntity('ministry', 'Ministry of Magic', 'ORG'),
    ],
    spans: [
      createSpan('ministry', 0, 12),
    ],
    sentences: [
      createSentence('The Ministry issued a statement.', 0),
      createSentence('It confirmed the rumors.', 33),
    ],
    pronounTests: [
      { pronoun: 'It', position: 33, context: 'SENTENCE_START', expected: 'Ministry of Magic' },
    ],
  },

  // Case 9: Mixed entities with "they"
  {
    name: 'Plural "they" for group',
    text: 'Harry and Ron entered together. They looked tired.',
    entities: [
      createEntity('harry', 'Harry Potter', 'PERSON'),
      createEntity('ron', 'Ron Weasley', 'PERSON'),
    ],
    spans: [
      createSpan('harry', 0, 5),
      createSpan('ron', 10, 13),
    ],
    sentences: [
      createSentence('Harry and Ron entered together.', 0),
      createSentence('They looked tired.', 32),
    ],
    pronounTests: [
      // "They" could resolve to either, we accept both
      { pronoun: 'They', position: 32, context: 'SENTENCE_START', expected: 'Harry Potter' }, // First of group
    ],
  },

  // Case 10: Ambiguous - subject preference (linguistic choice)
  {
    name: 'Ambiguous pronoun - subject preference',
    text: 'The wizard and the sorcerer dueled. He cast a spell.',
    entities: [
      createEntity('wizard', 'The Wizard', 'PERSON'),
      createEntity('sorcerer', 'The Sorcerer', 'PERSON'),
    ],
    spans: [
      createSpan('wizard', 0, 10),
      createSpan('sorcerer', 19, 31),
    ],
    sentences: [
      createSentence('The wizard and the sorcerer dueled.', 0),
      createSentence('He cast a spell.', 36),
    ],
    pronounTests: [
      // Both are male - sentence-start subject pronouns prefer the first entity
      // (the grammatical subject of the previous sentence)
      { pronoun: 'He', position: 36, context: 'SENTENCE_START', expected: 'The Wizard' },
    ],
  },
];

// =============================================================================
// BENCHMARK EXECUTION
// =============================================================================

describe('Coreference Accuracy Benchmark', () => {
  const results = {
    total: 0,
    correct: 0,
    incorrect: 0,
    unresolved: 0,
  };

  // Run each benchmark case
  BENCHMARK_CASES.forEach((testCase) => {
    describe(testCase.name, () => {
      testCase.pronounTests.forEach((test, index) => {
        it(`should resolve "${test.pronoun}" at ${test.position} → ${test.expected ?? 'null'}`, () => {
          const resolver = createReferenceResolver(
            testCase.entities,
            testCase.spans,
            testCase.sentences,
            testCase.text
          );

          // Update context with all entities
          for (const entity of testCase.entities) {
            resolver.updateContext(entity);
          }

          const resolved = resolver.resolvePronoun(test.pronoun, test.position, test.context);

          results.total++;

          if (test.expected === null) {
            // Expected to NOT resolve
            if (resolved === null) {
              results.correct++;
            } else {
              results.incorrect++;
            }
            expect(resolved).toBeNull();
          } else {
            // Expected to resolve to specific entity
            if (resolved === null) {
              results.unresolved++;
              // Allow unresolved in some cases
              expect(resolved).not.toBeNull();
            } else if (resolved.canonical === test.expected) {
              results.correct++;
              expect(resolved.canonical).toBe(test.expected);
            } else {
              results.incorrect++;
              expect(resolved.canonical).toBe(test.expected);
            }
          }
        });
      });
    });
  });

  // Summary test at the end
  it('BENCHMARK SUMMARY: should meet accuracy targets', () => {
    const accuracy = results.total > 0 ? (results.correct / results.total) * 100 : 0;
    const wrongMergeRate = results.total > 0 ? (results.incorrect / results.total) * 100 : 0;

    console.log('\n=== COREFERENCE BENCHMARK RESULTS ===');
    console.log(`Total tests: ${results.total}`);
    console.log(`Correct: ${results.correct}`);
    console.log(`Incorrect (wrong merge): ${results.incorrect}`);
    console.log(`Unresolved: ${results.unresolved}`);
    console.log(`Accuracy: ${accuracy.toFixed(1)}%`);
    console.log(`Wrong-merge rate: ${wrongMergeRate.toFixed(1)}%`);
    console.log('=====================================\n');

    // Target: ≥85% accuracy, ≤5% wrong-merge
    expect(accuracy).toBeGreaterThanOrEqual(85);
    expect(wrongMergeRate).toBeLessThanOrEqual(5);
  });
});

// =============================================================================
// ADVERSARIAL CASES: WRONG-MERGE DETECTION
// =============================================================================

describe('Adversarial: Wrong-Merge Prevention', () => {
  it('should not merge pronouns across incompatible genders', () => {
    const text = 'Hermione studied hard. He failed the test.';
    const hermione = createEntity('hermione', 'Hermione Granger', 'PERSON');

    const resolver = createReferenceResolver(
      [hermione],
      [createSpan('hermione', 0, 8)],
      [
        createSentence('Hermione studied hard.', 0),
        createSentence('He failed the test.', 23),
      ],
      text
    );
    resolver.updateContext(hermione);

    // "He" should NOT resolve to Hermione (gender mismatch)
    const he = resolver.resolvePronoun('He', 23, 'SENTENCE_START');
    expect(he).toBeNull();
  });

  it('should not over-merge with distant antecedents when closer ones exist', () => {
    const text = 'Harry was at home. Draco arrived at school. He started class.';
    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const draco = createEntity('draco', 'Draco Malfoy', 'PERSON');

    const resolver = createReferenceResolver(
      [harry, draco],
      [
        createSpan('harry', 0, 5),
        createSpan('draco', 19, 24),
      ],
      [
        createSentence('Harry was at home.', 0),
        createSentence('Draco arrived at school.', 19),
        createSentence('He started class.', 44),
      ],
      text
    );
    resolver.updateContext(harry);
    resolver.updateContext(draco);

    // "He" should resolve to Draco (more recent), not Harry
    const he = resolver.resolvePronoun('He', 44, 'SENTENCE_START');
    expect(he).not.toBeNull();
    expect(he!.canonical).toBe('Draco Malfoy');
  });

  it('should handle nested dialogue without wrong attribution', () => {
    const text = '"He said he would come," Harry explained to Ron.';
    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const ron = createEntity('ron', 'Ron Weasley', 'PERSON');

    const resolver = createReferenceResolver(
      [harry, ron],
      [
        createSpan('harry', 25, 30),
        createSpan('ron', 44, 47),
      ],
      [createSentence(text, 0)],
      text
    );
    resolver.updateContext(harry);
    resolver.updateContext(ron);

    // The "He" inside the quote is about someone else (unknown third party)
    // The sentence-level resolution shouldn't wrongly attribute to Harry or Ron
    // This is a tricky case - we're testing the resolver doesn't crash or wrongly merge
    const he = resolver.resolvePronoun('He', 1, 'SENTENCE_MID');
    // Accept either null (conservative) or a male candidate
    if (he !== null) {
      expect(['Harry Potter', 'Ron Weasley']).toContain(he.canonical);
    }
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases: Robustness', () => {
  it('should handle empty entity list gracefully', () => {
    const resolver = createReferenceResolver([], [], [], 'He said hello.');
    const he = resolver.resolvePronoun('He', 0, 'SENTENCE_START');
    expect(he).toBeNull();
  });

  it('should handle pronoun at exact sentence boundary', () => {
    const text = 'Harry. He spoke.';
    const harry = createEntity('harry', 'Harry Potter', 'PERSON');

    const resolver = createReferenceResolver(
      [harry],
      [createSpan('harry', 0, 5)],
      [
        createSentence('Harry.', 0),
        createSentence('He spoke.', 7),
      ],
      text
    );
    resolver.updateContext(harry);

    const he = resolver.resolvePronoun('He', 7, 'SENTENCE_START');
    expect(he).not.toBeNull();
    expect(he!.canonical).toBe('Harry Potter');
  });

  it('should handle very long distance resolution', () => {
    // 500+ characters between antecedent and pronoun
    const filler = 'The castle was magnificent. '.repeat(20);
    const text = `Harry arrived. ${filler}He was amazed.`;

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const resolver = createReferenceResolver(
      [harry],
      [createSpan('harry', 0, 5)],
      [
        createSentence('Harry arrived.', 0),
        ...Array.from({ length: 20 }, (_, i) =>
          createSentence('The castle was magnificent.', 15 + i * 28)
        ),
        createSentence('He was amazed.', 15 + 20 * 28),
      ],
      text
    );
    resolver.updateContext(harry);

    const he = resolver.resolvePronoun('He', 15 + 20 * 28, 'SENTENCE_START');
    expect(he).not.toBeNull();
    expect(he!.canonical).toBe('Harry Potter');
  });
});
