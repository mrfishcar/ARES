/**
 * Phase 5 BookNLP Gap Tests
 *
 * Tests for the critical gaps identified in the BookNLP comparison:
 * 1. Supersense Tagging - WordNet-style semantic categories
 * 2. Event Detection - Narrative events with agent/patient roles
 *
 * @see docs/BOOKNLP_COMPARISON.md
 */

import { describe, it, expect } from 'vitest';

// Supersense tagging imports
import {
  getSupersense,
  tagWithSupersenses,
  analyzeSupersenses,
  suggestEntityType,
  isPersonIndicator,
  isLocationIndicator,
  isGroupIndicator,
  isArtifactIndicator,
  extractSupersenseFeatures,
  getPersonLemmas,
  getLocationLemmas,
  addSupersenseEntry,
  type Supersense,
  type NounSupersense,
  type VerbSupersense,
} from '../app/engine/linguistics/supersense';

// Entity type validator imports
import {
  inferEntityTypeWithSupersense,
  isPersonRole,
  isLocationType,
  isGroupType,
  isArtifactType,
} from '../app/engine/entity-type-validators';


// ============================================================================
// SUPERSENSE TAGGING TESTS
// ============================================================================

describe('Supersense Tagging', () => {
  describe('getSupersense - Noun Supersenses', () => {
    it('should return n.person for person-related nouns', () => {
      expect(getSupersense('king', 'NN')).toBe('n.person');
      expect(getSupersense('wizard', 'NN')).toBe('n.person');
      expect(getSupersense('soldier', 'NN')).toBe('n.person');
      expect(getSupersense('mother', 'NN')).toBe('n.person');
      expect(getSupersense('hero', 'NN')).toBe('n.person');
    });

    it('should return n.location for location-related nouns', () => {
      expect(getSupersense('river', 'NN')).toBe('n.location');
      expect(getSupersense('mountain', 'NN')).toBe('n.location');
      expect(getSupersense('city', 'NN')).toBe('n.location');
      expect(getSupersense('castle', 'NN')).toBe('n.location');
      expect(getSupersense('forest', 'NN')).toBe('n.location');
    });

    it('should return n.group for group-related nouns', () => {
      expect(getSupersense('army', 'NN')).toBe('n.group');
      expect(getSupersense('council', 'NN')).toBe('n.group');
      expect(getSupersense('fellowship', 'NN')).toBe('n.group');
      expect(getSupersense('kingdom', 'NN')).toBe('n.group');
    });

    it('should return n.artifact for object-related nouns', () => {
      expect(getSupersense('sword', 'NN')).toBe('n.artifact');
      expect(getSupersense('ring', 'NN')).toBe('n.artifact');
      expect(getSupersense('crown', 'NN')).toBe('n.artifact');
      expect(getSupersense('staff', 'NN')).toBe('n.artifact');
    });

    it('should return undefined for unknown nouns', () => {
      expect(getSupersense('xyzzyx', 'NN')).toBeUndefined();
      expect(getSupersense('blargon', 'NN')).toBeUndefined();
    });
  });

  describe('getSupersense - Verb Supersenses', () => {
    it('should return v.motion for movement verbs', () => {
      expect(getSupersense('go', 'VB')).toBe('v.motion');
      expect(getSupersense('walk', 'VB')).toBe('v.motion');
      expect(getSupersense('run', 'VB')).toBe('v.motion');
      expect(getSupersense('travel', 'VB')).toBe('v.motion');
    });

    it('should return v.communication for speech verbs', () => {
      expect(getSupersense('say', 'VB')).toBe('v.communication');
      expect(getSupersense('tell', 'VB')).toBe('v.communication');
      expect(getSupersense('ask', 'VB')).toBe('v.communication');
      expect(getSupersense('speak', 'VB')).toBe('v.communication');
    });

    it('should return v.contact for physical contact verbs', () => {
      expect(getSupersense('hit', 'VB')).toBe('v.contact');
      expect(getSupersense('kill', 'VB')).toBe('v.contact');
      expect(getSupersense('fight', 'VB')).toBe('v.contact');
      expect(getSupersense('attack', 'VB')).toBe('v.contact');
    });

    it('should return v.cognition for thinking verbs', () => {
      expect(getSupersense('think', 'VB')).toBe('v.cognition');
      expect(getSupersense('know', 'VB')).toBe('v.cognition');
      expect(getSupersense('believe', 'VB')).toBe('v.cognition');
      expect(getSupersense('remember', 'VB')).toBe('v.cognition');
    });
  });

  describe('tagWithSupersenses', () => {
    it('should tag tokens with supersenses', () => {
      const tokens: Token[] = [
        { i: 0, text: 'The', lemma: 'the', pos: 'DT', tag: 'DT', dep: 'det', head: 1, ent: '', start: 0, end: 3 },
        { i: 1, text: 'king', lemma: 'king', pos: 'NN', tag: 'NN', dep: 'nsubj', head: 2, ent: '', start: 4, end: 8 },
        { i: 2, text: 'traveled', lemma: 'travel', pos: 'VBD', tag: 'VBD', dep: 'ROOT', head: 2, ent: '', start: 9, end: 17 },
      ];

      const tagged = tagWithSupersenses(tokens);

      expect(tagged[0].supersense).toBeUndefined(); // 'the' has no supersense
      expect(tagged[1].supersense).toBe('n.person'); // 'king' → n.person
      expect(tagged[2].supersense).toBe('v.motion'); // 'travel' → v.motion
    });
  });

  describe('analyzeSupersenses', () => {
    it('should analyze supersense distribution in tokens', () => {
      const tokens: Token[] = [
        { i: 0, text: 'The', lemma: 'the', pos: 'DT', tag: 'DT', dep: 'det', head: 1, ent: '', start: 0, end: 3 },
        { i: 1, text: 'wizard', lemma: 'wizard', pos: 'NN', tag: 'NN', dep: 'nsubj', head: 2, ent: '', start: 4, end: 10 },
        { i: 2, text: 'traveled', lemma: 'travel', pos: 'VBD', tag: 'VBD', dep: 'ROOT', head: 2, ent: '', start: 11, end: 19 },
        { i: 3, text: 'to', lemma: 'to', pos: 'TO', tag: 'TO', dep: 'prep', head: 2, ent: '', start: 20, end: 22 },
        { i: 4, text: 'the', lemma: 'the', pos: 'DT', tag: 'DT', dep: 'det', head: 5, ent: '', start: 23, end: 26 },
        { i: 5, text: 'castle', lemma: 'castle', pos: 'NN', tag: 'NN', dep: 'pobj', head: 3, ent: '', start: 27, end: 33 },
      ];

      const analysis = analyzeSupersenses(tokens);

      expect(analysis.stats.totalTokens).toBe(6);
      expect(analysis.stats.taggedTokens).toBe(3); // wizard, travel, castle
      expect(analysis.stats.nounTags).toBe(2); // wizard, castle
      expect(analysis.stats.verbTags).toBe(1); // travel
      expect(analysis.stats.personTags).toBe(1); // wizard
      expect(analysis.stats.locationTags).toBe(1); // castle
    });
  });

  describe('Type Indicator Functions', () => {
    it('isPersonIndicator should detect person-related words', () => {
      expect(isPersonIndicator('king')).toBe(true);
      expect(isPersonIndicator('wizard')).toBe(true);
      expect(isPersonIndicator('soldier')).toBe(true);
      expect(isPersonIndicator('river')).toBe(false);
      expect(isPersonIndicator('sword')).toBe(false);
    });

    it('isLocationIndicator should detect location-related words', () => {
      expect(isLocationIndicator('river')).toBe(true);
      expect(isLocationIndicator('mountain')).toBe(true);
      expect(isLocationIndicator('castle')).toBe(true);
      expect(isLocationIndicator('king')).toBe(false);
      expect(isLocationIndicator('sword')).toBe(false);
    });

    it('isGroupIndicator should detect group-related words', () => {
      expect(isGroupIndicator('army')).toBe(true);
      expect(isGroupIndicator('council')).toBe(true);
      expect(isGroupIndicator('fellowship')).toBe(true);
      expect(isGroupIndicator('king')).toBe(false);
    });

    it('isArtifactIndicator should detect artifact-related words', () => {
      expect(isArtifactIndicator('sword')).toBe(true);
      expect(isArtifactIndicator('ring')).toBe(true);
      expect(isArtifactIndicator('crown')).toBe(true);
      expect(isArtifactIndicator('king')).toBe(false);
    });
  });

  describe('inferEntityTypeWithSupersense', () => {
    it('should infer PERSON type from person indicators', () => {
      const result = inferEntityTypeWithSupersense('the wizard', 'MISC');
      expect(result.type).toBe('PERSON');
      expect(result.source).toBe('supersense');
    });

    it('should infer PLACE type from location indicators', () => {
      const result = inferEntityTypeWithSupersense('Misty Mountain', 'MISC');
      expect(result.type).toBe('PLACE');
      expect(result.source).toBe('supersense');
    });

    it('should infer ORG type from group indicators', () => {
      const result = inferEntityTypeWithSupersense('White Council', 'MISC');
      expect(result.type).toBe('ORG');
      expect(result.source).toBe('supersense');
    });

    it('should infer ITEM type from artifact indicators', () => {
      const result = inferEntityTypeWithSupersense('Elven Ring', 'MISC');
      expect(result.type).toBe('ITEM');
      expect(result.source).toBe('supersense');
    });

    it('should return original type when no supersense applies', () => {
      const result = inferEntityTypeWithSupersense('Gandalf', 'PERSON');
      expect(result.type).toBe('PERSON');
      expect(result.source).toBe('original');
    });
  });

  describe('Lexicon Extension', () => {
    it('should use fixed lexicon (addSupersenseEntry is no-op in slim version)', () => {
      // In the slim module, addSupersenseEntry is a no-op
      // The lexicon is fixed for deterministic behavior
      addSupersenseEntry('balrog', 'n.person');
      // balrog is not in the fixed lexicon, so it should return undefined
      expect(getSupersense('balrog', 'NN')).toBeUndefined();
    });

    it('getPersonLemmas should return person-related lemmas', () => {
      const lemmas = getPersonLemmas();
      expect(lemmas).toContain('king');
      expect(lemmas).toContain('wizard');
      expect(lemmas).toContain('soldier');
    });

    it('getLocationLemmas should return location-related lemmas', () => {
      const lemmas = getLocationLemmas();
      expect(lemmas).toContain('river');
      expect(lemmas).toContain('mountain');
      expect(lemmas).toContain('castle');
    });
  });
});

// ============================================================================
// SUPERSENSE INTEGRATION TESTS
// ============================================================================

describe('Supersense Integration', () => {
  it('should map verbs to semantic classes for IR event routing', () => {
    // These supersenses feed into IR event-builder for predicate classification
    const walkSupersense = getSupersense('walk', 'VB');
    expect(walkSupersense).toBe('v.motion');

    const saySupersense = getSupersense('say', 'VB');
    expect(saySupersense).toBe('v.communication');

    const killSupersense = getSupersense('kill', 'VB');
    expect(killSupersense).toBe('v.contact');
  });

  it('should provide type helpers for entity classification', () => {
    // These type checks help improve entity extraction
    expect(isPersonRole('king')).toBe(true);
    expect(isLocationType('mountain')).toBe(true);
    expect(isGroupType('army')).toBe(true);
    expect(isArtifactType('sword')).toBe(true);
  });
});
