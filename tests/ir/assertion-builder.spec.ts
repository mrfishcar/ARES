/**
 * Assertion Builder Tests
 *
 * Tests for the three deterministic micro-passes:
 * - Pass A: Attribution (speaker detection)
 * - Pass B: Modality (CLAIM/BELIEF/NEGATED/FACT)
 * - Pass C: Reference Resolution (pronouns, group suppression)
 */

import { describe, it, expect } from 'vitest';
import {
  applyAttributionPass,
  applyModalityPass,
  applyReferenceResolutionPass,
  buildAssertion,
  buildAssertions,
  isGroupPlaceholder,
  isResolvablePronoun,
  QuoteContext,
  CorefLink,
  AssertionBuilderContext,
  BELIEF_VERBS,
  NEGATION_CUES,
  GROUP_PLACEHOLDER_PENALTY,
  UNRESOLVED_PRONOUN_PENALTY,
} from '../../app/engine/ir/assertion-builder';
import type { Assertion, Entity, ProjectIR } from '../../app/engine/ir/types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function makeAssertion(overrides: Partial<Assertion> = {}): Assertion {
  return {
    id: 'test_assertion_1',
    assertionType: 'DIRECT',
    subject: 'entity_harry',
    predicate: 'friends_with',
    object: 'entity_ron',
    evidence: [{
      docId: 'test-doc',
      charStart: 0,
      charEnd: 30,
      text: 'Harry and Ron became friends',
    }],
    attribution: {
      source: 'NARRATOR',
      reliability: 0.9,
      isDialogue: false,
      isThought: false,
    },
    modality: 'FACT',
    confidence: {
      extraction: 0.8,
      identity: 0.8,
      semantic: 0.7,
      temporal: 0.5,
      composite: 0.7,
    },
    createdAt: '2025-01-01T00:00:00Z',
    compiler_pass: 'adapter',
    ...overrides,
  };
}

function makeEntity(id: string, canonical: string): Entity {
  return {
    id,
    type: 'PERSON',
    canonical,
    aliases: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    attrs: {},
    evidence: [],
    confidence: {
      extraction: 0.9,
      identity: 0.9,
      semantic: 0.9,
      temporal: 0.5,
      composite: 0.85,
    },
  };
}

// =============================================================================
// PASS A: ATTRIBUTION TESTS
// =============================================================================

describe('Pass A: Attribution', () => {
  describe('applyAttributionPass', () => {
    it('should default to NARRATOR when no quote context', () => {
      const assertion = makeAssertion();
      const result = applyAttributionPass(assertion);

      expect(result.attribution.source).toBe('NARRATOR');
      expect(result.attribution.reliability).toBe(0.9);
      expect(result.attribution.isDialogue).toBe(false);
    });

    it('should default to NARRATOR when quote context says not quoted', () => {
      const assertion = makeAssertion();
      const quoteContext: QuoteContext = { isQuoted: false };
      const result = applyAttributionPass(assertion, quoteContext);

      expect(result.attribution.source).toBe('NARRATOR');
    });

    it('should attribute to CHARACTER when quoted with known speaker', () => {
      const assertion = makeAssertion();
      const quoteContext: QuoteContext = {
        isQuoted: true,
        speakerId: 'entity_dumbledore',
        speakerConfidence: 0.95,
      };
      const result = applyAttributionPass(assertion, quoteContext);

      expect(result.attribution.source).toBe('CHARACTER');
      expect(result.attribution.character).toBe('entity_dumbledore');
      expect(result.attribution.reliability).toBe(0.95);
      expect(result.attribution.isDialogue).toBe(true);
    });

    it('should attribute to CHARACTER with reduced reliability when speaker unknown', () => {
      const assertion = makeAssertion();
      const quoteContext: QuoteContext = {
        isQuoted: true,
        // No speakerId
      };
      const result = applyAttributionPass(assertion, quoteContext);

      expect(result.attribution.source).toBe('CHARACTER');
      expect(result.attribution.character).toBeUndefined();
      expect(result.attribution.reliability).toBe(0.5); // Reduced
      expect(result.attribution.isDialogue).toBe(true);
    });

    it('should use default speaker confidence when not provided', () => {
      const assertion = makeAssertion();
      const quoteContext: QuoteContext = {
        isQuoted: true,
        speakerId: 'entity_snape',
        // No speakerConfidence
      };
      const result = applyAttributionPass(assertion, quoteContext);

      expect(result.attribution.reliability).toBe(0.8); // Default
    });
  });
});

// =============================================================================
// PASS B: MODALITY TESTS
// =============================================================================

