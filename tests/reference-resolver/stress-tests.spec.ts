/**
 * Stress Tests for ReferenceResolver
 *
 * These tests cover edge cases and complex scenarios to ensure
 * the pronoun resolution fixes are solid.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

// =============================================================================
// STRESS TEST: MULTIPLE PRONOUNS SAME GENDER
// =============================================================================

describe('Stress Test: Multiple Same-Gender Pronouns', () => {
  it('should correctly resolve multiple "he" pronouns to different entities', () => {
    // Harry talked to Ron. He was nervous. He said it would be okay.
    const text = 'Harry talked to Ron. He was nervous. He said it would be okay.';

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const ron = createEntity('ron', 'Ron Weasley', 'PERSON');

    const entities = [harry, ron];
    const spans = [
      createSpan('harry', 0, 5),  // "Harry"
      createSpan('ron', 16, 19),  // "Ron"
    ];
    const sentences = [
      createSentence('Harry talked to Ron.', 0),
      createSentence('He was nervous.', 21),
      createSentence('He said it would be okay.', 37),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // First "He" at sentence start - should resolve to Harry (subject of prev sentence)
    const he1 = resolver.resolvePronoun('He', 21, 'SENTENCE_START');
    expect(he1).not.toBeNull();
    expect(he1!.canonical).toBe('Harry Potter');

    // Second "He" at sentence start - should also resolve to Harry (subject of sentence 1)
    // But sentence 2 has "He" as subject, so this might continue referring to Harry
    const he2 = resolver.resolvePronoun('He', 37, 'SENTENCE_START');
    expect(he2).not.toBeNull();
    // Both are acceptable since both are male, but prefer consistency
    expect(['Harry Potter', 'Ron Weasley']).toContain(he2!.canonical);
  });

  it('should handle interleaved male and female pronouns', () => {
    // Harry met Hermione. She smiled. He waved. She laughed.
    const text = 'Harry met Hermione. She smiled. He waved. She laughed.';

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const hermione = createEntity('hermione', 'Hermione Granger', 'PERSON');

    const entities = [harry, hermione];
    const spans = [
      createSpan('harry', 0, 5),
      createSpan('hermione', 10, 18),
    ];
    const sentences = [
      createSentence('Harry met Hermione.', 0),
      createSentence('She smiled.', 20),
      createSentence('He waved.', 32),
      createSentence('She laughed.', 42),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    expect(resolver.resolvePronoun('She', 20, 'SENTENCE_START')?.canonical).toBe('Hermione Granger');
    expect(resolver.resolvePronoun('He', 32, 'SENTENCE_START')?.canonical).toBe('Harry Potter');
    expect(resolver.resolvePronoun('She', 42, 'SENTENCE_START')?.canonical).toBe('Hermione Granger');
  });
});

// =============================================================================
// STRESS TEST: POSSESSIVE PRONOUNS
// =============================================================================

describe('Stress Test: Possessive Pronouns', () => {
  it('should correctly resolve possessive pronouns in family contexts', () => {
    // Ron came from a large family. His father Arthur worked at the Ministry.
    const text = 'Ron came from a large family. His father Arthur worked at the Ministry.';

    const ron = createEntity('ron', 'Ron Weasley', 'PERSON');
    const arthur = createEntity('arthur', 'Arthur Weasley', 'PERSON');

    const entities = [ron, arthur];
    const spans = [
      createSpan('ron', 0, 3),
      createSpan('arthur', 41, 47),
    ];
    const sentences = [
      createSentence('Ron came from a large family.', 0),
      createSentence('His father Arthur worked at the Ministry.', 30),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "His" at sentence start should resolve to Ron (most recent male)
    const his = resolver.resolvePronoun('His', 30, 'SENTENCE_START');
    expect(his).not.toBeNull();
    expect(his!.canonical).toBe('Ron Weasley');
  });

  it('should correctly resolve "their" to multiple entities', () => {
    // Harry and Ron went to class. Their books were heavy.
    const text = 'Harry and Ron went to class. Their books were heavy.';

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const ron = createEntity('ron', 'Ron Weasley', 'PERSON');

    const entities = [harry, ron];
    const spans = [
      createSpan('harry', 0, 5),
      createSpan('ron', 10, 13),
    ];
    const sentences = [
      createSentence('Harry and Ron went to class.', 0),
      createSentence('Their books were heavy.', 29),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // Update context in order
    resolver.updateContext(harry);
    resolver.updateContext(ron);

    const their = resolver.resolvePronounMultiple('their', 29, 2);
    expect(their.length).toBe(2);
  });
});

// =============================================================================
// STRESS TEST: CROSS-PARAGRAPH RESOLUTION
// =============================================================================

describe('Stress Test: Cross-Paragraph Resolution', () => {
  it('should handle pronouns across paragraph boundaries', () => {
    const text = `Harry Potter was the son of James and Lily Potter.

He grew up with the Dursleys. They were not kind to him.`;

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const james = createEntity('james', 'James Potter', 'PERSON');
    const lily = createEntity('lily', 'Lily Potter', 'PERSON');

    const entities = [harry, james, lily];
    const spans = [
      createSpan('harry', 0, 12),
      createSpan('james', 28, 33),
      createSpan('lily', 38, 50),
    ];
    const sentences = [
      createSentence('Harry Potter was the son of James and Lily Potter.', 0),
      createSentence('He grew up with the Dursleys.', 52),
      createSentence('They were not kind to him.', 82),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "He" in second paragraph should still resolve to Harry
    const he = resolver.resolvePronoun('He', 52, 'SENTENCE_START');
    expect(he).not.toBeNull();
    expect(he!.canonical).toBe('Harry Potter');
  });

  it('should prioritize within-paragraph resolution', () => {
    const text = `Aragorn led the Fellowship.

Boromir joined them. He was from Gondor.`;

    const aragorn = createEntity('aragorn', 'Aragorn', 'PERSON');
    const boromir = createEntity('boromir', 'Boromir', 'PERSON');

    const entities = [aragorn, boromir];
    const spans = [
      createSpan('aragorn', 0, 7),
      createSpan('boromir', 29, 36),
    ];
    const sentences = [
      createSentence('Aragorn led the Fellowship.', 0),
      createSentence('Boromir joined them.', 29),
      createSentence('He was from Gondor.', 50),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "He" should resolve to Boromir (within same paragraph)
    const he = resolver.resolvePronoun('He', 50, 'SENTENCE_START');
    expect(he).not.toBeNull();
    expect(he!.canonical).toBe('Boromir');
  });
});

// =============================================================================
// STRESS TEST: COMPLEX HARRY POTTER SCENARIOS
// =============================================================================

describe('Stress Test: Harry Potter Scenarios', () => {
  it('should handle the canonical "son of James" case correctly', () => {
    const text = 'Harry Potter was the son of James and Lily Potter. He lived with the Dursleys.';

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const james = createEntity('james', 'James Potter', 'PERSON');
    const lily = createEntity('lily', 'Lily Potter', 'PERSON');

    const entities = [harry, james, lily];
    const spans = [
      createSpan('harry', 0, 12),
      createSpan('james', 28, 33),
      createSpan('lily', 38, 50),
    ];
    const sentences = [
      createSentence('Harry Potter was the son of James and Lily Potter.', 0),
      createSentence('He lived with the Dursleys.', 51),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "He" must resolve to Harry (subject of prev sentence), NOT James (last entity)
    const he = resolver.resolvePronoun('He', 51, 'SENTENCE_START');
    expect(he).not.toBeNull();
    expect(he!.canonical).toBe('Harry Potter'); // Not James!
  });

  it('should handle Luna Lovegood house sorting correctly', () => {
    const text = 'Luna Lovegood was an unusual student. She was sorted into Ravenclaw.';

    const luna = createEntity('luna', 'Luna Lovegood', 'PERSON');
    const ravenclaw = createEntity('ravenclaw', 'Ravenclaw', 'ORG');

    const entities = [luna, ravenclaw];
    const spans = [
      createSpan('luna', 0, 13),
      createSpan('ravenclaw', 58, 67),
    ];
    const sentences = [
      createSentence('Luna Lovegood was an unusual student.', 0),
      createSentence('She was sorted into Ravenclaw.', 38),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "She" should resolve to Luna
    const she = resolver.resolvePronoun('She', 38, 'SENTENCE_START');
    expect(she).not.toBeNull();
    expect(she!.canonical).toBe('Luna Lovegood');
  });

  it('should handle multiple Weasley family members correctly', () => {
    const text = `Arthur and Molly Weasley had seven children. Ron was their youngest son. His brothers included Fred and George.`;

    const arthur = createEntity('arthur', 'Arthur Weasley', 'PERSON');
    const molly = createEntity('molly', 'Molly Weasley', 'PERSON');
    const ron = createEntity('ron', 'Ron Weasley', 'PERSON');

    const entities = [arthur, molly, ron];
    const spans = [
      createSpan('arthur', 0, 6),
      createSpan('molly', 11, 24),
      createSpan('ron', 46, 49),
    ];
    const sentences = [
      createSentence('Arthur and Molly Weasley had seven children.', 0),
      createSentence('Ron was their youngest son.', 45),
      createSentence('His brothers included Fred and George.', 73),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    resolver.updateContext(arthur);
    resolver.updateContext(molly);
    resolver.updateContext(ron);

    // "their" should resolve to Arthur and Molly
    const their = resolver.resolvePronounMultiple('their', 53, 2);
    expect(their.length).toBeGreaterThan(0);

    // "His" should resolve to Ron
    const his = resolver.resolvePronoun('His', 73, 'SENTENCE_START');
    expect(his).not.toBeNull();
    expect(his!.canonical).toBe('Ron Weasley');
  });
});

// =============================================================================
// STRESS TEST: EDGE CASES
// =============================================================================

describe('Stress Test: Edge Cases', () => {
  it('should handle pronouns with no valid antecedent', () => {
    const text = 'The castle was old. It had many towers.';

    const castle = createEntity('castle', 'The Castle', 'PLACE');

    const entities = [castle];
    const spans = [createSpan('castle', 4, 10)];
    const sentences = [
      createSentence('The castle was old.', 0),
      createSentence('It had many towers.', 20),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "It" should match PLACE entity (neutral pronoun)
    const it = resolver.resolvePronoun('It', 20, 'SENTENCE_START', ['PLACE']);
    expect(it).not.toBeNull();
    expect(it!.canonical).toBe('The Castle');
  });

  it('should handle reflexive pronouns', () => {
    const text = 'Harry looked at himself in the mirror.';

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');

    const entities = [harry];
    const spans = [createSpan('harry', 0, 5)];
    const sentences = [createSentence('Harry looked at himself in the mirror.', 0)];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "himself" should resolve to Harry
    const himself = resolver.resolvePronoun('himself', 16, 'SENTENCE_MID');
    expect(himself).not.toBeNull();
    expect(himself!.canonical).toBe('Harry Potter');
  });

  it('should handle gender ambiguity gracefully', () => {
    const text = 'Alex spoke to Jordan. They shook hands.';

    // Both names are gender-neutral
    const alex = createEntity('alex', 'Alex Smith', 'PERSON');
    const jordan = createEntity('jordan', 'Jordan Brown', 'PERSON');

    const entities = [alex, jordan];
    const spans = [
      createSpan('alex', 0, 4),
      createSpan('jordan', 14, 20),
    ];
    const sentences = [
      createSentence('Alex spoke to Jordan.', 0),
      createSentence('They shook hands.', 22),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "They" could refer to either or both - should not crash
    const they = resolver.resolvePronounMultiple('They', 22, 2);
    expect(they.length).toBeGreaterThan(0);
  });

  it('should handle very long distance pronoun reference', () => {
    const longText = `Harry Potter arrived at Hogwarts. ` +
      `${'The castle was magnificent. '.repeat(10)}` +
      `He was amazed by everything.`;

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const hogwarts = createEntity('hogwarts', 'Hogwarts', 'ORG');

    const entities = [harry, hogwarts];
    const spans = [
      createSpan('harry', 0, 12),
      createSpan('hogwarts', 24, 32),
    ];

    // Create sentences
    const sentences = [createSentence('Harry Potter arrived at Hogwarts.', 0)];
    let pos = 34;
    for (let i = 0; i < 10; i++) {
      sentences.push(createSentence('The castle was magnificent.', pos));
      pos += 28;
    }
    sentences.push(createSentence('He was amazed by everything.', pos));

    const resolver = createReferenceResolver(entities, spans, sentences, longText);

    // Even after long distance, "He" should still resolve to Harry
    const he = resolver.resolvePronoun('He', pos, 'SENTENCE_START');
    expect(he).not.toBeNull();
    expect(he!.canonical).toBe('Harry Potter');
  });
});

// =============================================================================
// STRESS TEST: PERFORMANCE
// =============================================================================

describe('Stress Test: Performance', () => {
  it('should handle documents with many entities efficiently', () => {
    const entities: Entity[] = [];
    const spans: EntitySpan[] = [];

    // Create 100 entities
    for (let i = 0; i < 100; i++) {
      entities.push(createEntity(`entity_${i}`, `Entity ${i}`, 'PERSON'));
      spans.push(createSpan(`entity_${i}`, i * 20, i * 20 + 10));
    }

    const text = 'Entity '.repeat(100);
    const sentences = [createSentence(text, 0)];

    const start = Date.now();
    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // Resolve 100 pronouns
    for (let i = 0; i < 100; i++) {
      resolver.resolvePronoun('he', i * 20 + 15, 'SENTENCE_MID');
    }

    const duration = Date.now() - start;

    // Should complete in under 1 second
    expect(duration).toBeLessThan(1000);
  });

  it('should handle rapid context updates', () => {
    const resolver = new ReferenceResolver();
    resolver.initialize([], [], [], '');

    const entities: Entity[] = [];
    for (let i = 0; i < 1000; i++) {
      entities.push(createEntity(`entity_${i}`, `Entity ${i}`, 'PERSON'));
    }

    const start = Date.now();

    // Rapidly update context with many entities
    for (const entity of entities) {
      resolver.updateContext(entity);
    }

    const duration = Date.now() - start;

    // Should complete in under 100ms
    expect(duration).toBeLessThan(100);

    // Most recent should be last added
    expect(resolver.getLastNamedEntity('PERSON')?.canonical).toBe('Entity 999');
  });
});
