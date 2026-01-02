/**
 * Relations.ts TokenResolver Integration Tests
 *
 * These tests verify that the pronoun resolution migration in relations.ts
 * works correctly by testing the adapter functions and their fallback behavior.
 *
 * Test Categories:
 * 1. Adapter function behavior
 * 2. TokenResolver integration with extractDepRelations
 * 3. Legacy fallback for backward compatibility
 * 4. Regression tests for specific bug fixes
 */

import { describe, it, expect } from 'vitest';
import {
  TokenResolver,
  createTokenResolver,
  ReferenceResolver,
  type EntitySpan,
  type Sentence,
  type AdapterToken,
} from '../../app/engine/reference-resolver';
import type { Entity, EntityType } from '../../app/engine/schema';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createEntity(
  id: string,
  canonical: string,
  type: EntityType = 'PERSON',
  aliases: string[] = []
): Entity {
  return {
    id,
    canonical,
    type,
    confidence: 0.99,
    aliases: aliases.length ? aliases : [canonical],
  };
}

function createSpan(entity_id: string, start: number, end: number): EntitySpan {
  return { entity_id, start, end };
}

function createSentence(text: string, start: number): Sentence {
  return { text, start, end: start + text.length };
}

function createToken(
  i: number,
  text: string,
  pos: string,
  start: number,
  ent: string = ''
): AdapterToken {
  return {
    i,
    text,
    lemma: text.toLowerCase(),
    pos,
    tag: pos,
    dep: 'nsubj',
    head: 0,
    ent,
    start,
    end: start + text.length,
  };
}

// =============================================================================
// ADAPTER FUNCTION TESTS
// =============================================================================

describe('Relations.ts TokenResolver Adapter', () => {
  describe('resolveToken - Pronoun Resolution', () => {
    it('should resolve "he" to the most recent male entity', () => {
      const text = 'Harry walked. He smiled.';
      const entities = [createEntity('harry', 'Harry', 'PERSON')];
      const spans = [createSpan('harry', 0, 5)];
      const sentences = [
        createSentence('Harry walked.', 0),
        createSentence('He smiled.', 14),
      ];
      const sentenceTokens = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'walked', 'VERB', 6),
        ],
        [
          createToken(2, 'He', 'PRON', 14),
          createToken(3, 'smiled', 'VERB', 17),
        ],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      // Resolve "He" pronoun
      const heToken = sentenceTokens[1][0];
      const resolved = resolver.resolveToken(heToken, 'SENTENCE_START');

      expect(resolved.text).toBe('Harry');
      expect(resolved.start).toBe(0);
    });

    it('should not modify non-pronoun tokens', () => {
      const text = 'Harry walked.';
      const entities = [createEntity('harry', 'Harry', 'PERSON')];
      const spans = [createSpan('harry', 0, 5)];
      const sentences = [createSentence('Harry walked.', 0)];
      const sentenceTokens = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'walked', 'VERB', 6),
        ],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      // Harry is a proper noun, should not be modified
      const harryToken = sentenceTokens[0][0];
      const resolved = resolver.resolveToken(harryToken, 'SENTENCE_MID');

      expect(resolved).toBe(harryToken);
      expect(resolved.text).toBe('Harry');
    });
  });

  describe('resolvePossessors - Possessive Pronoun Resolution', () => {
    it('should resolve "his" to the possessor entity', () => {
      const text = 'Harry took his wand.';
      const entities = [createEntity('harry', 'Harry', 'PERSON')];
      const spans = [createSpan('harry', 0, 5)];
      const sentences = [createSentence('Harry took his wand.', 0)];
      const sentenceTokens = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'took', 'VERB', 6),
          createToken(2, 'his', 'PRON', 11),
          createToken(3, 'wand', 'NOUN', 15),
        ],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      const hisToken = sentenceTokens[0][2];
      const owners = resolver.resolvePossessors(hisToken);

      expect(owners.length).toBeGreaterThan(0);
      expect(owners[0].text).toBe('Harry');
    });

    it('should resolve "their" to multiple entities when available', () => {
      const text = 'Harry and Ron raised their wands.';
      const entities = [
        createEntity('harry', 'Harry', 'PERSON'),
        createEntity('ron', 'Ron', 'PERSON'),
      ];
      const spans = [
        createSpan('harry', 0, 5),
        createSpan('ron', 10, 13),
      ];
      const sentences = [createSentence('Harry and Ron raised their wands.', 0)];
      const sentenceTokens = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'and', 'CCONJ', 6),
          createToken(2, 'Ron', 'PROPN', 10, 'PERSON'),
          createToken(3, 'raised', 'VERB', 14),
          createToken(4, 'their', 'PRON', 21),
          createToken(5, 'wands', 'NOUN', 27),
        ],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      const theirToken = sentenceTokens[0][4];
      const owners = resolver.resolvePossessors(theirToken);

      expect(owners.length).toBe(2);
      // Should include both Harry and Ron
      const ownerNames = owners.map(o => o.text);
      expect(ownerNames).toContain('Harry');
      expect(ownerNames).toContain('Ron');
    });
  });

  describe('trackMention - Entity Tracking', () => {
    it('should track new entity mentions', () => {
      const text = 'Harry entered. Ron followed.';
      const entities = [
        createEntity('harry', 'Harry', 'PERSON'),
        createEntity('ron', 'Ron', 'PERSON'),
      ];
      const spans = [
        createSpan('harry', 0, 5),
        createSpan('ron', 15, 18),
      ];
      const sentences = [
        createSentence('Harry entered.', 0),
        createSentence('Ron followed.', 15),
      ];
      const sentenceTokens = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'entered', 'VERB', 6),
        ],
        [
          createToken(2, 'Ron', 'PROPN', 15, 'PERSON'),
          createToken(3, 'followed', 'VERB', 19),
        ],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      // Track Ron mention
      const ronToken = sentenceTokens[1][0];
      resolver.trackMention(ronToken, 'ron');

      // Now "He" should resolve to Ron (most recent)
      const heToken = createToken(4, 'He', 'PRON', 28);
      const resolved = resolver.resolveToken(heToken, 'SENTENCE_MID');

      expect(resolved.text).toBe('Ron');
    });
  });
});

