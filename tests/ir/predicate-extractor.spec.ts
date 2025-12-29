/**
 * Tests for Predicate Candidate Extractor.
 *
 * Validates SVO extraction rules on real parsed sentences.
 */

import { describe, it, expect } from 'vitest';
import {
  extractPredicatesFromSentence,
  extractPredicates,
  candidateToAssertion,
  type ParsedSentence,
  type EntitySpan,
  type ExtractorConfig,
} from '../../app/engine/ir/predicate-extractor';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const config: ExtractorConfig = {
  docId: 'test-doc',
  minConfidence: 0.3,
};

/**
 * Parse output for: "Marcus entered the office and sat down across from her."
 */
const marcusEnteredSentence: ParsedSentence = {
  sentence_index: 0,
  start: 0,
  end: 57,
  tokens: [
    { i: 0, text: 'Marcus', pos: 'PROPN', dep: 'nsubj', head: 1, lemma: 'Marcus', start: 0, end: 6 },
    { i: 1, text: 'entered', pos: 'VERB', dep: 'ROOT', head: 1, lemma: 'enter', start: 7, end: 14 },
    { i: 2, text: 'the', pos: 'DET', dep: 'det', head: 3, lemma: 'the', start: 15, end: 18 },
    { i: 3, text: 'office', pos: 'NOUN', dep: 'dobj', head: 1, lemma: 'office', start: 19, end: 25 },
    { i: 4, text: 'and', pos: 'CCONJ', dep: 'cc', head: 1, lemma: 'and', start: 26, end: 29 },
    { i: 5, text: 'sat', pos: 'VERB', dep: 'conj', head: 1, lemma: 'sit', start: 30, end: 33 },
    { i: 6, text: 'down', pos: 'ADP', dep: 'prt', head: 5, lemma: 'down', start: 34, end: 38 },
    { i: 7, text: 'across', pos: 'ADP', dep: 'prep', head: 5, lemma: 'across', start: 39, end: 45 },
    { i: 8, text: 'from', pos: 'ADP', dep: 'prep', head: 7, lemma: 'from', start: 46, end: 50 },
    { i: 9, text: 'her', pos: 'PRON', dep: 'pobj', head: 8, lemma: 'she', start: 51, end: 54 },
    { i: 10, text: '.', pos: 'PUNCT', dep: 'punct', head: 1, lemma: '.', start: 54, end: 55 },
  ],
};

/**
 * Parse output for: "Sarah went to Boston."
 */
const sarahWentSentence: ParsedSentence = {
  sentence_index: 0,
  start: 0,
  end: 21,
  tokens: [
    { i: 0, text: 'Sarah', pos: 'PROPN', dep: 'nsubj', head: 1, lemma: 'Sarah', start: 0, end: 5 },
    { i: 1, text: 'went', pos: 'VERB', dep: 'ROOT', head: 1, lemma: 'go', start: 6, end: 10 },
    { i: 2, text: 'to', pos: 'ADP', dep: 'prep', head: 1, lemma: 'to', start: 11, end: 13 },
    { i: 3, text: 'Boston', pos: 'PROPN', dep: 'pobj', head: 2, lemma: 'Boston', start: 14, end: 20 },
    { i: 4, text: '.', pos: 'PUNCT', dep: 'punct', head: 1, lemma: '.', start: 20, end: 21 },
  ],
};

/**
 * Parse output for: "He did not kill her."
 */
const negatedSentence: ParsedSentence = {
  sentence_index: 0,
  start: 0,
  end: 20,
  tokens: [
    { i: 0, text: 'He', pos: 'PRON', dep: 'nsubj', head: 3, lemma: 'he', start: 0, end: 2 },
    { i: 1, text: 'did', pos: 'AUX', dep: 'aux', head: 3, lemma: 'do', start: 3, end: 6 },
    { i: 2, text: 'not', pos: 'PART', dep: 'neg', head: 3, lemma: 'not', start: 7, end: 10 },
    { i: 3, text: 'kill', pos: 'VERB', dep: 'ROOT', head: 3, lemma: 'kill', start: 11, end: 15 },
    { i: 4, text: 'her', pos: 'PRON', dep: 'dobj', head: 3, lemma: 'she', start: 16, end: 19 },
    { i: 5, text: '.', pos: 'PUNCT', dep: 'punct', head: 3, lemma: '.', start: 19, end: 20 },
  ],
};

/**
 * Parse output for: "Mildred met Barty at the station."
 */
