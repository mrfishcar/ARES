/**
 * ReferenceResolver Test Suite
 *
 * Comprehensive tests for the unified reference resolution service.
 * Tests pronoun resolution, gender inference, context tracking, and coref linking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ReferenceResolver,
  createReferenceResolver,
  isPronoun,
  inferGender,
  matchesGenderNumber,
  type EntitySpan,
  type Sentence,
} from '../../app/engine/reference-resolver';
import type { Entity, EntityType } from '../../app/engine/schema';

// =============================================================================
// TEST FIXTURES
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
    firstMention: 0,
    mentionCount: 1,
    sources: ['test'],
  };
}

function createSpan(entity_id: string, start: number, end: number, text?: string): EntitySpan {
  return { entity_id, start, end, text };
}

function createSentence(text: string, start: number): Sentence {
  return { text, start, end: start + text.length };
}

// =============================================================================
// PRONOUN DETECTION TESTS
// =============================================================================

describe('Pronoun Detection', () => {
  it('should identify subject pronouns', () => {
    expect(isPronoun('he')).toBe(true);
    expect(isPronoun('she')).toBe(true);
    expect(isPronoun('they')).toBe(true);
    expect(isPronoun('it')).toBe(true);
    expect(isPronoun('He')).toBe(true);
    expect(isPronoun('SHE')).toBe(true);
  });

  it('should identify object pronouns', () => {
    expect(isPronoun('him')).toBe(true);
    expect(isPronoun('her')).toBe(true);
    expect(isPronoun('them')).toBe(true);
  });

  it('should identify possessive pronouns', () => {
    expect(isPronoun('his')).toBe(true);
    expect(isPronoun('their')).toBe(true);
    expect(isPronoun('its')).toBe(true);
  });

  it('should identify reflexive pronouns', () => {
    expect(isPronoun('himself')).toBe(true);
    expect(isPronoun('herself')).toBe(true);
    expect(isPronoun('themselves')).toBe(true);
  });

  it('should reject non-pronouns', () => {
    expect(isPronoun('Harry')).toBe(false);
    expect(isPronoun('the')).toBe(false);
    expect(isPronoun('wizard')).toBe(false);
    expect(isPronoun('')).toBe(false);
  });
});

// =============================================================================
// GENDER INFERENCE TESTS
// =============================================================================

describe('Gender Inference', () => {
  it('should infer male gender from known names', () => {
    const harry = createEntity('1', 'Harry Potter', 'PERSON');
    const ron = createEntity('2', 'Ron Weasley', 'PERSON');
    const aragorn = createEntity('3', 'Aragorn', 'PERSON');

    expect(inferGender(harry)).toBe('male');
    expect(inferGender(ron)).toBe('male');
    expect(inferGender(aragorn)).toBe('male');
  });

  it('should infer female gender from known names', () => {
    const hermione = createEntity('1', 'Hermione Granger', 'PERSON');
    const ginny = createEntity('2', 'Ginny Weasley', 'PERSON');
    const arwen = createEntity('3', 'Arwen', 'PERSON');
    const lily = createEntity('4', 'Lily Potter', 'PERSON');

    expect(inferGender(hermione)).toBe('female');
    expect(inferGender(ginny)).toBe('female');
    expect(inferGender(arwen)).toBe('female');
    expect(inferGender(lily)).toBe('female');
  });

  it('should infer gender from title patterns', () => {
    const king = createEntity('1', 'King Théoden', 'PERSON');
    const queen = createEntity('2', 'Queen Elizabeth', 'PERSON');
    const lord = createEntity('3', 'Lord Voldemort', 'PERSON');
    const lady = createEntity('4', 'Lady Galadriel', 'PERSON');

    expect(inferGender(king)).toBe('male');
    expect(inferGender(queen)).toBe('female');
    expect(inferGender(lord)).toBe('male');
    expect(inferGender(lady)).toBe('female');
  });

  it('should return neutral for non-PERSON entities', () => {
    const hogwarts = createEntity('1', 'Hogwarts', 'ORG');
    const london = createEntity('2', 'London', 'PLACE');

    expect(inferGender(hogwarts)).toBe('neutral');
    expect(inferGender(london)).toBe('neutral');
  });

  it('should return unknown for ambiguous PERSON entities', () => {
    const unknown = createEntity('1', 'Unknown Stranger', 'PERSON');
    expect(inferGender(unknown)).toBe('unknown');
  });
});

// =============================================================================
// GENDER/NUMBER MATCHING TESTS
// =============================================================================

describe('Gender/Number Matching', () => {
  it('should match male pronouns to male entities', () => {
    const harry = createEntity('1', 'Harry Potter', 'PERSON');
    expect(matchesGenderNumber(harry, 'he')).toBe(true);
    expect(matchesGenderNumber(harry, 'him')).toBe(true);
    expect(matchesGenderNumber(harry, 'his')).toBe(true);
    expect(matchesGenderNumber(harry, 'himself')).toBe(true);
  });

  it('should not match female pronouns to male entities', () => {
    const harry = createEntity('1', 'Harry Potter', 'PERSON');
    expect(matchesGenderNumber(harry, 'she')).toBe(false);
    expect(matchesGenderNumber(harry, 'her')).toBe(false);
    expect(matchesGenderNumber(harry, 'herself')).toBe(false);
  });

  it('should match female pronouns to female entities', () => {
    const hermione = createEntity('1', 'Hermione Granger', 'PERSON');
    expect(matchesGenderNumber(hermione, 'she')).toBe(true);
    expect(matchesGenderNumber(hermione, 'her')).toBe(true);
    expect(matchesGenderNumber(hermione, 'herself')).toBe(true);
  });

  it('should not match male pronouns to female entities', () => {
    const hermione = createEntity('1', 'Hermione Granger', 'PERSON');
    expect(matchesGenderNumber(hermione, 'he')).toBe(false);
    expect(matchesGenderNumber(hermione, 'him')).toBe(false);
    expect(matchesGenderNumber(hermione, 'himself')).toBe(false);
  });

  it('should match plural pronouns to any entity', () => {
    const harry = createEntity('1', 'Harry Potter', 'PERSON');
    const hermione = createEntity('2', 'Hermione Granger', 'PERSON');
    expect(matchesGenderNumber(harry, 'they')).toBe(true);
    expect(matchesGenderNumber(hermione, 'they')).toBe(true);
    expect(matchesGenderNumber(harry, 'them')).toBe(true);
    expect(matchesGenderNumber(hermione, 'their')).toBe(true);
  });

  it('should match unknown gender entities to gendered pronouns', () => {
    // Unknown gender can match any pronoun (we don't know if it's wrong)
    const unknown = createEntity('1', 'Unknown Person', 'PERSON');
    expect(matchesGenderNumber(unknown, 'he')).toBe(true);
    expect(matchesGenderNumber(unknown, 'she')).toBe(true);
  });

  it('should match neutral pronouns to non-PERSON entities', () => {
    const hogwarts = createEntity('1', 'Hogwarts', 'ORG');
    expect(matchesGenderNumber(hogwarts, 'it')).toBe(true);
    expect(matchesGenderNumber(hogwarts, 'its')).toBe(true);
  });

  it('should not match neutral pronouns to PERSON entities', () => {
    const harry = createEntity('1', 'Harry Potter', 'PERSON');
    expect(matchesGenderNumber(harry, 'it')).toBe(false);
    expect(matchesGenderNumber(harry, 'its')).toBe(false);
  });
});

// =============================================================================
// PRONOUN RESOLUTION TESTS
// =============================================================================

describe('Pronoun Resolution', () => {
  let resolver: ReferenceResolver;

  const harry = createEntity('harry', 'Harry Potter', 'PERSON');
  const james = createEntity('james', 'James Potter', 'PERSON');
  const lily = createEntity('lily', 'Lily Potter', 'PERSON');
  const ron = createEntity('ron', 'Ron Weasley', 'PERSON');
  const hogwarts = createEntity('hogwarts', 'Hogwarts', 'ORG');

  beforeEach(() => {
    resolver = new ReferenceResolver();
  });

  describe('Sentence-Start Resolution', () => {
    it('should resolve subject pronoun to subject of previous sentence', () => {
      // "Harry Potter was the son of James and Lily Potter. He lived with the Dursleys."
      const text = 'Harry Potter was the son of James and Lily Potter. He lived with the Dursleys.';
      const entities = [harry, james, lily];
      const spans = [
        createSpan('harry', 0, 12),  // "Harry Potter"
        createSpan('james', 28, 33), // "James"
        createSpan('lily', 38, 50),  // "Lily Potter"
      ];
      const sentences = [
        createSentence('Harry Potter was the son of James and Lily Potter.', 0),
        createSentence('He lived with the Dursleys.', 51),
      ];

      resolver.initialize(entities, spans, sentences, text);

      // "He" at position 51 should resolve to Harry (subject of prev sentence)
      const resolved = resolver.resolvePronoun('He', 51, 'SENTENCE_START');
      expect(resolved).not.toBeNull();
      expect(resolved!.canonical).toBe('Harry Potter');
    });

    it('should resolve possessive pronoun to most recent entity', () => {
      // "Ron came from a large family. His father Arthur worked at the Ministry."
      const text = 'Ron came from a large family. His father Arthur worked at the Ministry.';
      const entities = [ron];
      const spans = [createSpan('ron', 0, 3)];
      const sentences = [
        createSentence('Ron came from a large family.', 0),
        createSentence('His father Arthur worked at the Ministry.', 30),
      ];

      resolver.initialize(entities, spans, sentences, text);

      // "His" at position 30 should resolve to Ron
      const resolved = resolver.resolvePronoun('His', 30, 'SENTENCE_START');
      expect(resolved).not.toBeNull();
      expect(resolved!.canonical).toBe('Ron Weasley');
    });
  });

  describe('Mid-Sentence Resolution', () => {
    it('should resolve pronoun to most recent matching entity', () => {
      // "Harry met Hermione. They studied together and he helped her."
      const hermione = createEntity('hermione', 'Hermione Granger', 'PERSON');
      const text = 'Harry met Hermione. They studied together and he helped her.';
      const entities = [harry, hermione];
      const spans = [
        createSpan('harry', 0, 5),
        createSpan('hermione', 10, 18),
      ];
      const sentences = [
        createSentence('Harry met Hermione.', 0),
        createSentence('They studied together and he helped her.', 20),
      ];

      resolver.initialize(entities, spans, sentences, text);

      // "he" should resolve to Harry (most recent male)
      const resolvedHe = resolver.resolvePronoun('he', 46, 'SENTENCE_MID');
      expect(resolvedHe).not.toBeNull();
      expect(resolvedHe!.canonical).toBe('Harry Potter');

      // "her" should resolve to Hermione (most recent female)
      const resolvedHer = resolver.resolvePronoun('her', 56, 'SENTENCE_MID');
      expect(resolvedHer).not.toBeNull();
      expect(resolvedHer!.canonical).toBe('Hermione Granger');
    });

    it('should respect gender constraints', () => {
      const text = 'Lily spoke to James. She was worried about him.';
      const entities = [lily, james];
      const spans = [
        createSpan('lily', 0, 4),
        createSpan('james', 14, 19),
      ];
      const sentences = [
        createSentence('Lily spoke to James.', 0),
        createSentence('She was worried about him.', 21),
      ];

      resolver.initialize(entities, spans, sentences, text);

      // "She" should resolve to Lily (female)
      const resolvedShe = resolver.resolvePronoun('She', 21, 'SENTENCE_MID');
      expect(resolvedShe).not.toBeNull();
      expect(resolvedShe!.canonical).toBe('Lily Potter');

      // "him" should resolve to James (male)
      const resolvedHim = resolver.resolvePronoun('him', 43, 'SENTENCE_MID');
      expect(resolvedHim).not.toBeNull();
      expect(resolvedHim!.canonical).toBe('James Potter');
    });
  });

  describe('Context Tracking', () => {
    it('should update context with entities', () => {
      resolver.initialize([], [], [], '');

      resolver.updateContext(harry);
      expect(resolver.getLastNamedEntity('PERSON')?.canonical).toBe('Harry Potter');

      resolver.updateContext(ron);
      expect(resolver.getLastNamedEntity('PERSON')?.canonical).toBe('Ron Weasley');

      // Recent entities should maintain order
      const recent = resolver.getRecentEntities('PERSON', 3);
      expect(recent.length).toBe(2);
      expect(recent[0].canonical).toBe('Ron Weasley');
      expect(recent[1].canonical).toBe('Harry Potter');
    });

    it('should track multiple entity types', () => {
      const london = createEntity('london', 'London', 'PLACE');
      resolver.initialize([], [], [], '');

      resolver.updateContext(harry);
      resolver.updateContext(hogwarts);
      resolver.updateContext(london);

      expect(resolver.getLastNamedEntity('PERSON')?.canonical).toBe('Harry Potter');
      expect(resolver.getLastNamedEntity('ORG')?.canonical).toBe('Hogwarts');
      expect(resolver.getLastNamedEntity('PLACE')?.canonical).toBe('London');
    });
  });

  describe('Plural Pronoun Resolution', () => {
    it('should resolve "their" to multiple entities', () => {
      const text = 'Harry and Ron went to class. Their books were heavy.';
      const entities = [harry, ron];
      const spans = [
        createSpan('harry', 0, 5),
        createSpan('ron', 10, 13),
      ];
      const sentences = [
        createSentence('Harry and Ron went to class.', 0),
        createSentence('Their books were heavy.', 29),
      ];

      resolver.initialize(entities, spans, sentences, text);

      // Update context in order
      resolver.updateContext(harry);
      resolver.updateContext(ron);

      const resolved = resolver.resolvePronounMultiple('their', 29, 2);
      expect(resolved.length).toBe(2);
      expect(resolved.map(r => r.canonical)).toContain('Harry Potter');
      expect(resolved.map(r => r.canonical)).toContain('Ron Weasley');
    });
  });
});

// =============================================================================
// COREF LINK MANAGEMENT TESTS
// =============================================================================

describe('Coref Link Management', () => {
  it('should add and retrieve coref links', () => {
    const resolver = new ReferenceResolver();
    resolver.initialize([], [], [], '');

    resolver.addCorefLink({
      mention: { text: 'he', start: 50, end: 52, sentence_index: 1, type: 'pronoun' },
      entity_id: 'harry',
      confidence: 0.75,
      method: 'pronoun',
    });

    const links = resolver.getCorefLinks();
    expect(links.links.length).toBe(1);
    expect(links.links[0].entity_id).toBe('harry');
  });

  it('should build pronoun map from coref links', () => {
    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const resolver = new ReferenceResolver();
    resolver.initialize([harry], [], [], '');

    resolver.buildPronounMap([
      {
        mention: { text: 'he', start: 50, end: 52, sentence_index: 1, type: 'pronoun' },
        entity_id: 'harry',
        confidence: 0.75,
        method: 'pronoun',
      },
    ]);

    // Now pattern match resolution should use the map
    const resolved = resolver.resolvePronoun('he', 51, 'PATTERN_MATCH');
    expect(resolved).not.toBeNull();
    expect(resolved!.canonical).toBe('Harry Potter');
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty text', () => {
    const resolver = new ReferenceResolver();
    resolver.initialize([], [], [], '');

    const resolved = resolver.resolvePronoun('he', 0, 'SENTENCE_MID');
    expect(resolved).toBeNull();
  });

  it('should handle no matching entities', () => {
    const hogwarts = createEntity('hogwarts', 'Hogwarts', 'ORG');
    const resolver = new ReferenceResolver();
    resolver.initialize([hogwarts], [], [], '');

    // "he" should not resolve to ORG entity
    const resolved = resolver.resolvePronoun('he', 0, 'SENTENCE_MID', ['PERSON']);
    expect(resolved).toBeNull();
  });

  it('should handle position beyond text gracefully', () => {
    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const text = 'Harry went home.';
    const resolver = new ReferenceResolver();
    resolver.initialize([harry], [createSpan('harry', 0, 5)], [], text);

    // Position beyond text length - should still find entity (it exists before position)
    const resolved = resolver.resolvePronoun('he', 1000, 'SENTENCE_MID');
    // This is acceptable behavior - we have a valid entity before the position
    expect(resolved?.canonical).toBe('Harry Potter');
  });

  it('should handle ambiguous gender gracefully', () => {
    // Two entities with unknown gender
    const alex = createEntity('alex', 'Alex Smith', 'PERSON');
    const jordan = createEntity('jordan', 'Jordan Brown', 'PERSON');
    const text = 'Alex met Jordan. He said hello.';
    const resolver = new ReferenceResolver();
    resolver.initialize(
      [alex, jordan],
      [createSpan('alex', 0, 4), createSpan('jordan', 9, 15)],
      [createSentence('Alex met Jordan.', 0), createSentence('He said hello.', 17)],
      text
    );

    // Should resolve to most recent (Jordan) even with ambiguous gender
    const resolved = resolver.resolvePronoun('He', 17, 'SENTENCE_START');
    expect(resolved).not.toBeNull();
    // Either is acceptable since gender is unknown
    expect(['Alex Smith', 'Jordan Brown']).toContain(resolved!.canonical);
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Integration: Full Text Processing', () => {
  it('should handle Harry Potter narrative correctly', () => {
    const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

    const harry = createEntity('harry', 'Harry Potter', 'PERSON');
    const james = createEntity('james', 'James Potter', 'PERSON');
    const lily = createEntity('lily', 'Lily Potter', 'PERSON');
    const ron = createEntity('ron', 'Ron Weasley', 'PERSON');
    const privet = createEntity('privet', 'Privet Drive', 'PLACE');

    const entities = [harry, james, lily, ron, privet];
    const spans = [
      createSpan('harry', 0, 12),
      createSpan('james', 28, 33),
      createSpan('lily', 38, 50),
      createSpan('privet', 80, 92),
      createSpan('ron', 122, 133),
      createSpan('ron', 135, 138), // "Ron" again
    ];
    const sentences = [
      createSentence('Harry Potter was the son of James and Lily Potter.', 0),
      createSentence('He lived with the Dursleys in Privet Drive.', 51),
      createSentence("Harry's best friend was Ron Weasley.", 96),
      createSentence('Ron came from a large wizarding family.', 133),
      createSentence('His father Arthur worked at the Ministry of Magic.', 173),
    ];

    const resolver = createReferenceResolver(entities, spans, sentences, text);

    // "He" in sentence 2 should resolve to Harry (subject of sentence 1)
    const he = resolver.resolvePronoun('He', 51, 'SENTENCE_START');
    expect(he).not.toBeNull();
    expect(he!.canonical).toBe('Harry Potter');

    // "His" in sentence 5 should resolve to Ron (most recent male in previous sentence)
    const his = resolver.resolvePronoun('His', 173, 'SENTENCE_START');
    expect(his).not.toBeNull();
    expect(his!.canonical).toBe('Ron Weasley');
  });
});
