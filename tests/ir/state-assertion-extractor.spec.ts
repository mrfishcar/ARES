/**
 * Tests for State & Possession Assertion Extractor
 */

import { describe, it, expect } from 'vitest';
import {
  extractStateAssertions,
  stateToIRAssertion,
  type StateAssertion,
  type StateExtractionConfig,
} from '../../app/engine/ir/state-assertion-extractor';
import type { ParsedSentence, EntitySpan } from '../../app/engine/ir/predicate-extractor';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeSentence(text: string, tokens: Array<{
  text: string;
  lemma?: string;
  pos: string;
  dep: string;
  head: number;
}>): ParsedSentence {
  return {
    sentence_index: 0,
    start: 0,
    end: text.length,
    tokens: tokens.map((t, i) => ({
      i,
      text: t.text,
      lemma: t.lemma || t.text.toLowerCase(),
      pos: t.pos,
      dep: t.dep,
      head: t.head,
    })),
  };
}

function makeConfig(docId: string = 'test-doc'): StateExtractionConfig {
  return { docId };
}

// =============================================================================
// COPULA + ADJECTIVE TESTS
// =============================================================================

describe('State Assertion Extractor', () => {
  describe('Copula + Adjective (state_of)', () => {
    it('should extract "X was ADJ" pattern', () => {
      // "Sarah was furious"
      const sentence = makeSentence('Sarah was furious', [
        { text: 'Sarah', pos: 'PROPN', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'furious', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      const { assertions, stats } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].subject).toBe('Sarah');
      expect(assertions[0].predicate).toBe('state_of');
      expect(assertions[0].object).toBe('furious');
      expect(assertions[0].negated).toBe(false);
      expect(stats.byPredicate.state_of).toBe(1);
    });

    it('should extract negated states', () => {
      // "He was not happy"
      const sentence = makeSentence('He was not happy', [
        { text: 'He', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'not', pos: 'PART', dep: 'neg', head: 1 },
        { text: 'happy', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      const { assertions, stats } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('state_of');
      expect(assertions[0].object).toBe('happy');
      expect(assertions[0].negated).toBe(true);
      expect(stats.negated).toBe(1);
    });

    it('should extract trait when "always" modifier present', () => {
      // "Marcus was always brave"
      const sentence = makeSentence('Marcus was always brave', [
        { text: 'Marcus', pos: 'PROPN', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'always', pos: 'ADV', dep: 'advmod', head: 1 },
        { text: 'brave', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      const { assertions, stats } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('trait');
      expect(assertions[0].object).toBe('brave');
      expect(assertions[0].temporalModifier).toBe('always');
      expect(stats.withTemporalModifier).toBe(1);
    });

    it('should have higher confidence for known state adjectives', () => {
      // "angry" is in STATE_ADJECTIVES
      const sentence1 = makeSentence('She was angry', [
        { text: 'She', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'angry', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      // "blue" is not in STATE_ADJECTIVES
      const sentence2 = makeSentence('It was blue', [
        { text: 'It', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'blue', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      const { assertions: a1 } = extractStateAssertions([sentence1], [], makeConfig());
      const { assertions: a2 } = extractStateAssertions([sentence2], [], makeConfig());

      expect(a1[0].confidence).toBeGreaterThan(a2[0].confidence);
    });
  });

  // ===========================================================================
  // COPULA + NOUN TESTS
  // ===========================================================================

  describe('Copula + Noun (is_a)', () => {
    it('should extract "X was a NOUN" pattern', () => {
      // "Marcus was a soldier"
      const sentence = makeSentence('Marcus was a soldier', [
        { text: 'Marcus', pos: 'PROPN', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'a', pos: 'DET', dep: 'det', head: 3 },
        { text: 'soldier', pos: 'NOUN', dep: 'attr', head: 1 },
      ]);

      const { assertions, stats } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].subject).toBe('Marcus');
      expect(assertions[0].predicate).toBe('is_a');
      expect(assertions[0].object).toBe('a soldier');
      expect(stats.byPredicate.is_a).toBe(1);
    });

    it('should extract "X is the NOUN" pattern', () => {
      // "She is the queen"
      const sentence = makeSentence('She is the queen', [
        { text: 'She', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'is', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'the', pos: 'DET', dep: 'det', head: 3 },
        { text: 'queen', pos: 'NOUN', dep: 'attr', head: 1 },
      ]);

      const { assertions } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('is_a');
      expect(assertions[0].object).toBe('the queen');
    });

    it('should extract negated identity', () => {
      // "He was not a traitor"
      const sentence = makeSentence('He was not a traitor', [
        { text: 'He', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'not', pos: 'PART', dep: 'neg', head: 1 },
        { text: 'a', pos: 'DET', dep: 'det', head: 4 },
        { text: 'traitor', pos: 'NOUN', dep: 'attr', head: 1 },
      ]);

      const { assertions } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('is_a');
      expect(assertions[0].negated).toBe(true);
    });
  });

  // ===========================================================================
  // COPULA + LOCATION TESTS
  // ===========================================================================

  describe('Copula + Location (location_at)', () => {
    it('should extract "X was in PLACE" pattern', () => {
      // "He was in the garden"
      const sentence = makeSentence('He was in the garden', [
        { text: 'He', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'in', pos: 'ADP', dep: 'prep', head: 1 },
        { text: 'the', pos: 'DET', dep: 'det', head: 4 },
        { text: 'garden', pos: 'NOUN', dep: 'pobj', head: 2 },
      ]);

      const { assertions, stats } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('location_at');
      expect(assertions[0].object).toBe('in the garden');
      expect(stats.byPredicate.location_at).toBe(1);
    });

    it('should extract "X was at PLACE" pattern', () => {
      // "The book was on the table"
      const sentence = makeSentence('The book was on the table', [
        { text: 'The', pos: 'DET', dep: 'det', head: 1 },
        { text: 'book', pos: 'NOUN', dep: 'nsubj', head: 2 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 2 },
        { text: 'on', pos: 'ADP', dep: 'prep', head: 2 },
        { text: 'the', pos: 'DET', dep: 'det', head: 5 },
        { text: 'table', pos: 'NOUN', dep: 'pobj', head: 3 },
      ]);

      const { assertions } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].subject).toBe('book');
      expect(assertions[0].predicate).toBe('location_at');
      expect(assertions[0].object).toBe('on the table');
    });
  });

  // ===========================================================================
  // POSSESSION TESTS
  // ===========================================================================

  describe('Possession (has)', () => {
    it('should extract "X had NOUN" pattern', () => {
      // "Marcus had a cottage"
      const sentence = makeSentence('Marcus had a cottage', [
        { text: 'Marcus', pos: 'PROPN', dep: 'nsubj', head: 1 },
        { text: 'had', lemma: 'have', pos: 'VERB', dep: 'ROOT', head: 1 },
        { text: 'a', pos: 'DET', dep: 'det', head: 3 },
        { text: 'cottage', pos: 'NOUN', dep: 'dobj', head: 1 },
      ]);

      const { assertions, stats } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].subject).toBe('Marcus');
      expect(assertions[0].predicate).toBe('has');
      expect(assertions[0].object).toBe('a cottage');
      expect(stats.byPredicate.has).toBe(1);
    });

    it('should extract "X has NOUN" pattern', () => {
      // "She has three children"
      const sentence = makeSentence('She has three children', [
        { text: 'She', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'has', lemma: 'have', pos: 'VERB', dep: 'ROOT', head: 1 },
        { text: 'three', pos: 'NUM', dep: 'det', head: 3 },
        { text: 'children', pos: 'NOUN', dep: 'dobj', head: 1 },
      ]);

      const { assertions } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('has');
      expect(assertions[0].object).toContain('children');
    });

    it('should NOT extract auxiliary "had" (had gone)', () => {
      // "He had gone to the store" - "had" is auxiliary
      const sentence = makeSentence('He had gone to the store', [
        { text: 'He', pos: 'PRON', dep: 'nsubj', head: 2 },
        { text: 'had', lemma: 'have', pos: 'AUX', dep: 'aux', head: 2 },
        { text: 'gone', lemma: 'go', pos: 'VERB', dep: 'ROOT', head: 2 },
        { text: 'to', pos: 'ADP', dep: 'prep', head: 2 },
        { text: 'the', pos: 'DET', dep: 'det', head: 5 },
        { text: 'store', pos: 'NOUN', dep: 'pobj', head: 3 },
      ]);

      const { assertions } = extractStateAssertions([sentence], [], makeConfig());

      // Should not extract "has" assertion for auxiliary usage
      const hasAssertions = assertions.filter(a => a.predicate === 'has');
      expect(hasAssertions.length).toBe(0);
    });

    it('should extract negated possession', () => {
      // "He had no money"
      const sentence = makeSentence('He had no money', [
        { text: 'He', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'had', lemma: 'have', pos: 'VERB', dep: 'ROOT', head: 1 },
        { text: 'no', pos: 'DET', dep: 'neg', head: 1 },
        { text: 'money', pos: 'NOUN', dep: 'dobj', head: 1 },
      ]);

      const { assertions } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('has');
      expect(assertions[0].negated).toBe(true);
    });
  });

  // ===========================================================================
  // CAPABILITY TESTS
  // ===========================================================================

  describe('Capability (can)', () => {
    it('should extract "X could VERB" pattern', () => {
      // "He could swim" - modal construction
      // spaCy parses: "could" is ROOT, "He" is nsubj of "could", "swim" is xcomp of "could"
      const sentence = makeSentence('He could swim', [
        { text: 'He', pos: 'PRON', dep: 'nsubj', head: 1 },      // head → could
        { text: 'could', lemma: 'could', pos: 'MD', dep: 'ROOT', head: 1 },  // ROOT
        { text: 'swim', lemma: 'swim', pos: 'VERB', dep: 'xcomp', head: 1 },  // head → could
      ]);

      const { assertions, stats } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('can');
      expect(assertions[0].object).toBe('swim');
      expect(stats.byPredicate.can).toBe(1);
    });

    it('should extract negated capability', () => {
      // "She could not fly" - negated modal
      const sentence = makeSentence('She could not fly', [
        { text: 'She', pos: 'PRON', dep: 'nsubj', head: 1 },      // head → could
        { text: 'could', lemma: 'could', pos: 'MD', dep: 'ROOT', head: 1 },  // ROOT
        { text: 'not', pos: 'PART', dep: 'neg', head: 1 },        // head → could
        { text: 'fly', lemma: 'fly', pos: 'VERB', dep: 'xcomp', head: 1 },  // head → could
      ]);

      const { assertions } = extractStateAssertions([sentence], [], makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].predicate).toBe('can');
      expect(assertions[0].negated).toBe(true);
    });
  });

  // ===========================================================================
  // ENTITY RESOLUTION TESTS
  // ===========================================================================

  describe('Entity Resolution', () => {
    it('should link to entity spans when available', () => {
      const sentence = makeSentence('Marcus was tall', [
        { text: 'Marcus', pos: 'PROPN', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'tall', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      const entitySpans: EntitySpan[] = [
        { entityId: 'ent_marcus', name: 'Marcus', start: 0, end: 6, type: 'PERSON' },
      ];

      const { assertions } = extractStateAssertions([sentence], entitySpans, makeConfig());

      expect(assertions.length).toBe(1);
      expect(assertions[0].subjectEntityId).toBe('ent_marcus');
      expect(assertions[0].subject).toBe('Marcus');
    });

    it('should increase confidence when entity matched', () => {
      const sentence = makeSentence('He was angry', [
        { text: 'He', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'angry', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      const withEntity: EntitySpan[] = [
        { entityId: 'ent_he', name: 'John', start: 0, end: 2, type: 'PERSON' },
      ];

      const { assertions: a1 } = extractStateAssertions([sentence], [], makeConfig());
      const { assertions: a2 } = extractStateAssertions([sentence], withEntity, makeConfig());

      expect(a2[0].confidence).toBeGreaterThan(a1[0].confidence);
    });
  });

  // ===========================================================================
  // CONFIGURATION TESTS
  // ===========================================================================

  describe('Configuration', () => {
    it('should filter by minimum confidence', () => {
      const sentence = makeSentence('It was blue', [
        { text: 'It', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'blue', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      const lowThreshold = extractStateAssertions([sentence], [], {
        docId: 'test',
        minConfidence: 0.5,
      });

      const highThreshold = extractStateAssertions([sentence], [], {
        docId: 'test',
        minConfidence: 0.9,
      });

      expect(lowThreshold.assertions.length).toBe(1);
      expect(highThreshold.assertions.length).toBe(0);
    });

    it('should filter negated when disabled', () => {
      const sentence = makeSentence('He was not happy', [
        { text: 'He', pos: 'PRON', dep: 'nsubj', head: 1 },
        { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
        { text: 'not', pos: 'PART', dep: 'neg', head: 1 },
        { text: 'happy', pos: 'ADJ', dep: 'acomp', head: 1 },
      ]);

      const withNegated = extractStateAssertions([sentence], [], {
        docId: 'test',
        includeNegated: true,
      });

      const withoutNegated = extractStateAssertions([sentence], [], {
        docId: 'test',
        includeNegated: false,
      });

      expect(withNegated.assertions.length).toBe(1);
      expect(withoutNegated.assertions.length).toBe(0);
    });
  });

  // ===========================================================================
  // IR CONVERSION TESTS
  // ===========================================================================

  describe('IR Conversion', () => {
    it('should convert StateAssertion to IR Assertion', () => {
      const stateAssertion: StateAssertion = {
        id: 'state_123',
        subject: 'Marcus',
        subjectEntityId: 'ent_marcus',
        predicate: 'state_of',
        object: 'happy',
        negated: false,
        confidence: 0.85,
        evidence: {
          docId: 'test-doc',
          sentenceIndex: 0,
          charStart: 0,
          charEnd: 15,
          text: 'Marcus was happy',
        },
        pattern: 'copula_adj',
      };

      const irAssertion = stateToIRAssertion(stateAssertion);

      expect(irAssertion.id).toBe('state_123');
      expect(irAssertion.subject).toBe('ent_marcus');
      expect(irAssertion.predicate).toBe('state_of');
      expect(irAssertion.object).toBe('happy');
      expect(irAssertion.modality).toBe('FACT');
      expect(irAssertion.compiler_pass).toBe('state_extractor:copula_adj');
    });

    it('should set NEGATED modality for negated assertions', () => {
      const stateAssertion: StateAssertion = {
        id: 'state_456',
        subject: 'He',
        predicate: 'state_of',
        object: 'happy',
        negated: true,
        confidence: 0.8,
        evidence: {
          docId: 'test-doc',
          sentenceIndex: 0,
          charStart: 0,
          charEnd: 16,
          text: 'He was not happy',
        },
        pattern: 'copula_adj',
      };

      const irAssertion = stateToIRAssertion(stateAssertion);

      expect(irAssertion.modality).toBe('NEGATED');
    });
  });

  // ===========================================================================
  // STATS TESTS
  // ===========================================================================

  describe('Statistics', () => {
    it('should count all predicate types correctly', () => {
      const sentences = [
        // state_of
        makeSentence('Sarah was angry', [
          { text: 'Sarah', pos: 'PROPN', dep: 'nsubj', head: 1 },
          { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
          { text: 'angry', pos: 'ADJ', dep: 'acomp', head: 1 },
        ]),
        // is_a
        makeSentence('He was a soldier', [
          { text: 'He', pos: 'PRON', dep: 'nsubj', head: 1 },
          { text: 'was', lemma: 'be', pos: 'AUX', dep: 'ROOT', head: 1 },
          { text: 'a', pos: 'DET', dep: 'det', head: 3 },
          { text: 'soldier', pos: 'NOUN', dep: 'attr', head: 1 },
        ]),
        // has
        makeSentence('She had money', [
          { text: 'She', pos: 'PRON', dep: 'nsubj', head: 1 },
          { text: 'had', lemma: 'have', pos: 'VERB', dep: 'ROOT', head: 1 },
          { text: 'money', pos: 'NOUN', dep: 'dobj', head: 1 },
        ]),
      ];

      const { stats } = extractStateAssertions(sentences, [], makeConfig());

      expect(stats.total).toBe(3);
      expect(stats.byPredicate.state_of).toBe(1);
      expect(stats.byPredicate.is_a).toBe(1);
      expect(stats.byPredicate.has).toBe(1);
    });
  });
});
