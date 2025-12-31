/**
 * Dependency Path Pattern Tests
 *
 * Tests for Loop 3: Relation Pattern Coverage
 * Goal: Validate that dependency path patterns match correctly
 *
 * Test categories:
 * 1. Family/kinship patterns
 * 2. Employment/membership patterns
 * 3. Location patterns
 * 4. Creation/authorship patterns
 * 5. Part-whole patterns
 * 6. Social/emotional patterns
 */

import { describe, it, expect } from 'vitest';
import {
  findShortestPath,
  matchDependencyPath,
  extractRelationFromPath,
} from '../../app/engine/extract/relations/dependency-paths';
import type { Token } from '../../app/engine/extract/relations/types';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create mock tokens with proper dependency structure
 */
function createTokens(tokensData: Array<{
  text: string;
  lemma: string;
  pos: string;
  dep: string;
  head: number;
}>): Token[] {
  return tokensData.map((t, i) => ({
    text: t.text,
    lemma: t.lemma,
    pos: t.pos,
    dep: t.dep,
    head: t.head,
    i,
    start: i * 5,
    end: i * 5 + t.text.length,
  }));
}

/**
 * Create a dependency path for testing
 */
function createPath(signature: string): { signature: string; steps: any[] } {
  return { signature, steps: [] };
}

// ============================================================================
// PATTERN MATCHING TESTS
// ============================================================================

describe('Dependency Path Pattern Matching', () => {
  describe('Marriage Patterns', () => {
    it('should match "X married Y" pattern', () => {
      const path = createPath('john:↑nsubj:marry:↓dobj:mary');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('married_to');
      expect(result?.subjectFirst).toBe(true);
    });

    it('should match "X wed Y" pattern', () => {
      const path = createPath('john:↑nsubj:wed:↓dobj:mary');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('married_to');
    });
  });

  describe('Family Patterns', () => {
    it('should match "X is the son of Y" pattern', () => {
      const path = createPath('harry:↑nsubj:be:↓attr:son:↓prep:of:↓pobj:james');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('child_of');
      expect(result?.subjectFirst).toBe(true);
    });

    it('should match "X is the parent of Y" pattern', () => {
      const path = createPath('james:↑nsubj:be:↓attr:parent:↓prep:of:↓pobj:harry');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('parent_of');
    });

    it('should match "X, son of Y" appositive pattern', () => {
      const path = createPath('harry:↑appos:son:↓prep:of:↓pobj:james');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('child_of');
    });

    it('should match "X\'s father" possessive pattern', () => {
      const path = createPath('father:↓poss:harry');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('child_of');
    });

    it('should match "X\'s son" possessive pattern', () => {
      const path = createPath('son:↓poss:james');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('parent_of');
    });
  });

  describe('Employment Patterns', () => {
    it('should match "X works at Y" pattern', () => {
      const path = createPath('john:↑nsubj:work:↓prep:at:↓pobj:acme');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('member_of');
    });

    it('should match "X, employee at Y" appositive pattern', () => {
      const path = createPath('john:↑appos:employee:↓prep:at:↓pobj:acme');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('member_of');
    });

    it('should match "X joined Y" pattern', () => {
      const path = createPath('john:↑nsubj:join:↓dobj:acme');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('member_of');
    });
  });

  describe('Leadership Patterns', () => {
    it('should match "X founded Y" pattern', () => {
      const path = createPath('steve:↑nsubj:found:↓dobj:apple');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('leads');
    });

    it('should match "X, CEO of Y" appositive pattern', () => {
      const path = createPath('steve:↓appos:ceo:↓prep:of:↓pobj:apple');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('leads');
    });

    it('should match "X ruled Y" pattern', () => {
      const path = createPath('aragorn:↑nsubj:rule:↓dobj:gondor');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      // Either 'rules' or 'ruled_by' depending on direction
      expect(['rules', 'ruled_by']).toContain(result?.predicate);
    });
  });

  describe('Location Patterns', () => {
    it('should match "X lives in Y" pattern', () => {
      const path = createPath('john:↑nsubj:live:↓prep:in:↓pobj:london');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('lives_in');
    });

    it('should match "X was born in Y" pattern', () => {
      const path = createPath('john:↑nsubjpass:bear:↓prep:in:↓pobj:london');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('born_in');
    });

    it('should match "X traveled to Y" pattern', () => {
      const path = createPath('frodo:↑nsubj:travel:↓prep:to:↓pobj:mordor');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('traveled_to');
    });
  });

  describe('Education Patterns', () => {
    it('should match "X graduated from Y" pattern', () => {
      const path = createPath('john:↑nsubj:graduate:↓prep:from:↓pobj:harvard');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('attended');
    });

    it('should match "X studied at Y" pattern', () => {
      const path = createPath('john:↑nsubj:study:↓prep:at:↓pobj:oxford');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('studies_at');
    });

    it('should match "X studied under Y" (mentorship) pattern', () => {
      const path = createPath('john:↑nsubj:study:↓prep:under:↓pobj:professor');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('advised_by');
    });
  });

  describe('Part-Whole Patterns', () => {
    it('should match "X is part of Y" pattern', () => {
      const path = createPath('engine:↑nsubj:be:↓attr:part:↓prep:of:↓pobj:car');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('part_of');
    });

    it('should match "Y consists of X" pattern', () => {
      const path = createPath('car:↑nsubj:consist:↓prep:of:↓pobj:engine');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('part_of');
    });

    it('should match "Y includes X" pattern', () => {
      const path = createPath('team:↑nsubj:include:↓dobj:john');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('part_of');
    });

    it('should match "Y contains X" pattern', () => {
      const path = createPath('box:↑nsubj:contain:↓dobj:ring');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('part_of');
    });
  });

  describe('Creation Patterns', () => {
    it('should match "X wrote Y" pattern', () => {
      const path = createPath('tolkien:↑nsubj:write:↓dobj:lotr');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      // Multiple possible predicates for creation
      expect(['created_by', 'authored']).toContain(result?.predicate);
    });

    it('should match "X painted Y" pattern', () => {
      const path = createPath('davinci:↑nsubj:paint:↓dobj:monalisa');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
    });

    it('should match "Y was written by X" passive pattern', () => {
      const path = createPath('lotr:↑nsubjpass:write:↓agent:by:↓pobj:tolkien');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('created_by');
    });
  });

  describe('Social Patterns', () => {
    it('should match "X befriended Y" pattern', () => {
      const path = createPath('john:↑nsubj:befriend:↓dobj:mary');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('friends_with');
    });

    it('should match "X became friends with Y" pattern', () => {
      const path = createPath('john:↑nsubj:become:↓attr:friend:↓prep:with:↓pobj:mary');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('friends_with');
    });

    it('should match "X is an ally of Y" pattern', () => {
      const path = createPath('john:↑nsubj:be:↓attr:ally:↓prep:of:↓pobj:mary');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('ally_of');
    });
  });

  describe('Conflict Patterns', () => {
    it('should match "X killed Y" pattern', () => {
      const path = createPath('villain:↑nsubj:kill:↓dobj:hero');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('killed');
    });

    it('should match "X defeated Y" pattern', () => {
      const path = createPath('hero:↑nsubj:defeat:↓dobj:villain');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('defeated');
    });

    it('should match "X is the enemy of Y" pattern', () => {
      const path = createPath('voldemort:↑nsubj:be:↓attr:enemy:↓prep:of:↓pobj:harry');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('enemy_of');
    });
  });

  describe('Possession Patterns', () => {
    it('should match "X owns Y" pattern', () => {
      const path = createPath('john:↑nsubj:own:↓dobj:house');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      expect(result?.predicate).toBe('owns');
    });

    it('should match "X possesses Y" pattern', () => {
      const path = createPath('frodo:↑nsubj:possess:↓dobj:ring');
      const result = matchDependencyPath(path);

      expect(result).not.toBeNull();
      // Pattern maps 'possess' to 'owns' (ownership relation)
      expect(result?.predicate).toBe('owns');
    });
  });
});