const mildredMetSentence: ParsedSentence = {
  sentence_index: 0,
  start: 0,
  end: 33,
  tokens: [
    { i: 0, text: 'Mildred', pos: 'PROPN', dep: 'nsubj', head: 1, lemma: 'Mildred', start: 0, end: 7 },
    { i: 1, text: 'met', pos: 'VERB', dep: 'ROOT', head: 1, lemma: 'meet', start: 8, end: 11 },
    { i: 2, text: 'Barty', pos: 'PROPN', dep: 'dobj', head: 1, lemma: 'Barty', start: 12, end: 17 },
    { i: 3, text: 'at', pos: 'ADP', dep: 'prep', head: 1, lemma: 'at', start: 18, end: 20 },
    { i: 4, text: 'the', pos: 'DET', dep: 'det', head: 5, lemma: 'the', start: 21, end: 24 },
    { i: 5, text: 'station', pos: 'NOUN', dep: 'pobj', head: 3, lemma: 'station', start: 25, end: 32 },
    { i: 6, text: '.', pos: 'PUNCT', dep: 'punct', head: 1, lemma: '.', start: 32, end: 33 },
  ],
};

/**
 * Entity spans for tests.
 */
const entitySpans: EntitySpan[] = [
  { entityId: 'entity_marcus', name: 'Marcus', start: 0, end: 6 },
  { entityId: 'entity_sarah', name: 'Sarah', start: 0, end: 5 },
  { entityId: 'entity_boston', name: 'Boston', start: 14, end: 20, type: 'PLACE' },
  { entityId: 'entity_mildred', name: 'Mildred', start: 0, end: 7 },
  { entityId: 'entity_barty', name: 'Barty', start: 12, end: 17 },
];

// =============================================================================
// RULE 1: BASIC SVO
// =============================================================================

describe('Predicate Extractor - Rule 1: Basic SVO', () => {
  it('should extract SVO from ROOT verb', () => {
    const candidates = extractPredicatesFromSentence(
      marcusEnteredSentence,
      [{ entityId: 'entity_marcus', name: 'Marcus', start: 0, end: 6 }],
      config
    );

    // Should find "Marcus entered the office"
    const entered = candidates.find(c => c.predicate === 'enter');
    expect(entered).toBeDefined();
    expect(entered?.subjectText).toBe('Marcus');
    expect(entered?.subjectEntityId).toBe('entity_marcus');
    expect(entered?.objectText).toBe('office');
    expect(entered?.rule).toBe('SVO_ROOT');
  });

  it('should extract "meet" with subject and object', () => {
    const candidates = extractPredicatesFromSentence(
      mildredMetSentence,
      [
        { entityId: 'entity_mildred', name: 'Mildred', start: 0, end: 7 },
        { entityId: 'entity_barty', name: 'Barty', start: 12, end: 17 },
      ],
      config
    );

    const met = candidates.find(c => c.predicate === 'meet');
    expect(met).toBeDefined();
    expect(met?.subjectEntityId).toBe('entity_mildred');
    expect(met?.objectEntityId).toBe('entity_barty');
  });
});

// =============================================================================
// RULE 2: CONJUNCTION VERBS
// =============================================================================

describe('Predicate Extractor - Rule 2: Conjunction Verbs', () => {
  it('should extract conjunction verb with inherited subject', () => {
    const candidates = extractPredicatesFromSentence(
      marcusEnteredSentence,
      [{ entityId: 'entity_marcus', name: 'Marcus', start: 0, end: 6 }],
      config
    );

    // Should find "Marcus sat_down" (conj verb)
    const sat = candidates.find(c => c.predicate === 'sit_down');
    expect(sat).toBeDefined();
    expect(sat?.subjectText).toBe('Marcus');
    expect(sat?.subjectEntityId).toBe('entity_marcus');
    expect(sat?.rule).toBe('CONJ_VERB');
  });

  it('should inherit subject from head verb', () => {
    const candidates = extractPredicatesFromSentence(
      marcusEnteredSentence,
      [{ entityId: 'entity_marcus', name: 'Marcus', start: 0, end: 6 }],
      config
    );

    // Both verbs should have Marcus as subject
    for (const c of candidates) {
      if (c.predicate === 'enter' || c.predicate === 'sit_down') {
        expect(c.subjectText).toBe('Marcus');
      }
    }
  });
});

// =============================================================================
// RULE 3: VERB PARTICLES
// =============================================================================

describe('Predicate Extractor - Rule 3: Verb Particles', () => {
  it('should normalize phrasal verb with particle', () => {
    const candidates = extractPredicatesFromSentence(
      marcusEnteredSentence,
      [],
      config
    );

    // "sat down" → "sit_down"
    const sat = candidates.find(c => c.predicateLemma === 'sit');
    expect(sat).toBeDefined();
    expect(sat?.predicate).toBe('sit_down');
  });

  it('should keep simple verbs without particle', () => {
    const candidates = extractPredicatesFromSentence(
      marcusEnteredSentence,
      [],
      config
    );

    const entered = candidates.find(c => c.predicateLemma === 'enter');
    expect(entered).toBeDefined();
    expect(entered?.predicate).toBe('enter');
  });
});

// =============================================================================
// RULE 4: PREPOSITIONAL OBJECTS
// =============================================================================