// =============================================================================
// REGRESSION TESTS
// =============================================================================

describe('Regression Tests - Pronoun Resolution Bugs', () => {
  describe('Sentence-initial pronoun resolution', () => {
    it('should resolve sentence-initial "He" to subject of previous sentence', () => {
      // This tests the fix for the "Saul appeared" bug
      const text = 'Frederick walked. He knocked.';
      const entities = [createEntity('fred', 'Frederick', 'PERSON')];
      const spans = [createSpan('fred', 0, 9)];
      const sentences = [
        createSentence('Frederick walked.', 0),
        createSentence('He knocked.', 18),
      ];
      const sentenceTokens = [
        [
          createToken(0, 'Frederick', 'PROPN', 0, 'PERSON'),
          createToken(1, 'walked', 'VERB', 10),
        ],
        [
          createToken(2, 'He', 'PRON', 18),
          createToken(3, 'knocked', 'VERB', 21),
        ],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      const heToken = sentenceTokens[1][0];
      const resolved = resolver.resolveToken(heToken, 'SENTENCE_START');

      expect(resolved.text).toBe('Frederick');
    });

    it('should handle multiple entities with same first letter', () => {
      // Harry and Hermione - "He" should resolve to Harry, "She" to Hermione
      const text = 'Harry looked at Hermione. He smiled. She nodded.';
      const entities = [
        createEntity('harry', 'Harry', 'PERSON'),
        createEntity('hermione', 'Hermione', 'PERSON'),
      ];
      const spans = [
        createSpan('harry', 0, 5),
        createSpan('hermione', 16, 24),
      ];
      const sentences = [
        createSentence('Harry looked at Hermione.', 0),
        createSentence('He smiled.', 26),
        createSentence('She nodded.', 37),
      ];
      const sentenceTokens = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'looked', 'VERB', 6),
          createToken(2, 'at', 'ADP', 13),
          createToken(3, 'Hermione', 'PROPN', 16, 'PERSON'),
        ],
        [
          createToken(4, 'He', 'PRON', 26),
          createToken(5, 'smiled', 'VERB', 29),
        ],
        [
          createToken(6, 'She', 'PRON', 37),
          createToken(7, 'nodded', 'VERB', 41),
        ],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      // "He" should resolve to Harry
      const heToken = sentenceTokens[1][0];
      const heResolved = resolver.resolveToken(heToken, 'SENTENCE_START');
      expect(heResolved.text).toBe('Harry');

      // "She" should resolve to Hermione
      const sheToken = sentenceTokens[2][0];
      const sheResolved = resolver.resolveToken(sheToken, 'SENTENCE_START');
      expect(sheResolved.text).toBe('Hermione');
    });
  });

  describe('Possessive pronoun chains', () => {
    it('should handle "his father" patterns correctly', () => {
      const text = "Harry loved his father.";
      const entities = [createEntity('harry', 'Harry', 'PERSON')];
      const spans = [createSpan('harry', 0, 5)];
      const sentences = [createSentence("Harry loved his father.", 0)];
      const sentenceTokens = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'loved', 'VERB', 6),
          createToken(2, 'his', 'PRON', 12),
          createToken(3, 'father', 'NOUN', 16),
        ],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      const hisToken = sentenceTokens[0][2];
      const owners = resolver.resolvePossessors(hisToken);

      expect(owners.length).toBeGreaterThan(0);
      expect(owners[0].text).toBe('Harry');
    });
  });

  describe('Cross-sentence resolution', () => {
    it('should maintain context across multiple sentences', () => {
      const text = 'Harry entered. He looked around. He saw Ron.';
      const entities = [
        createEntity('harry', 'Harry', 'PERSON'),
        createEntity('ron', 'Ron', 'PERSON'),
      ];
      const spans = [
        createSpan('harry', 0, 5),
        createSpan('ron', 40, 43),
      ];
      const sentences = [
        createSentence('Harry entered.', 0),
        createSentence('He looked around.', 15),
        createSentence('He saw Ron.', 33),
      ];
      const sentenceTokens = [
        [createToken(0, 'Harry', 'PROPN', 0, 'PERSON'), createToken(1, 'entered', 'VERB', 6)],
        [createToken(2, 'He', 'PRON', 15), createToken(3, 'looked', 'VERB', 18)],
        [createToken(4, 'He', 'PRON', 33), createToken(5, 'saw', 'VERB', 36), createToken(6, 'Ron', 'PROPN', 40, 'PERSON')],
      ];

      const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

      // Both "He" pronouns should resolve to Harry
      const he1 = resolver.resolveToken(sentenceTokens[1][0], 'SENTENCE_START');
      const he2 = resolver.resolveToken(sentenceTokens[2][0], 'SENTENCE_START');

      expect(he1.text).toBe('Harry');
      expect(he2.text).toBe('Harry');
    });
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty entity list gracefully', () => {
    const text = 'He walked.';
    const entities: Entity[] = [];
    const spans: EntitySpan[] = [];
    const sentences = [createSentence('He walked.', 0)];
    const sentenceTokens = [[createToken(0, 'He', 'PRON', 0), createToken(1, 'walked', 'VERB', 3)]];

    const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

    // Should return original token when no entities available
    const heToken = sentenceTokens[0][0];
    const resolved = resolver.resolveToken(heToken, 'SENTENCE_MID');

    expect(resolved).toBe(heToken);
  });

  it('should handle gender mismatch correctly', () => {
    const text = 'Harry entered. She waved.';
    const entities = [createEntity('harry', 'Harry', 'PERSON')]; // Harry is male
    const spans = [createSpan('harry', 0, 5)];
    const sentences = [
      createSentence('Harry entered.', 0),
      createSentence('She waved.', 15),
    ];
    const sentenceTokens = [
      [createToken(0, 'Harry', 'PROPN', 0, 'PERSON'), createToken(1, 'entered', 'VERB', 6)],
      [createToken(2, 'She', 'PRON', 15), createToken(3, 'waved', 'VERB', 19)],
    ];

    const resolver = createTokenResolver(entities, spans, sentences, text, sentenceTokens);

    // "She" should not resolve to Harry (male)
    const sheToken = sentenceTokens[1][0];
    const resolved = resolver.resolveToken(sheToken, 'SENTENCE_START');

    // Should return original token or null, not Harry
    expect(resolved.text).not.toBe('Harry');
  });
});