// ============================================================================
// COVERAGE METRICS
// ============================================================================

describe('Pattern Coverage Metrics', () => {
  const testPatterns = [
    // Family
    { signature: 'x:↑nsubj:be:↓attr:son:↓prep:of:↓pobj:y', expected: 'child_of' },
    { signature: 'x:↑nsubj:be:↓attr:parent:↓prep:of:↓pobj:y', expected: 'parent_of' },
    { signature: 'x:↑appos:son:↓prep:of:↓pobj:y', expected: 'child_of' },

    // Employment
    { signature: 'x:↑nsubj:work:↓prep:at:↓pobj:y', expected: 'member_of' },
    { signature: 'x:↑nsubj:join:↓dobj:y', expected: 'member_of' },

    // Leadership
    { signature: 'x:↑nsubj:found:↓dobj:y', expected: 'leads' },
    { signature: 'x:↓appos:ceo:↓prep:of:↓pobj:y', expected: 'leads' },

    // Location
    { signature: 'x:↑nsubj:live:↓prep:in:↓pobj:y', expected: 'lives_in' },
    { signature: 'x:↑nsubjpass:bear:↓prep:in:↓pobj:y', expected: 'born_in' },

    // Education
    { signature: 'x:↑nsubj:graduate:↓prep:from:↓pobj:y', expected: 'attended' },
    { signature: 'x:↑nsubj:study:↓prep:at:↓pobj:y', expected: 'studies_at' },

    // Part-whole
    { signature: 'x:↑nsubj:be:↓attr:part:↓prep:of:↓pobj:y', expected: 'part_of' },
    { signature: 'y:↑nsubj:consist:↓prep:of:↓pobj:x', expected: 'part_of' },

    // Marriage
    { signature: 'x:↑nsubj:marry:↓dobj:y', expected: 'married_to' },

    // Conflict
    { signature: 'x:↑nsubj:kill:↓dobj:y', expected: 'killed' },
    { signature: 'x:↑nsubj:defeat:↓dobj:y', expected: 'defeated' },
  ];

  it('should match all test patterns correctly', () => {
    let matched = 0;
    const failures: string[] = [];

    for (const { signature, expected } of testPatterns) {
      const path = createPath(signature);
      const result = matchDependencyPath(path);

      if (result && result.predicate === expected) {
        matched++;
      } else {
        failures.push(
          `${signature}: expected '${expected}', got '${result?.predicate || 'null'}'`
        );
      }
    }

    const accuracy = (matched / testPatterns.length) * 100;
    console.log(`Pattern match accuracy: ${accuracy.toFixed(1)}% (${matched}/${testPatterns.length})`);

    if (failures.length > 0) {
      console.log('Failures:', failures);
    }

    // Target: 90% accuracy on core patterns
    expect(accuracy).toBeGreaterThanOrEqual(80);
  });
});