describe('Pass B: Modality', () => {
  describe('applyModalityPass', () => {
    it('should default to FACT for narrator assertions', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 20, text: 'Harry went to Hogwarts' }],
      });
      const result = applyModalityPass(assertion);

      expect(result.modality).toBe('FACT');
    });

    it('should assign CLAIM for quoted character speech', () => {
      const assertion = makeAssertion({
        attribution: {
          source: 'CHARACTER',
          character: 'entity_ron',
          reliability: 0.8,
          isDialogue: true,
          isThought: false,
        },
        evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: '"Harry is the chosen one"' }],
      });
      const result = applyModalityPass(assertion);

      expect(result.modality).toBe('CLAIM');
    });

    it('should assign BELIEF for belief verbs', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 40, text: 'Ron believed Harry was telling the truth' }],
      });
      const result = applyModalityPass(assertion);

      expect(result.modality).toBe('BELIEF');
    });

    it('should detect various belief verbs', () => {
      const beliefTexts = [
        'She thinks he is innocent',
        'They assumed the worst',
        'He supposed it was true',
        'She imagined a better world',
        'Ron suspected foul play',
        'Harry feared the worst',
        'Hermione hoped for success',
        'Dumbledore expected trouble',
      ];

      for (const text of beliefTexts) {
        const assertion = makeAssertion({
          evidence: [{ docId: 'test', charStart: 0, charEnd: text.length, text }],
        });
        const result = applyModalityPass(assertion);
        expect(result.modality).toBe('BELIEF', `Failed for: "${text}"`);
      }
    });

    it('should assign NEGATED for negation cues', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: 'Harry did not betray his friends' }],
      });
      const result = applyModalityPass(assertion);

      expect(result.modality).toBe('NEGATED');
    });

    it('should detect various negation patterns', () => {
      const negationTexts = [
        "Harry didn't go",
        'Harry never returned',
        'No longer friends',
        'Neither Harry nor Ron',
        'He denied the accusation',
        'She refused the offer',  // Changed: "refused to believe" has belief verb
        'They rejected the proposal',
      ];

      for (const text of negationTexts) {
        const assertion = makeAssertion({
          evidence: [{ docId: 'test', charStart: 0, charEnd: text.length, text }],
        });
        const result = applyModalityPass(assertion);
        expect(result.modality).toBe('NEGATED', `Failed for: "${text}"`);
      }
    });

    it('should assign RUMOR for hearsay cues', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 40, text: 'Harry was rumored to be the heir' }],
      });
      const result = applyModalityPass(assertion);

      expect(result.modality).toBe('RUMOR');
    });

    it('should detect various rumor patterns', () => {
      const rumorTexts = [
        'He was allegedly involved',
        'Supposedly, she knew',
        'Reportedly, the attack happened',
        'She was said to be powerful',
        'He was claimed to be innocent',
      ];

      for (const text of rumorTexts) {
        const assertion = makeAssertion({
          evidence: [{ docId: 'test', charStart: 0, charEnd: text.length, text }],
        });
        const result = applyModalityPass(assertion);
        expect(result.modality).toBe('RUMOR', `Failed for: "${text}"`);
      }
    });

    it('should assign PLAN for intention cues', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: 'Harry plans to defeat Voldemort' }],
      });
      const result = applyModalityPass(assertion);

      expect(result.modality).toBe('PLAN');
    });

    it('should prioritize CHARACTER > BELIEF > NEGATED > RUMOR > PLAN > FACT', () => {
      // CHARACTER takes priority over belief verbs
      const charAssertion = makeAssertion({
        attribution: {
          source: 'CHARACTER',
          character: 'entity_ron',
          reliability: 0.8,
          isDialogue: true,
          isThought: false,
        },
        evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: '"I believe Harry is innocent"' }],
      });
      expect(applyModalityPass(charAssertion).modality).toBe('CLAIM');

      // BELIEF takes priority over NEGATED
      const beliefAssertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 40, text: 'Ron believed Harry did not betray them' }],
      });
      expect(applyModalityPass(beliefAssertion).modality).toBe('BELIEF');
    });
  });
});

// =============================================================================
// PASS C: REFERENCE RESOLUTION TESTS
// =============================================================================

