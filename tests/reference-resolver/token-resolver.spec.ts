/**
 * TokenResolver Adapter Tests
 *
 * Tests the TokenResolver adapter that bridges between Token-level operations
 * (used by relations.ts) and the ReferenceResolver service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenResolver,
  createTokenResolver,
  AdapterToken,
  EntitySpan,
  Sentence,
} from '../../app/engine/reference-resolver';
import type { Entity, EntityType } from '../../app/engine/schema';

// Helper to create a mock token
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

// Helper to create a mock entity
function createEntity(
  id: string,
  canonical: string,
  type: EntityType = 'PERSON'
): Entity {
  return {
    id,
    canonical,
    type,
    aliases: [canonical],
    confidence: 0.9,
  };
}

describe('TokenResolver', () => {
  describe('Basic Pronoun Resolution', () => {
    it('should resolve "He" to the first male entity', () => {
      const text = 'Harry entered. He spoke.';
      const entities: Entity[] = [createEntity('e1', 'Harry')];
      const entitySpans: EntitySpan[] = [{ entity_id: 'e1', start: 0, end: 5 }];
      const sentences: Sentence[] = [
        { text: 'Harry entered.', start: 0, end: 14 },
        { text: 'He spoke.', start: 15, end: 24 },
      ];
      const sentenceTokens: AdapterToken[][] = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'entered', 'VERB', 6),
        ],
        [
          createToken(2, 'He', 'PRON', 15),
          createToken(3, 'spoke', 'VERB', 18),
        ],
      ];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const pronounToken = sentenceTokens[1][0]; // "He"
      const resolved = resolver.resolveToken(pronounToken, 'SENTENCE_START');

      expect(resolved.text).toBe('Harry');
      expect(resolved.start).toBe(0);
    });

    it('should resolve "She" to the first female entity', () => {
      const text = 'Emma arrived. She smiled.';
      const entities: Entity[] = [createEntity('e1', 'Emma')];
      const entitySpans: EntitySpan[] = [{ entity_id: 'e1', start: 0, end: 4 }];
      const sentences: Sentence[] = [
        { text: 'Emma arrived.', start: 0, end: 13 },
        { text: 'She smiled.', start: 14, end: 25 },
      ];
      const sentenceTokens: AdapterToken[][] = [
        [
          createToken(0, 'Emma', 'PROPN', 0, 'PERSON'),
          createToken(1, 'arrived', 'VERB', 5),
        ],
        [
          createToken(2, 'She', 'PRON', 14),
          createToken(3, 'smiled', 'VERB', 18),
        ],
      ];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const pronounToken = sentenceTokens[1][0]; // "She"
      const resolved = resolver.resolveToken(pronounToken, 'SENTENCE_START');

      expect(resolved.text).toBe('Emma');
    });

    it('should return original token if not a pronoun', () => {
      const text = 'Harry spoke.';
      const entities: Entity[] = [createEntity('e1', 'Harry')];
      const entitySpans: EntitySpan[] = [{ entity_id: 'e1', start: 0, end: 5 }];
      const sentences: Sentence[] = [{ text, start: 0, end: text.length }];
      const sentenceTokens: AdapterToken[][] = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'spoke', 'VERB', 6),
        ],
      ];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const verbToken = sentenceTokens[0][1]; // "spoke"
      const resolved = resolver.resolveToken(verbToken, 'SENTENCE_MID');

      expect(resolved.text).toBe('spoke');
      expect(resolved).toBe(verbToken);
    });
  });

  describe('Possessive Pronoun Resolution', () => {
    it('should resolve "his" to the recent male entity', () => {
      const text = 'Harry saw his wand.';
      const entities: Entity[] = [createEntity('e1', 'Harry')];
      const entitySpans: EntitySpan[] = [{ entity_id: 'e1', start: 0, end: 5 }];
      const sentences: Sentence[] = [{ text, start: 0, end: text.length }];
      const sentenceTokens: AdapterToken[][] = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'saw', 'VERB', 6),
          createToken(2, 'his', 'PRON', 10),
          createToken(3, 'wand', 'NOUN', 14),
        ],
      ];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const possessiveToken = sentenceTokens[0][2]; // "his"
      const resolved = resolver.resolvePossessors(possessiveToken);

      expect(resolved.length).toBe(1);
      expect(resolved[0].text).toBe('Harry');
    });

    it('should resolve "their" to multiple recent entities', () => {
      const text = 'Harry and Ron shared their food.';
      const entities: Entity[] = [
        createEntity('e1', 'Harry'),
        createEntity('e2', 'Ron'),
      ];
      const entitySpans: EntitySpan[] = [
        { entity_id: 'e1', start: 0, end: 5 },
        { entity_id: 'e2', start: 10, end: 13 },
      ];
      const sentences: Sentence[] = [{ text, start: 0, end: text.length }];
      const sentenceTokens: AdapterToken[][] = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'and', 'CCONJ', 6),
          createToken(2, 'Ron', 'PROPN', 10, 'PERSON'),
          createToken(3, 'shared', 'VERB', 14),
          createToken(4, 'their', 'PRON', 21),
          createToken(5, 'food', 'NOUN', 27),
        ],
      ];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const theirToken = sentenceTokens[0][4]; // "their"
      const resolved = resolver.resolvePossessors(theirToken);

      expect(resolved.length).toBe(2);
      expect(resolved.map(t => t.text)).toContain('Harry');
      expect(resolved.map(t => t.text)).toContain('Ron');
    });
  });

  describe('Non-Pronoun Handling', () => {
    it('should return original token for non-pronouns in resolvePossessors', () => {
      const text = 'Harry waved.';
      const entities: Entity[] = [createEntity('e1', 'Harry')];
      const entitySpans: EntitySpan[] = [{ entity_id: 'e1', start: 0, end: 5 }];
      const sentences: Sentence[] = [{ text, start: 0, end: text.length }];
      const sentenceTokens: AdapterToken[][] = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'waved', 'VERB', 6),
        ],
      ];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const harryToken = sentenceTokens[0][0];
      const resolved = resolver.resolvePossessors(harryToken);

      expect(resolved.length).toBe(1);
      expect(resolved[0].text).toBe('Harry');
    });
  });

  describe('Utility Methods', () => {
    it('should correctly identify pronouns', () => {
      const resolver = new TokenResolver();

      const pronounToken = createToken(0, 'he', 'PRON', 0);
      const nameToken = createToken(1, 'Harry', 'PROPN', 3, 'PERSON');

      expect(resolver.isPronoun(pronounToken)).toBe(true);
      expect(resolver.isPronoun(nameToken)).toBe(false);
    });

    it('should provide access to underlying ReferenceResolver', () => {
      const text = 'Harry spoke.';
      const entities: Entity[] = [createEntity('e1', 'Harry')];
      const entitySpans: EntitySpan[] = [{ entity_id: 'e1', start: 0, end: 5 }];
      const sentences: Sentence[] = [{ text, start: 0, end: text.length }];
      const sentenceTokens: AdapterToken[][] = [];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const innerResolver = resolver.getResolver();
      expect(innerResolver).toBeDefined();
      expect(innerResolver.getEntityById('e1')?.canonical).toBe('Harry');
    });
  });

  describe('Mention Tracking', () => {
    it('should track new mentions and update recent persons', () => {
      const text = 'Harry saw Draco. Then Draco spoke.';
      const entities: Entity[] = [
        createEntity('e1', 'Harry'),
        createEntity('e2', 'Draco'),
      ];
      const entitySpans: EntitySpan[] = [
        { entity_id: 'e1', start: 0, end: 5 },
        { entity_id: 'e2', start: 10, end: 15 },
      ];
      const sentences: Sentence[] = [
        { text: 'Harry saw Draco.', start: 0, end: 16 },
        { text: 'Then Draco spoke.', start: 17, end: 34 },
      ];
      const sentenceTokens: AdapterToken[][] = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'saw', 'VERB', 6),
          createToken(2, 'Draco', 'PROPN', 10, 'PERSON'),
        ],
        [
          createToken(3, 'Then', 'ADV', 17),
          createToken(4, 'Draco', 'PROPN', 22, 'PERSON'),
          createToken(5, 'spoke', 'VERB', 28),
        ],
      ];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      // Track second mention of Draco
      const secondDracoToken = sentenceTokens[1][1];
      resolver.trackMention(secondDracoToken, 'e2');

      // Now "his" should resolve to Draco (most recent)
      const hisToken = createToken(6, 'his', 'PRON', 35);
      const resolved = resolver.resolvePossessors(hisToken);

      expect(resolved.length).toBe(1);
      expect(resolved[0].text).toBe('Draco');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty entity list', () => {
      const resolver = new TokenResolver();
      const pronounToken = createToken(0, 'he', 'PRON', 0);

      const resolved = resolver.resolveToken(pronounToken, 'SENTENCE_MID');
      expect(resolved).toBe(pronounToken); // Returns original when no resolution
    });

    it('should handle missing entity spans', () => {
      const text = 'He spoke.';
      const entities: Entity[] = [createEntity('e1', 'Harry')];
      const entitySpans: EntitySpan[] = []; // No spans
      const sentences: Sentence[] = [{ text, start: 0, end: text.length }];
      const sentenceTokens: AdapterToken[][] = [];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const pronounToken = createToken(0, 'He', 'PRON', 0);
      const resolved = resolver.resolveToken(pronounToken, 'SENTENCE_START');

      // Should return original when no entity token mapping exists
      expect(resolved.text).toBe('He');
    });

    it('should handle multiple same-gender entities by recency', () => {
      const text = 'Harry met Ron. He waved.';
      const entities: Entity[] = [
        createEntity('e1', 'Harry'),
        createEntity('e2', 'Ron'),
      ];
      const entitySpans: EntitySpan[] = [
        { entity_id: 'e1', start: 0, end: 5 },
        { entity_id: 'e2', start: 10, end: 13 },
      ];
      const sentences: Sentence[] = [
        { text: 'Harry met Ron.', start: 0, end: 14 },
        { text: 'He waved.', start: 15, end: 24 },
      ];
      const sentenceTokens: AdapterToken[][] = [
        [
          createToken(0, 'Harry', 'PROPN', 0, 'PERSON'),
          createToken(1, 'met', 'VERB', 6),
          createToken(2, 'Ron', 'PROPN', 10, 'PERSON'),
        ],
        [
          createToken(3, 'He', 'PRON', 15),
          createToken(4, 'waved', 'VERB', 18),
        ],
      ];

      const resolver = createTokenResolver(
        entities,
        entitySpans,
        sentences,
        text,
        sentenceTokens
      );

      const heToken = sentenceTokens[1][0];
      const resolved = resolver.resolveToken(heToken, 'SENTENCE_START');

      // At sentence start, should resolve to the subject of previous sentence (Harry)
      expect(resolved.text).toBe('Harry');
    });
  });
});
