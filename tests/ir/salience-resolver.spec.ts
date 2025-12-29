/**
 * Tests for Salience-Based Pronoun Resolver
 *
 * Tests the deterministic pronoun resolution system that uses
 * recency, grammatical role, and gender matching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SalienceResolver,
  inferGender,
  getGrammaticalRole,
  resolvePronouns,
  type SalienceConfig,
  type ResolvedPronoun,
} from '../../app/engine/ir/salience-resolver';
import type { ParsedSentence, EntitySpan } from '../../app/engine/ir/predicate-extractor';

// =============================================================================
// GENDER INFERENCE TESTS
// =============================================================================

describe('inferGender', () => {
  it('should identify male names', () => {
    expect(inferGender('Marcus')).toBe('male');
    expect(inferGender('Tom')).toBe('male');
    expect(inferGender('David Chen')).toBe('male');
  });

  it('should identify female names', () => {
    expect(inferGender('Sarah')).toBe('female');
    expect(inferGender('Martha')).toBe('female');
    expect(inferGender('Emily Johnson')).toBe('female');
  });

  it('should handle title prefixes', () => {
    expect(inferGender('Mr. Smith')).toBe('male');
    expect(inferGender('Mrs. Jones')).toBe('female');
    expect(inferGender('Ms. Williams')).toBe('female');
    expect(inferGender('Miss Chen')).toBe('female');
  });

  it('should return unknown for unrecognized names', () => {
    expect(inferGender('Xyzzy')).toBe('unknown');
    expect(inferGender('Qwerty McFoo')).toBe('unknown');
  });
});

// =============================================================================
// GRAMMATICAL ROLE TESTS
// =============================================================================

describe('getGrammaticalRole', () => {
  it('should identify subjects', () => {
    expect(getGrammaticalRole('nsubj')).toBe('subject');
    expect(getGrammaticalRole('nsubjpass')).toBe('subject');
    expect(getGrammaticalRole('csubj')).toBe('subject');
  });

  it('should identify objects', () => {
    expect(getGrammaticalRole('dobj')).toBe('object');
    expect(getGrammaticalRole('iobj')).toBe('object');
    expect(getGrammaticalRole('pobj')).toBe('object');
  });

  it('should return other for unknown labels', () => {
    expect(getGrammaticalRole('amod')).toBe('other');
    expect(getGrammaticalRole('compound')).toBe('other');
    expect(getGrammaticalRole('ROOT')).toBe('other');
  });
});

// =============================================================================
// SALIENCE RESOLVER CLASS TESTS
// =============================================================================

describe('SalienceResolver', () => {
  let resolver: SalienceResolver;

  beforeEach(() => {
    resolver = new SalienceResolver();
  });

  // === OBVIOUS RESOLUTION ===

  describe('obvious resolution', () => {
    it('should resolve "he" to only male entity in scope', () => {
      // "Marcus entered. He sat down."
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('He', 20, 1);

      expect(result.resolvedEntityId).toBe('entity-marcus');
      expect(result.resolvedName).toBe('Marcus');
      expect(result.method).toBe('gender-unique');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should resolve "she" to only female entity in scope', () => {
      // "Sarah smiled. She waved."
      resolver.mention('entity-sarah', 'Sarah', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('she', 15, 1);

      expect(result.resolvedEntityId).toBe('entity-sarah');
      expect(result.resolvedName).toBe('Sarah');
      expect(result.method).toBe('gender-unique');
    });

    it('should return UNRESOLVED when two same-gender entities have equal salience', () => {
      // "Marcus arrived. Tom followed. He nodded."
      // Both are subjects, both mentioned once → ambiguous
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      resolver.mention('entity-tom', 'Tom', 20, 1, 'subject', 'PERSON');

      const result = resolver.resolve('He', 40, 2);

      // Conservative: equal salience = ambiguous
      expect(result.resolvedEntityId).toBeNull();
      expect(result.method).toBe('unresolved');
      expect(result.unresolvedReason).toBe('ambiguous');
    });

    it('should resolve to clear winner when one has significantly more salience', () => {
      // Marcus mentioned multiple times as subject
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      resolver.mention('entity-marcus', 'Marcus', 20, 1, 'subject', 'PERSON');
      resolver.mention('entity-tom', 'Tom', 40, 2, 'object', 'PERSON');  // Object = lower weight

      const result = resolver.resolve('He', 60, 3);

      // Marcus has higher salience (2x subject vs 1x object)
      expect(result.resolvedEntityId).toBe('entity-marcus');
      expect(result.method).toBe('salience');
    });

    it('should prefer subject over object at equal recency', () => {
      // "Marcus saw Tom. He left."
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      resolver.mention('entity-tom', 'Tom', 11, 0, 'object', 'PERSON');

      const result = resolver.resolve('He', 20, 1);

      // Marcus is subject (higher weight) vs Tom as object
      expect(result.resolvedEntityId).toBe('entity-marcus');
      expect(result.method).toBe('salience');
    });

    it('should accumulate salience for repeated mentions', () => {
      // Marcus mentioned 3 times, Tom once
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      resolver.mention('entity-marcus', 'Marcus', 20, 1, 'subject', 'PERSON');
      resolver.mention('entity-marcus', 'Marcus', 40, 2, 'subject', 'PERSON');
      resolver.mention('entity-tom', 'Tom', 60, 3, 'subject', 'PERSON');

      const result = resolver.resolve('He', 80, 4);

      // Marcus should win due to accumulated salience
      expect(result.resolvedEntityId).toBe('entity-marcus');
    });
  });

  // === CONSERVATIVE BLOCKING ===

  describe('conservative blocking', () => {
    it('should return UNRESOLVED when two candidates have similar salience', () => {
      // "Marcus and Tom entered. He spoke."
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      resolver.mention('entity-tom', 'Tom', 11, 0, 'subject', 'PERSON');

      const result = resolver.resolve('He', 30, 1);

      expect(result.resolvedEntityId).toBeNull();
      expect(result.method).toBe('unresolved');
      expect(result.unresolvedReason).toBe('ambiguous');
      expect(result.candidates).toHaveLength(2);
    });

    it('should return UNRESOLVED when no candidates match gender', () => {
      // "Sarah left. He returned."
      resolver.mention('entity-sarah', 'Sarah', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('He', 15, 1);

      expect(result.resolvedEntityId).toBeNull();
      expect(result.method).toBe('unresolved');
      expect(result.unresolvedReason).toBe('gender_mismatch');
    });

    it('should return UNRESOLVED when candidate is too far away', () => {
      // Marcus mentioned 600 chars ago
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('He', 600, 10);

      expect(result.resolvedEntityId).toBeNull();
      expect(result.method).toBe('unresolved');
      expect(result.unresolvedReason).toBe('too_far');
    });

    it('should return UNRESOLVED when no entities registered', () => {
      const result = resolver.resolve('He', 0, 0);

      expect(result.resolvedEntityId).toBeNull();
      expect(result.method).toBe('unresolved');
      expect(result.unresolvedReason).toBe('no_candidates');
    });
  });

  // === DECAY AND BOUNDARIES ===

  describe('decay and scene boundaries', () => {
    it('should decay salience across sentences', () => {
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      const initialState = resolver.getState();
      const initialSalience = initialState[0].salience;

      resolver.advanceSentence();
      resolver.advanceSentence();
      resolver.advanceSentence();

      const afterState = resolver.getState();
      expect(afterState[0].salience).toBeLessThan(initialSalience);
    });

    it('should apply stronger decay at paragraph boundaries', () => {
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      const initialSalience = resolver.getState()[0].salience;

      resolver.advanceParagraph();

      const afterSalience = resolver.getState()[0]?.salience ?? 0;
      // Paragraph decay (0.4) is stronger than sentence decay (0.8)
      expect(afterSalience).toBeLessThan(initialSalience * 0.5);
    });

    it('should reset on explicit reset call', () => {
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      expect(resolver.getState()).toHaveLength(1);

      resolver.reset();

      expect(resolver.getState()).toHaveLength(0);
    });

    it('should support hard reset at paragraph with config', () => {
      const hardResetResolver = new SalienceResolver({ paragraphBoundary: 'reset' });
      hardResetResolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');

      hardResetResolver.advanceParagraph();

      expect(hardResetResolver.getState()).toHaveLength(0);
    });
  });

  // === ENTITY TYPE FILTERING ===

  describe('entity type filtering', () => {
    it('should skip non-PERSON entities when personOnly is true', () => {
      resolver.mention('entity-boston', 'Boston', 0, 0, 'subject', 'PLACE');
      resolver.mention('entity-marcus', 'Marcus', 10, 0, 'subject', 'PERSON');

      const state = resolver.getState();

      // Only Marcus should be in the stack
      expect(state).toHaveLength(1);
      expect(state[0].entityId).toBe('entity-marcus');
    });

    it('should include non-PERSON entities when personOnly is false', () => {
      const nonPersonResolver = new SalienceResolver({ personOnly: false });
      nonPersonResolver.mention('entity-boston', 'Boston', 0, 0, 'subject', 'PLACE');
      nonPersonResolver.mention('entity-marcus', 'Marcus', 10, 0, 'subject', 'PERSON');

      const state = nonPersonResolver.getState();

      expect(state).toHaveLength(2);
    });
  });

  // === PRONOUNS ===

  describe('pronoun handling', () => {
    it('should handle "his" as male possessive', () => {
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('his', 20, 1);

      expect(result.resolvedEntityId).toBe('entity-marcus');
    });

    it('should handle "her" as female possessive', () => {
      resolver.mention('entity-sarah', 'Sarah', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('her', 20, 1);

      expect(result.resolvedEntityId).toBe('entity-sarah');
    });

    it('should handle "they/them" as neutral (matches any)', () => {
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('them', 20, 1);

      // Neutral pronouns can match any gender
      expect(result.resolvedEntityId).toBe('entity-marcus');
    });

    it('should not resolve non-personal pronouns', () => {
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('it', 20, 1);

      expect(result.resolvedEntityId).toBeNull();
      expect(result.unresolvedReason).toBe('no_candidates');
    });
  });

  // === AUDIT TRAIL ===

  describe('audit trail', () => {
    it('should include all candidates in result', () => {
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');
      resolver.mention('entity-tom', 'Tom', 10, 0, 'object', 'PERSON');

      const result = resolver.resolve('He', 30, 1);

      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.map(c => c.entityId)).toContain('entity-marcus');
      expect(result.candidates.map(c => c.entityId)).toContain('entity-tom');
    });

    it('should include salience scores in candidates', () => {
      resolver.mention('entity-marcus', 'Marcus', 0, 0, 'subject', 'PERSON');

      const result = resolver.resolve('He', 20, 1);

      expect(result.candidates[0].salience).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// RESOLVE PRONOUNS INTEGRATION TESTS
// =============================================================================

describe('resolvePronouns', () => {
  // Helper to create minimal parsed sentences
  function makeSentences(texts: string[]): ParsedSentence[] {
    let offset = 0;
    return texts.map((text, idx) => {
      const tokens = text.split(/\s+/).map((word, tokenIdx) => {
        const tokenStart = offset + text.indexOf(word);
        return {
          idx: tokenIdx,
          text: word.replace(/[.,!?]$/, ''),
          lemma: word.toLowerCase().replace(/[.,!?]$/, ''),
          pos: 'NN',
          ner: 'O',
          dep: tokenIdx === 0 ? 'nsubj' : 'other',
          head: 0,
          start_char: tokenStart,
          end_char: tokenStart + word.length,
        };
      });

      const sentence: ParsedSentence = {
        sentence_index: idx,
        start: offset,
        end: offset + text.length,
        tokens,
      };

      offset += text.length + 1;
      return sentence;
    });
  }

  it('should return correct stats for mixed document', () => {
    const sentences = makeSentences([
      'Marcus entered the room.',
      'He looked around.',
      'Sarah waved at him.',
      'She smiled.',
    ]);

    const entitySpans: EntitySpan[] = [
      { entityId: 'entity-marcus', name: 'Marcus', start: 0, end: 6, type: 'PERSON' },
      { entityId: 'entity-sarah', name: 'Sarah', start: 47, end: 52, type: 'PERSON' },
    ];

    const { resolved, stats } = resolvePronouns(sentences, entitySpans);

    expect(stats.total).toBeGreaterThan(0);
    expect(stats.resolved + stats.unresolved).toBe(stats.total);
  });

  it('should handle document with no pronouns', () => {
    const sentences = makeSentences([
      'Marcus walked.',
      'Sarah ran.',
    ]);

    const entitySpans: EntitySpan[] = [
      { entityId: 'entity-marcus', name: 'Marcus', start: 0, end: 6, type: 'PERSON' },
    ];

    const { stats } = resolvePronouns(sentences, entitySpans);

    expect(stats.total).toBe(0);
  });

  it('should track resolution methods', () => {
    const sentences = makeSentences([
      'Marcus entered.',
      'He smiled.',
      'Sarah arrived.',
      'She waved.',
    ]);

    const entitySpans: EntitySpan[] = [
      { entityId: 'entity-marcus', name: 'Marcus', start: 0, end: 6, type: 'PERSON' },
      { entityId: 'entity-sarah', name: 'Sarah', start: 28, end: 33, type: 'PERSON' },
    ];

    const { stats } = resolvePronouns(sentences, entitySpans);

    // Should have gender-unique resolutions
    expect(stats.byMethod['gender-unique']).toBeGreaterThan(0);
  });

  it('should track unresolved reasons when no matching gender', () => {
    const sentences = makeSentences([
      'Sarah entered.',
      'He spoke.',  // No male entity → gender mismatch
    ]);

    const entitySpans: EntitySpan[] = [
      { entityId: 'entity-sarah', name: 'Sarah', start: 0, end: 5, type: 'PERSON' },
    ];

    const { stats } = resolvePronouns(sentences, entitySpans);

    // "He" should be unresolved due to gender mismatch (Sarah is female)
    expect(stats.byUnresolvedReason['gender_mismatch']).toBeGreaterThan(0);
  });
});