describe('Predicate Extractor - Rule 4: Prep Objects for Movement', () => {
  it('should extract destination from "went to" pattern', () => {
    const candidates = extractPredicatesFromSentence(
      sarahWentSentence,
      [
        { entityId: 'entity_sarah', name: 'Sarah', start: 0, end: 5 },
        { entityId: 'entity_boston', name: 'Boston', start: 14, end: 20, type: 'PLACE' },
      ],
      config
    );

    const went = candidates.find(c => c.predicate === 'go_to');
    expect(went).toBeDefined();
    expect(went?.subjectEntityId).toBe('entity_sarah');
    expect(went?.objectEntityId).toBe('entity_boston');
    expect(went?.rule).toBe('PREP_MOVEMENT');
  });
});

// =============================================================================
// NEGATION
// =============================================================================

describe('Predicate Extractor - Negation', () => {
  it('should detect negated verbs', () => {
    const candidates = extractPredicatesFromSentence(
      negatedSentence,
      [],
      config
    );

    const kill = candidates.find(c => c.predicate === 'kill');
    expect(kill).toBeDefined();
    expect(kill?.negated).toBe(true);
  });

  it('should reduce confidence for negated predicates', () => {
    const candidates = extractPredicatesFromSentence(
      negatedSentence,
      [],
      config
    );

    const kill = candidates.find(c => c.predicate === 'kill');
    expect(kill).toBeDefined();
    // Confidence reduced due to negation AND unresolved pronoun
    expect(kill?.confidence).toBeLessThan(0.65);
  });
});

// =============================================================================
// CONVERSION TO ASSERTIONS
// =============================================================================

describe('Predicate Extractor - Conversion to Assertions', () => {
  it('should convert candidate to IR Assertion', () => {
    const candidates = extractPredicatesFromSentence(
      mildredMetSentence,
      [
        { entityId: 'entity_mildred', name: 'Mildred', start: 0, end: 7 },
        { entityId: 'entity_barty', name: 'Barty', start: 12, end: 17 },
      ],
      config
    );

    const met = candidates.find(c => c.predicate === 'meet');
    expect(met).toBeDefined();

    const assertion = candidateToAssertion(met!);

    expect(assertion.subject).toBe('entity_mildred');
    expect(assertion.predicate).toBe('meet');
    expect(assertion.object).toBe('entity_barty');
    expect(assertion.modality).toBe('FACT');
    expect(assertion.evidence).toHaveLength(1);
    expect(assertion.compiler_pass).toContain('predicate_extractor');
  });

  it('should set NEGATED modality for negated candidates', () => {
    const candidates = extractPredicatesFromSentence(
      negatedSentence,
      [],
      config
    );

    const kill = candidates.find(c => c.predicate === 'kill');
    const assertion = candidateToAssertion(kill!);

    expect(assertion.modality).toBe('NEGATED');
  });
});

// =============================================================================
// BATCH EXTRACTION
// =============================================================================

describe('Predicate Extractor - Batch', () => {
  it('should extract from multiple sentences', () => {
    const sentences = [marcusEnteredSentence, sarahWentSentence];

    const candidates = extractPredicates(sentences, entitySpans, config);

    // Should have candidates from both sentences
    expect(candidates.length).toBeGreaterThanOrEqual(3);

    // Check we got predicates from each
    const predicates = new Set(candidates.map(c => c.predicateLemma));
    expect(predicates.has('enter')).toBe(true);
    expect(predicates.has('sit')).toBe(true);
    expect(predicates.has('go')).toBe(true);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Predicate Extractor - Edge Cases', () => {
  it('should handle sentence with no verbs gracefully', () => {
    const sentence: ParsedSentence = {
      sentence_index: 0,
      start: 0,
      end: 10,
      tokens: [
        { i: 0, text: 'The', pos: 'DET', dep: 'det', head: 1, lemma: 'the' },
        { i: 1, text: 'cat', pos: 'NOUN', dep: 'ROOT', head: 1, lemma: 'cat' },
        { i: 2, text: '.', pos: 'PUNCT', dep: 'punct', head: 1, lemma: '.' },
      ],
    };

    const candidates = extractPredicatesFromSentence(sentence, [], config);
    expect(candidates).toHaveLength(0);
  });

  it('should handle verb without subject gracefully', () => {
    const sentence: ParsedSentence = {
      sentence_index: 0,
      start: 0,
      end: 5,
      tokens: [
        { i: 0, text: 'Run', pos: 'VERB', dep: 'ROOT', head: 0, lemma: 'run' },
        { i: 1, text: '!', pos: 'PUNCT', dep: 'punct', head: 0, lemma: '!' },
      ],
    };

    const candidates = extractPredicatesFromSentence(sentence, [], config);
    // Imperative without subject - should not crash but may produce 0 candidates
    expect(candidates).toBeDefined();
  });

  it('should handle pronouns with lower confidence', () => {
    const candidates = extractPredicatesFromSentence(
      negatedSentence,
      [], // No entity resolution
      config
    );

    const kill = candidates.find(c => c.predicate === 'kill');
    expect(kill).toBeDefined();

    // Pronoun subject should have lower confidence
    expect(kill?.subjectToken?.pos).toBe('PRON');
    expect(kill?.confidence).toBeLessThan(0.65);
  });
});
