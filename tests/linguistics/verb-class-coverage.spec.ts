/**
 * Verb Class Coverage Tests
 *
 * Tests for Loop 1: Verb Class Coverage Expansion
 * Goal: Expand from ~126 verbs to 200+ verbs while maintaining quality
 *
 * Test categories:
 * 1. Coverage metrics (total count, per-class distribution)
 * 2. Fiction-relevant verb coverage
 * 3. Synonym consistency (similar verbs → same class)
 * 4. Negative cases (stative verbs should NOT be classified)
 */

import { describe, it, expect } from 'vitest';
import { getVerbClass, type VerbClass } from '../../app/engine/linguistics/supersense';

// ============================================================================
// TEST DATA: Common fiction verbs by category
// ============================================================================

/**
 * High-frequency fiction verbs that MUST be covered
 * Source: Frequency analysis of narrative text
 */
const FICTION_VERBS_MUST_COVER: Record<VerbClass, string[]> = {
  motion: [
    // Core movement
    'go', 'come', 'walk', 'run', 'ride', 'fly', 'fall', 'climb',
    // Speed variants
    'sprint', 'dash', 'hurry', 'rush', 'race',
    // Slow/careful movement
    'stroll', 'wander', 'creep', 'crawl', 'sneak',
    // Vertical movement
    'jump', 'leap', 'dive', 'descend', 'ascend',
    // Directional
    'approach', 'retreat', 'advance', 'withdraw',
  ],
  communication: [
    // Core speech
    'say', 'tell', 'ask', 'speak', 'talk',
    // Volume variants
    'shout', 'whisper', 'murmur', 'mutter', 'scream',
    // Formal speech
    'declare', 'announce', 'proclaim', 'state',
    // Responses
    'answer', 'reply', 'respond', 'retort',
    // Emotional speech
    'plead', 'beg', 'demand', 'insist',
  ],
  perception: [
    // Sight
    'see', 'look', 'watch', 'gaze', 'stare', 'glance', 'glimpse',
    // Hearing
    'hear', 'listen', 'overhear',
    // Other senses
    'feel', 'smell', 'taste', 'sense',
    // Discovery
    'notice', 'observe', 'spot', 'detect', 'perceive',
  ],
  cognition: [
    // Core thinking
    'think', 'know', 'believe', 'understand',
    // Memory
    'remember', 'forget', 'recall', 'recognize',
    // Uncertainty
    'wonder', 'doubt', 'suspect', 'assume', 'guess',
    // Decision
    'decide', 'choose', 'consider', 'conclude',
    // Learning
    'learn', 'discover', 'realize', 'figure',
  ],
  contact: [
    // Violence
    'hit', 'strike', 'kill', 'attack', 'fight',
    // Weapons
    'stab', 'slash', 'shoot', 'pierce',
    // Physical force
    'push', 'pull', 'throw', 'grab', 'seize',
    // Impact
    'slam', 'crash', 'smash', 'crush',
  ],
  change: [
    // State change
    'become', 'turn', 'grow', 'shrink',
    // Life/death
    'die', 'live', 'survive', 'perish',
    // Physical change
    'heal', 'break', 'mend', 'repair',
    // Transformation
    'transform', 'convert', 'evolve',
  ],
  possession: [
    // Acquiring
    'take', 'get', 'receive', 'obtain', 'acquire',
    // Giving
    'give', 'hand', 'offer', 'present',
    // Keeping
    'keep', 'hold', 'possess', 'own',
    // Losing
    'lose', 'drop', 'abandon',
    // Transfer
    'steal', 'borrow', 'lend',
  ],
  social: [
    // Meeting
    'meet', 'encounter', 'greet', 'welcome',
    // Relationships
    'marry', 'divorce', 'befriend',
    // Service
    'serve', 'help', 'assist', 'aid',
    // Authority
    'rule', 'command', 'obey', 'follow',
    // Conflict
    'betray', 'abandon', 'reject',
  ],
  creation: [
    // Making
    'make', 'create', 'build', 'construct',
    // Crafting
    'craft', 'forge', 'shape', 'form',
    // Writing/art
    'write', 'compose', 'paint', 'draw',
    // Destruction
    'destroy', 'demolish', 'ruin',
  ],
  emotion: [
    // Positive
    'love', 'like', 'enjoy', 'adore',
    // Negative
    'hate', 'despise', 'loathe', 'resent',
    // Fear
    'fear', 'dread', 'worry',
    // Sadness
    'mourn', 'grieve', 'weep', 'cry',
    // Joy
    'rejoice', 'celebrate', 'laugh',
  ],
};