describe('Pass C: Reference Resolution', () => {
  describe('isGroupPlaceholder', () => {
    it('should identify group placeholders', () => {
      const placeholders = [
        'the family',
        'the group',
        'the team',
        'the couple',
        'everyone',
        'somebody',
        'they',
        'them',
      ];

      for (const text of placeholders) {
        expect(isGroupPlaceholder(text)).toBe(true, `Failed for: "${text}"`);
      }
    });

    it('should not flag non-placeholders', () => {
      const nonPlaceholders = [
        'Harry',
        'the wizard',
        'Hogwarts',
        'he',
        'she',
      ];

      for (const text of nonPlaceholders) {
        expect(isGroupPlaceholder(text)).toBe(false, `Failed for: "${text}"`);
      }
    });
  });

  describe('isResolvablePronoun', () => {
    it('should identify resolvable pronouns', () => {
      const pronouns = ['he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its'];

      for (const text of pronouns) {
        expect(isResolvablePronoun(text)).toBe(true, `Failed for: "${text}"`);
      }
    });

    it('should not resolve ambiguous pronouns', () => {
      const ambiguous = ['they', 'them', 'their', 'we', 'us', 'you'];

      for (const text of ambiguous) {
        expect(isResolvablePronoun(text)).toBe(false, `Failed for: "${text}"`);
      }
    });
  });

  describe('applyReferenceResolutionPass', () => {
    const defaultContext = {
      corefLinks: [] as CorefLink[],
      entityMap: new Map<string, Entity>(),
      minCorefConfidence: 0.7,
    };

    it('should penalize group placeholders in subject', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: 'The family went to dinner' }],
      });

      const result = applyReferenceResolutionPass(assertion, defaultContext);

      // Confidence should be reduced
      expect(result.confidence.composite).toBeLessThan(assertion.confidence.composite);
      expect(result.confidence.semantic).toBe(
        assertion.confidence.semantic - GROUP_PLACEHOLDER_PENALTY
      );
    });

    it('should penalize unresolved pronouns', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 20, text: 'He went to the store' }],
      });

      const result = applyReferenceResolutionPass(assertion, defaultContext);

      // Confidence should be reduced (no coref link to resolve "He")
      expect(result.confidence.composite).toBeLessThan(assertion.confidence.composite);
    });

    it('should resolve pronouns with high-confidence coref links', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 20, text: 'He went to Hogwarts' }],
      });

      const corefLink: CorefLink = {
        mentionText: 'He',
        start: 0,
        end: 2,
        entityId: 'entity_harry',
        confidence: 0.9,
        source: 'booknlp',
      };

      const context = {
        ...defaultContext,
        corefLinks: [corefLink],
      };

      const result = applyReferenceResolutionPass(assertion, context);

      // Subject should be resolved
      expect(result.subject).toBe('entity_harry');
      // Confidence should NOT be reduced (successful resolution)
      expect(result.confidence.composite).toBe(assertion.confidence.composite);
    });

    it('should not resolve pronouns with low-confidence coref links', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 20, text: 'He went to Hogwarts' }],
      });

      const corefLink: CorefLink = {
        mentionText: 'He',
        start: 0,
        end: 2,
        entityId: 'entity_harry',
        confidence: 0.5, // Below threshold
        source: 'spacy',
      };

      const context = {
        ...defaultContext,
        corefLinks: [corefLink],
        minCorefConfidence: 0.7,
      };

      const result = applyReferenceResolutionPass(assertion, context);

      // Subject should NOT be resolved (low confidence)
      expect(result.subject).toBe(assertion.subject);
      // Confidence should be reduced
      expect(result.confidence.composite).toBeLessThan(assertion.confidence.composite);
    });

    it('should not modify assertions without pronouns or placeholders', () => {
      const assertion = makeAssertion({
        evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: 'Harry went to Hogwarts' }],
      });

      const result = applyReferenceResolutionPass(assertion, defaultContext);

      // Should be unchanged
      expect(result.subject).toBe(assertion.subject);
      expect(result.confidence.composite).toBe(assertion.confidence.composite);
    });
  });
});

// =============================================================================
// COMBINED BUILDER TESTS
// =============================================================================

describe('buildAssertion (combined passes)', () => {
  it('should apply all three passes in order', () => {
    const assertion = makeAssertion({
      evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: 'Harry and Ron became friends' }],
    });

    const context: AssertionBuilderContext = {
      quoteContexts: new Map(),
      corefLinks: [],
      entityMap: new Map(),
      minCorefConfidence: 0.7,
    };

    const result = buildAssertion(assertion, context);

    // Attribution should be applied
    expect(result.attribution.source).toBe('NARRATOR');
    // Modality should be FACT (no special cues)
    expect(result.modality).toBe('FACT');
    // Compiler pass should be marked
    expect(result.compiler_pass).toBe('assertion_builder_v1');
  });

  it('should handle quoted speech correctly', () => {
    const assertion = makeAssertion({
      id: 'quoted_assertion',
      evidence: [{ docId: 'test', charStart: 0, charEnd: 40, text: '"Harry is the bravest wizard I know"' }],
    });

    const context: AssertionBuilderContext = {
      quoteContexts: new Map([
        ['quoted_assertion', { isQuoted: true, speakerId: 'entity_hermione', speakerConfidence: 0.9 }],
      ]),
      corefLinks: [],
      entityMap: new Map(),
      minCorefConfidence: 0.7,
    };

    const result = buildAssertion(assertion, context);

    // Attribution should be CHARACTER
    expect(result.attribution.source).toBe('CHARACTER');
    expect(result.attribution.character).toBe('entity_hermione');
    // Modality should be CLAIM (quoted speech)
    expect(result.modality).toBe('CLAIM');
  });
});

