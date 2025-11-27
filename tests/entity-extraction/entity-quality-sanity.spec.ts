/**
 * Entity Quality Sanity Tests
 *
 * Tests for the lexical sanity filter (Phase 2) to ensure
 * we reject obviously bad entities across all text types.
 *
 * These are synthetic test cases that reproduce generic patterns
 * of entity extraction failures, NOT tuned for any specific chapter or text.
 */

import { describe, it, expect } from 'vitest';
import { isLexicallyValidEntityName } from '../../app/engine/entity-quality-filter';

describe('Entity Quality Sanity - Global Stopwords', () => {
  it('should reject pronouns as entities', () => {
    expect(isLexicallyValidEntityName('he', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('she', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('it', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('they', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('him', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('her', 'PERSON')).toBe(false);
  });

  it('should reject demonstratives and determiners', () => {
    expect(isLexicallyValidEntityName('this', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('that', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('the', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('a', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('an', 'ITEM')).toBe(false);
  });

  it('should reject high-frequency verbs and discourse markers', () => {
    expect(isLexicallyValidEntityName('like', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('just', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('really', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('maybe', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('however', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('therefore', 'PERSON')).toBe(false);
  });

  it('should reject common verbs (even when capitalized)', () => {
    expect(isLexicallyValidEntityName('walk', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('run', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('go', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('make', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('get', 'PERSON')).toBe(false);
  });

  it('should reject generic abstract nouns', () => {
    expect(isLexicallyValidEntityName('thing', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('stuff', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('person', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('people', 'PERSON')).toBe(false);
    expect(isLexicallyValidEntityName('place', 'PLACE')).toBe(false);
  });
});

describe('Entity Quality Sanity - Sentence-Initial Capitalization', () => {
  it('should reject sentence-initial capitalized function words as PERSON', () => {
    // "Song has played longer than..."
    expect(isLexicallyValidEntityName('Song', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: false
    })).toBe(false);

    // "Perched on the ledge..."
    expect(isLexicallyValidEntityName('Perched', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: false
    })).toBe(false);

    // "Like many others..."
    expect(isLexicallyValidEntityName('Like', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: false
    })).toBe(false);

    // "Familiar faces greeted..."
    expect(isLexicallyValidEntityName('Familiar', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: false
    })).toBe(false);
  });

  it('should allow sentence-initial names with NER support', () => {
    expect(isLexicallyValidEntityName('Song', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: true  // NER says it's a PERSON
    })).toBe(true);
  });

  it('should allow names that also occur non-initially', () => {
    expect(isLexicallyValidEntityName('Song', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: true,  // Also appears mid-sentence
      hasNERSupport: false
    })).toBe(true);
  });
});

describe('Entity Quality Sanity - PERSON type-specific', () => {
  it('should allow multi-word proper names', () => {
    expect(isLexicallyValidEntityName('Charles Garrison', 'PERSON')).toBe(true);
    expect(isLexicallyValidEntityName('Mary Jane', 'PERSON')).toBe(true);
    expect(isLexicallyValidEntityName('Harry Potter', 'PERSON')).toBe(true);
  });

  it('should allow names with title prefixes', () => {
    expect(isLexicallyValidEntityName('Mr Smith', 'PERSON')).toBe(true);
    expect(isLexicallyValidEntityName('Dr Jones', 'PERSON')).toBe(true);
    expect(isLexicallyValidEntityName('Professor McGonagall', 'PERSON')).toBe(true);
    expect(isLexicallyValidEntityName('King Arthur', 'PERSON')).toBe(true);
  });

  it('should reject common abstract nouns when sentence-initial-only', () => {
    // These SHOULD be rejected when they only appear sentence-initially (no NER, no other occurrences)
    expect(isLexicallyValidEntityName('Justice', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: false
    })).toBe(false);

    expect(isLexicallyValidEntityName('Darkness', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: false
    })).toBe(false);

    expect(isLexicallyValidEntityName('Learning', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: false
    })).toBe(false);

    expect(isLexicallyValidEntityName('Listen', 'PERSON', undefined, {
      isSentenceInitial: true,
      occursNonInitial: false,
      hasNERSupport: false
    })).toBe(false);
  });

  it('should allow abstract nouns when used as actual names (with NER or non-initial occurrences)', () => {
    // "Justice" could be a valid name if NER says so or if it appears non-initially
    expect(isLexicallyValidEntityName('Justice', 'PERSON', undefined, {
      hasNERSupport: true
    })).toBe(true);

    expect(isLexicallyValidEntityName('Song', 'PERSON', undefined, {
      occursNonInitial: true
    })).toBe(true);
  });
});

describe('Entity Quality Sanity - RACE type-specific', () => {
  it('should allow known races and demonyms', () => {
    expect(isLexicallyValidEntityName('human', 'RACE')).toBe(true);
    expect(isLexicallyValidEntityName('elf', 'RACE')).toBe(true);
    expect(isLexicallyValidEntityName('dwarf', 'RACE')).toBe(true);
    expect(isLexicallyValidEntityName('American', 'RACE')).toBe(true);
    expect(isLexicallyValidEntityName('Martian', 'RACE')).toBe(true);
    expect(isLexicallyValidEntityName('Egyptian', 'RACE')).toBe(true);
  });

  it('should reject gerunds (-ing forms) as RACE', () => {
    // "The stabbing shocked the citizens"
    expect(isLexicallyValidEntityName('stabbing', 'RACE')).toBe(false);
    expect(isLexicallyValidEntityName('learning', 'RACE')).toBe(false);
    expect(isLexicallyValidEntityName('running', 'RACE')).toBe(false);
  });

  it('should reject generic group nouns as RACE', () => {
    // "citizens" from "most of the citizens have been alive"
    expect(isLexicallyValidEntityName('citizens', 'RACE')).toBe(false);
    expect(isLexicallyValidEntityName('people', 'RACE')).toBe(false);
    expect(isLexicallyValidEntityName('folks', 'RACE')).toBe(false);
    expect(isLexicallyValidEntityName('crowd', 'RACE')).toBe(false);
    expect(isLexicallyValidEntityName('men', 'RACE')).toBe(false);
    expect(isLexicallyValidEntityName('women', 'RACE')).toBe(false);
  });
});

describe('Entity Quality Sanity - SPECIES type-specific', () => {
  it('should allow known species/creatures', () => {
    expect(isLexicallyValidEntityName('dragon', 'SPECIES')).toBe(true);
    expect(isLexicallyValidEntityName('phoenix', 'SPECIES')).toBe(true);
    expect(isLexicallyValidEntityName('wolf', 'SPECIES')).toBe(true);
    expect(isLexicallyValidEntityName('cat', 'SPECIES')).toBe(true);
  });

  it('should reject verbs as SPECIES', () => {
    expect(isLexicallyValidEntityName('break', 'SPECIES')).toBe(false);
    expect(isLexicallyValidEntityName('run', 'SPECIES')).toBe(false);
    expect(isLexicallyValidEntityName('walk', 'SPECIES')).toBe(false);
  });
});

describe('Entity Quality Sanity - ITEM type-specific', () => {
  it('should allow concrete noun phrases', () => {
    expect(isLexicallyValidEntityName('record player', 'ITEM')).toBe(true);
    expect(isLexicallyValidEntityName('front gate', 'ITEM')).toBe(true);
    expect(isLexicallyValidEntityName('Pool of Souls', 'ITEM')).toBe(true);
    expect(isLexicallyValidEntityName('Elder Wand', 'ITEM')).toBe(true);
    expect(isLexicallyValidEntityName('sword', 'ITEM')).toBe(true);
  });

  it('should reject verb-headed action fragments', () => {
    // "He decided to walk past the house"
    expect(isLexicallyValidEntityName('walk past', 'ITEM')).toBe(false);

    // "and not help"
    expect(isLexicallyValidEntityName('not help', 'ITEM')).toBe(false);

    // Other action fragments
    expect(isLexicallyValidEntityName('do it', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('kill him', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('get out', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('access this', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('slowed to', 'ITEM')).toBe(false);
  });

  it('should reject pronoun-heavy phrases', () => {
    expect(isLexicallyValidEntityName('it', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('him', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('her', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('them', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('help him', 'ITEM')).toBe(false);
  });

  it('should reject short function-word phrases', () => {
    expect(isLexicallyValidEntityName('the', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('to go', 'ITEM')).toBe(false);
    expect(isLexicallyValidEntityName('not be', 'ITEM')).toBe(false);
  });
});

describe('Entity Quality Sanity - Integration Test with Full Extraction', () => {
  // NOTE: This test would require the full extraction pipeline
  // For now, it's documented but commented out
  // Uncomment and implement once extraction can be called with text input

  it.skip('should reject junk entities from narrative prose', async () => {
    // Test sentence 1: Sentence-initial non-name
    const text1 = "Song has played longer than most of the citizens have been alive.";
    // Expected: NO entity "Song" (PERSON), NO entity "citizens" (RACE)

    // Test sentence 2: Action fragments
    const text2 = "He decided to walk past the house and not help.";
    // Expected: NO entity "walk past" (ITEM), NO entity "not help" (ITEM)

    // Test sentence 3: Gerunds and group nouns
    const text3 = "The stabbing shocked the citizens.";
    // Expected: NO entity "stabbing" (RACE), NO entity "citizens" (RACE)

    // TODO: Wire up full extraction and assert on results
  });
});