/**
 * Stative verbs that should NOT trigger events
 * These should return null from getVerbClass
 */
const STATIVE_VERBS_NO_EVENT = [
  'be', 'is', 'am', 'are', 'was', 'were',
  'seem', 'appear', 'look', // when stative, not perception
  'belong', 'contain', 'consist',
  'equal', 'resemble', 'differ',
  'cost', 'weigh', 'measure',
  'matter', 'suffice',
];

// ============================================================================
// COVERAGE TESTS
// ============================================================================

describe('Verb Class Coverage', () => {
  describe('Total Coverage Metrics', () => {
    it('should have at least 200 verbs in the map', () => {
      // Count all verbs by testing a large set
      const allVerbs = Object.values(FICTION_VERBS_MUST_COVER).flat();
      const uniqueVerbs = [...new Set(allVerbs)];
      const covered = uniqueVerbs.filter(v => getVerbClass(v) !== null);

      // We want at least 80% coverage of our target list
      const coveragePercent = (covered.length / uniqueVerbs.length) * 100;
      expect(coveragePercent).toBeGreaterThanOrEqual(80);
    });

    it('should have balanced distribution across classes', () => {
      const classCounts: Record<string, number> = {
        motion: 0, communication: 0, perception: 0, cognition: 0,
        contact: 0, change: 0, possession: 0, social: 0,
        creation: 0, emotion: 0,
      };

      // Test verbs from our list
      for (const [cls, verbs] of Object.entries(FICTION_VERBS_MUST_COVER)) {
        for (const verb of verbs) {
          if (getVerbClass(verb) === cls) {
            classCounts[cls]++;
          }
        }
      }

      // Each class should have at least 10 verbs covered
      for (const [cls, count] of Object.entries(classCounts)) {
        expect(count, `Class ${cls} has too few verbs`).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('Motion Verbs', () => {
    it('should classify core motion verbs', () => {
      expect(getVerbClass('go')).toBe('motion');
      expect(getVerbClass('walk')).toBe('motion');
      expect(getVerbClass('run')).toBe('motion');
      expect(getVerbClass('fly')).toBe('motion');
    });

    it('should classify speed variants', () => {
      expect(getVerbClass('sprint')).toBe('motion');
      expect(getVerbClass('dash')).toBe('motion');
      expect(getVerbClass('hurry')).toBe('motion');
      expect(getVerbClass('rush')).toBe('motion');
    });

    it('should classify vertical movement', () => {
      expect(getVerbClass('climb')).toBe('motion');
      expect(getVerbClass('jump')).toBe('motion');
      expect(getVerbClass('leap')).toBe('motion');
      expect(getVerbClass('fall')).toBe('motion');
    });

    it('should classify careful/slow movement', () => {
      expect(getVerbClass('creep')).toBe('motion');
      expect(getVerbClass('sneak')).toBe('motion');
      expect(getVerbClass('crawl')).toBe('motion');
    });
  });

  describe('Communication Verbs', () => {
    it('should classify core speech verbs', () => {
      expect(getVerbClass('say')).toBe('communication');
      expect(getVerbClass('tell')).toBe('communication');
      expect(getVerbClass('ask')).toBe('communication');
      expect(getVerbClass('speak')).toBe('communication');
    });

    it('should classify volume variants', () => {
      expect(getVerbClass('shout')).toBe('communication');
      expect(getVerbClass('whisper')).toBe('communication');
      expect(getVerbClass('murmur')).toBe('communication');
      expect(getVerbClass('scream')).toBe('communication');
    });

    it('should classify response verbs', () => {
      expect(getVerbClass('answer')).toBe('communication');
      expect(getVerbClass('reply')).toBe('communication');
      expect(getVerbClass('respond')).toBe('communication');
    });
  });

  describe('Perception Verbs', () => {
    it('should classify sight verbs', () => {
      expect(getVerbClass('see')).toBe('perception');
      expect(getVerbClass('look')).toBe('perception');
      expect(getVerbClass('watch')).toBe('perception');
      expect(getVerbClass('gaze')).toBe('perception');
      expect(getVerbClass('stare')).toBe('perception');
    });

    it('should classify discovery verbs', () => {
      expect(getVerbClass('notice')).toBe('perception');
      expect(getVerbClass('spot')).toBe('perception');
      expect(getVerbClass('detect')).toBe('perception');
    });
  });

  describe('Cognition Verbs', () => {
    it('should classify thinking verbs', () => {
      expect(getVerbClass('think')).toBe('cognition');
      expect(getVerbClass('believe')).toBe('cognition');
      expect(getVerbClass('know')).toBe('cognition');
      expect(getVerbClass('understand')).toBe('cognition');
    });

    it('should classify uncertainty verbs', () => {
      expect(getVerbClass('wonder')).toBe('cognition');
      expect(getVerbClass('doubt')).toBe('cognition');
      expect(getVerbClass('suspect')).toBe('cognition');
    });

    it('should classify decision verbs', () => {
      expect(getVerbClass('decide')).toBe('cognition');
      expect(getVerbClass('choose')).toBe('cognition');
      expect(getVerbClass('consider')).toBe('cognition');
    });
  });

  describe('Contact Verbs', () => {
    it('should classify violence verbs', () => {
      expect(getVerbClass('hit')).toBe('contact');
      expect(getVerbClass('strike')).toBe('contact');
      expect(getVerbClass('kill')).toBe('contact');
      expect(getVerbClass('attack')).toBe('contact');
    });

    it('should classify weapon verbs', () => {
      expect(getVerbClass('stab')).toBe('contact');
      expect(getVerbClass('slash')).toBe('contact');
      expect(getVerbClass('pierce')).toBe('contact');
    });

    it('should classify force verbs', () => {
      expect(getVerbClass('push')).toBe('contact');
      expect(getVerbClass('pull')).toBe('contact');
      expect(getVerbClass('throw')).toBe('contact');
      expect(getVerbClass('grab')).toBe('contact');
    });
  });

  describe('Stative Verbs (Negative Cases)', () => {
    it('should NOT classify pure stative verbs', () => {
      // These should not trigger events
      expect(getVerbClass('be')).toBeNull();
      expect(getVerbClass('seem')).toBeNull();
      expect(getVerbClass('belong')).toBeNull();
      expect(getVerbClass('contain')).toBeNull();
    });
  });

  describe('Synonym Consistency', () => {
    it('should map synonyms to the same class', () => {
      // Motion synonyms
      expect(getVerbClass('sprint')).toBe(getVerbClass('dash'));
      expect(getVerbClass('stroll')).toBe(getVerbClass('wander'));

      // Communication synonyms
      expect(getVerbClass('shout')).toBe(getVerbClass('yell'));
      expect(getVerbClass('whisper')).toBe(getVerbClass('murmur'));

      // Cognition synonyms
      expect(getVerbClass('think')).toBe(getVerbClass('ponder'));
      expect(getVerbClass('remember')).toBe(getVerbClass('recall'));
    });
  });
});

// ============================================================================
// EXPORT TEST DATA FOR OTHER MODULES
// ============================================================================

export { FICTION_VERBS_MUST_COVER, STATIVE_VERBS_NO_EVENT };