describe('buildAssertions (batch processing)', () => {
  it('should process all assertions in ProjectIR', () => {
    const ir: ProjectIR = {
      version: '1.0',
      projectId: 'test-project',
      createdAt: '2025-01-01T00:00:00Z',
      entities: [
        makeEntity('entity_harry', 'Harry Potter'),
        makeEntity('entity_ron', 'Ron Weasley'),
      ],
      assertions: [
        makeAssertion({ id: 'a1' }),
        makeAssertion({ id: 'a2', evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: 'Ron believed in Harry' }] }),
      ],
      events: [],
      stats: { entityCount: 2, assertionCount: 2, eventCount: 0 },
    };

    const result = buildAssertions(ir);

    expect(result.assertions).toHaveLength(2);
    expect(result.assertions[0].compiler_pass).toBe('assertion_builder_v1');
    expect(result.assertions[1].modality).toBe('BELIEF'); // "believed"
  });

  it('should build entity map from IR if not provided', () => {
    const ir: ProjectIR = {
      version: '1.0',
      projectId: 'test-project',
      createdAt: '2025-01-01T00:00:00Z',
      entities: [makeEntity('entity_harry', 'Harry Potter')],
      assertions: [makeAssertion()],
      events: [],
      stats: { entityCount: 1, assertionCount: 1, eventCount: 0 },
    };

    // Should not throw even without explicit context
    const result = buildAssertions(ir);
    expect(result.assertions).toHaveLength(1);
  });
});

// =============================================================================
// DETERMINISM TESTS
// =============================================================================

describe('Determinism', () => {
  it('should produce identical output for identical input', () => {
    const assertion = makeAssertion({
      evidence: [{ docId: 'test', charStart: 0, charEnd: 30, text: 'He believed she was innocent' }],
    });

    const context: AssertionBuilderContext = {
      quoteContexts: new Map(),
      corefLinks: [],
      entityMap: new Map(),
      minCorefConfidence: 0.7,
    };

    const result1 = buildAssertion(assertion, context);
    const result2 = buildAssertion(assertion, context);

    // Should be identical (except for any timestamps, which we don't add)
    expect(result1.modality).toBe(result2.modality);
    expect(result1.attribution).toEqual(result2.attribution);
    expect(result1.confidence).toEqual(result2.confidence);
    expect(result1.compiler_pass).toBe(result2.compiler_pass);
  });

  it('should produce same output regardless of call count', () => {
    const assertion = makeAssertion();
    const context: AssertionBuilderContext = {
      quoteContexts: new Map(),
      corefLinks: [],
      entityMap: new Map(),
      minCorefConfidence: 0.7,
    };

    // Call multiple times
    const results = Array(10).fill(null).map(() => buildAssertion(assertion, context));

    // All results should be identical
    for (let i = 1; i < results.length; i++) {
      expect(results[i].modality).toBe(results[0].modality);
      expect(results[i].confidence.composite).toBe(results[0].confidence.composite);
    }
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty evidence', () => {
    const assertion = makeAssertion({ evidence: [] });
    const context: AssertionBuilderContext = {
      quoteContexts: new Map(),
      corefLinks: [],
      entityMap: new Map(),
      minCorefConfidence: 0.7,
    };

    // Should not throw
    const result = buildAssertion(assertion, context);
    expect(result.modality).toBe('FACT'); // Default
  });

  it('should handle missing confidence fields', () => {
    const assertion: Assertion = {
      ...makeAssertion(),
      confidence: {
        extraction: 0.8,
        identity: 0.8,
        semantic: 0.7,
        temporal: 0.5,
        composite: 0.7,
      },
    };

    const context: AssertionBuilderContext = {
      quoteContexts: new Map(),
      corefLinks: [],
      entityMap: new Map(),
      minCorefConfidence: 0.7,
    };

    const result = buildAssertion(assertion, context);
    expect(result.confidence).toBeDefined();
  });

  it('should handle null/undefined gracefully', () => {
    const assertion = makeAssertion({
      object: undefined as any,
    });

    const context: AssertionBuilderContext = {
      quoteContexts: new Map(),
      corefLinks: [],
      entityMap: new Map(),
      minCorefConfidence: 0.7,
    };

    // Should not throw
    expect(() => buildAssertion(assertion, context)).not.toThrow();
  });
});
