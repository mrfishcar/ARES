/**
 * Tests for Rule-Based Quote Attribution
 *
 * Tests the deterministic quote extraction and speaker attribution
 * patterns that work without BookNLP.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  findQuotes,
  findSpeakerBySpeechVerb,
  createSalienceStack,
  extractQuotesWithSpeakers,
  applyTurnTaking,
  type QuoteMatch,
  type SalienceStack,
  type AttributionResult,
} from '../../app/engine/ir/quote-attribution';
import type { EntitySpan } from '../../app/engine/ir/predicate-extractor';

// =============================================================================
// QUOTE EXTRACTION TESTS
// =============================================================================

describe('findQuotes', () => {
  it('should find double-quoted text', () => {
    const text = 'She said "Hello world" and left.';
    const quotes = findQuotes(text);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].text).toBe('Hello world');
    expect(quotes[0].start).toBe(9);
    expect(quotes[0].quoteStyle).toBe('double');
  });

  it('should find multiple quotes', () => {
    const text = '"First quote" and then "Second quote" was said.';
    const quotes = findQuotes(text);

    expect(quotes).toHaveLength(2);
    expect(quotes[0].text).toBe('First quote');
    expect(quotes[1].text).toBe('Second quote');
  });

  it('should find smart quotes', () => {
    // Use actual Unicode smart quotes: " and "
    const text = 'She said \u201cHello world\u201d and left.';
    const quotes = findQuotes(text);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].text).toBe('Hello world');
    expect(quotes[0].quoteStyle).toBe('smart');
  });

  it('should handle quotes with escaped characters', () => {
    const text = 'He said "Don\'t worry" to her.';
    const quotes = findQuotes(text);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].text).toBe("Don't worry");
  });

  it('should return quotes in document order', () => {
    const text = '"B" came before "A" alphabetically but "C" came last.';
    const quotes = findQuotes(text);

    expect(quotes).toHaveLength(3);
    expect(quotes[0].text).toBe('B');
    expect(quotes[1].text).toBe('A');
    expect(quotes[2].text).toBe('C');
    expect(quotes[0].start).toBeLessThan(quotes[1].start);
    expect(quotes[1].start).toBeLessThan(quotes[2].start);
  });
});

// =============================================================================
// SPEECH VERB PATTERN TESTS
// =============================================================================

describe('findSpeakerBySpeechVerb', () => {
  const makeEntitySpans = (...names: string[]): EntitySpan[] =>
    names.map((name, i) => ({
      entityId: `entity-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      start: 0,  // Will be adjusted per test
      end: name.length,
      type: 'PERSON',
    }));

  it('should match "...", NAME said pattern', () => {
    const text = '"I saw the whole thing!" Kelly said loudly.';
    const quote: QuoteMatch = {
      fullMatch: '"I saw the whole thing!"',
      text: 'I saw the whole thing!',
      start: 0,
      end: 24,
      quoteStyle: 'double',
    };
    const entities = makeEntitySpans('Kelly');
    entities[0].start = 25;
    entities[0].end = 30;

    const speaker = findSpeakerBySpeechVerb(quote, text, entities);

    expect(speaker).not.toBeNull();
    expect(speaker?.name).toBe('Kelly');
    expect(speaker?.method).toBe('pattern');
    expect(speaker?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should match NAME said, "..." pattern', () => {
    const text = 'Marcus said, "This is important."';
    const quote: QuoteMatch = {
      fullMatch: '"This is important."',
      text: 'This is important.',
      start: 13,
      end: 33,
      quoteStyle: 'double',
    };
    const entities = makeEntitySpans('Marcus');
    entities[0].start = 0;
    entities[0].end = 6;

    const speaker = findSpeakerBySpeechVerb(quote, text, entities);

    expect(speaker).not.toBeNull();
    expect(speaker?.name).toBe('Marcus');
    expect(speaker?.method).toBe('pattern');
  });

  it('should match "..." said NAME pattern', () => {
    const text = '"Watch out!" shouted Principal Green.';
    const quote: QuoteMatch = {
      fullMatch: '"Watch out!"',
      text: 'Watch out!',
      start: 0,
      end: 12,
      quoteStyle: 'double',
    };
    const entities = makeEntitySpans('Principal Green');
    entities[0].start = 21;
    entities[0].end = 36;

    const speaker = findSpeakerBySpeechVerb(quote, text, entities);

    expect(speaker).not.toBeNull();
    expect(speaker?.name).toBe('Principal Green');
  });

  it('should identify pronoun speaker needing resolution', () => {
    const text = '"I disagree," she said firmly.';
    const quote: QuoteMatch = {
      fullMatch: '"I disagree,"',
      text: 'I disagree,',
      start: 0,
      end: 13,
      quoteStyle: 'double',
    };

    const speaker = findSpeakerBySpeechVerb(quote, text, []);

    expect(speaker).not.toBeNull();
    expect(speaker?.name.toLowerCase()).toBe('she');
    expect(speaker?.method).toBe('pronoun');
    expect(speaker?.confidence).toBeLessThan(0.8);  // Lower for unresolved
  });

  it('should match various speech verbs', () => {
    const verbs = ['asked', 'replied', 'whispered', 'shouted', 'exclaimed', 'muttered'];

    for (const verb of verbs) {
      const text = `"Hello," Sarah ${verb}.`;
      const quote: QuoteMatch = {
        fullMatch: '"Hello,"',
        text: 'Hello,',
        start: 0,
        end: 8,
        quoteStyle: 'double',
      };
      const entities = makeEntitySpans('Sarah');
      entities[0].start = 9;
      entities[0].end = 14;

      const speaker = findSpeakerBySpeechVerb(quote, text, entities);

      expect(speaker, `Should match verb: ${verb}`).not.toBeNull();
      expect(speaker?.name).toBe('Sarah');
    }
  });

  it('should return null when no speech verb pattern found', () => {
    const text = '"Random text" in a sentence without speech verbs.';
    const quote: QuoteMatch = {
      fullMatch: '"Random text"',
      text: 'Random text',
      start: 0,
      end: 13,
      quoteStyle: 'double',
    };

    const speaker = findSpeakerBySpeechVerb(quote, text, []);

    expect(speaker).toBeNull();
  });
});

// =============================================================================
// SALIENCE STACK TESTS
// =============================================================================

describe('createSalienceStack', () => {
  let stack: SalienceStack;

  beforeEach(() => {
    stack = createSalienceStack();
  });

  it('should track entity mentions', () => {
    stack.mention('entity-marcus', 'Marcus', 0, 'subject');

    expect(stack.entries).toHaveLength(1);
    expect(stack.entries[0].name).toBe('Marcus');
  });

  it('should increase salience for subjects over objects', () => {
    stack.mention('entity-marcus', 'Marcus', 0, 'subject');
    stack.mention('entity-sarah', 'Sarah', 10, 'object');

    expect(stack.entries[0].name).toBe('Marcus');  // Subject is more salient
    expect(stack.entries[0].salience).toBeGreaterThan(stack.entries[1].salience);
  });

  it('should resolve he/him to male entity', () => {
    stack.mention('entity-marcus', 'Marcus', 0, 'subject');
    stack.mention('entity-sarah', 'Sarah', 10, 'subject');

    const resolved = stack.resolvePronoun('he', 50);

    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Marcus');
  });

  it('should resolve she/her to female entity', () => {
    stack.mention('entity-marcus', 'Marcus', 0, 'subject');
    stack.mention('entity-sarah', 'Sarah', 10, 'subject');

    const resolved = stack.resolvePronoun('she', 50);

    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Sarah');
  });

  it('should return null for ambiguous pronoun resolution', () => {
    // Two female entities with similar salience
    stack.mention('entity-sarah', 'Sarah', 0, 'subject');
    stack.mention('entity-kelly', 'Kelly', 10, 'subject');

    const resolved = stack.resolvePronoun('she', 50);

    // Should be null because it's ambiguous
    expect(resolved).toBeNull();
  });

  it('should resolve to clear winner even with multiple candidates', () => {
    // One much more salient than the other
    stack.mention('entity-sarah', 'Sarah', 0, 'subject');
    stack.mention('entity-sarah', 'Sarah', 10, 'subject');
    stack.mention('entity-sarah', 'Sarah', 20, 'subject');
    stack.mention('entity-kelly', 'Kelly', 25, 'other');

    const resolved = stack.resolvePronoun('she', 50);

    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Sarah');  // Much more salient
  });

  it('should not resolve pronouns beyond recency window', () => {
    stack.mention('entity-marcus', 'Marcus', 0, 'subject');

    // Position far from mention (> 500 chars)
    const resolved = stack.resolvePronoun('he', 1000);

    expect(resolved).toBeNull();
  });

  it('should decay salience over time', () => {
    stack.mention('entity-marcus', 'Marcus', 0, 'subject');
    const initialSalience = stack.entries[0].salience;

    stack.decay(0.5);

    expect(stack.entries[0].salience).toBeLessThan(initialSalience);
  });
});

// =============================================================================
// TURN-TAKING TESTS
// =============================================================================

describe('applyTurnTaking', () => {
  it('should infer alternating speakers in dialogue', () => {
    const results: AttributionResult[] = [
      {
        quote: { fullMatch: '"Hi"', text: 'Hi', start: 0, end: 4, quoteStyle: 'double' },
        speaker: { entityId: 'entity-marcus', name: 'Marcus', start: 5, end: 11, method: 'pattern', confidence: 0.9 },
        patternUsed: 'speech-verb',
      },
      {
        quote: { fullMatch: '"Hello"', text: 'Hello', start: 20, end: 27, quoteStyle: 'double' },
        speaker: { entityId: 'entity-sarah', name: 'Sarah', start: 28, end: 33, method: 'pattern', confidence: 0.9 },
        patternUsed: 'speech-verb',
      },
      {
        quote: { fullMatch: '"How are you?"', text: 'How are you?', start: 40, end: 54, quoteStyle: 'double' },
        speaker: null,  // Unattributed
        patternUsed: null,
      },
    ];

    applyTurnTaking(results, []);

    // Third quote should be attributed to Marcus (alternating from Sarah)
    expect(results[2].speaker).not.toBeNull();
    expect(results[2].speaker?.name).toBe('Marcus');
    expect(results[2].speaker?.method).toBe('turn-taking');
    expect(results[2].speaker?.confidence).toBeLessThan(0.8);
  });

  it('should not apply turn-taking with more than 2 speakers', () => {
    const results: AttributionResult[] = [
      {
        quote: { fullMatch: '"A"', text: 'A', start: 0, end: 3, quoteStyle: 'double' },
        speaker: { entityId: 'entity-a', name: 'PersonA', start: 4, end: 11, method: 'pattern', confidence: 0.9 },
        patternUsed: 'speech-verb',
      },
      {
        quote: { fullMatch: '"B"', text: 'B', start: 20, end: 23, quoteStyle: 'double' },
        speaker: { entityId: 'entity-b', name: 'PersonB', start: 24, end: 31, method: 'pattern', confidence: 0.9 },
        patternUsed: 'speech-verb',
      },
      {
        quote: { fullMatch: '"C"', text: 'C', start: 40, end: 43, quoteStyle: 'double' },
        speaker: { entityId: 'entity-c', name: 'PersonC', start: 44, end: 51, method: 'pattern', confidence: 0.9 },
        patternUsed: 'speech-verb',
      },
      {
        quote: { fullMatch: '"?"', text: '?', start: 60, end: 63, quoteStyle: 'double' },
        speaker: null,
        patternUsed: null,
      },
    ];

    applyTurnTaking(results, []);

    // Should NOT attribute because there are 3+ speakers
    expect(results[3].speaker).toBeNull();
  });
});

// =============================================================================
// FULL EXTRACTION TESTS
// =============================================================================

describe('extractQuotesWithSpeakers', () => {
  it('should extract quotes and attribute speakers', () => {
    const text = 'Marcus walked in. "Hello," he said. Sarah replied, "Hi there!"';
    const entitySpans: EntitySpan[] = [
      { entityId: 'entity-marcus', name: 'Marcus', start: 0, end: 6, type: 'PERSON' },
      { entityId: 'entity-sarah', name: 'Sarah', start: 36, end: 41, type: 'PERSON' },
    ];

    const { quotes, stats } = extractQuotesWithSpeakers(text, {
      docId: 'test-doc',
      entitySpans,
    });

    expect(quotes).toHaveLength(2);
    expect(stats.quotesFound).toBe(2);

    // First quote: "Hello" - pronoun "he" should resolve to Marcus
    expect(quotes[0].text).toBe('Hello,');
    expect(quotes[0].speakerName).toBe('Marcus');

    // Second quote: "Hi there!" - Sarah said
    expect(quotes[1].text).toBe('Hi there!');
    expect(quotes[1].speakerName).toBe('Sarah');
  });

  it('should handle dialogue without speech verbs', () => {
    const text = '"First line." "Second line." "Third line."';

    const { quotes, stats } = extractQuotesWithSpeakers(text, {
      docId: 'test-doc',
      entitySpans: [],
    });

    expect(quotes).toHaveLength(3);
    expect(stats.unattributed).toBe(3);
  });

  it('should return proper QuoteSignal format', () => {
    const text = '"Test quote," Marcus said.';
    const entitySpans: EntitySpan[] = [
      { entityId: 'entity-marcus', name: 'Marcus', start: 14, end: 20, type: 'PERSON' },
    ];

    const { quotes } = extractQuotesWithSpeakers(text, {
      docId: 'test-doc',
      entitySpans,
    });

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      id: expect.stringMatching(/^quote_/),
      text: 'Test quote,',
      start: expect.any(Number),
      end: expect.any(Number),
      speakerId: 'entity-marcus',
      speakerName: 'Marcus',
      confidence: expect.any(Number),
    });
  });

  it('should track attribution statistics', () => {
    const text = `
      "First quote," Marcus said.
      "Second quote," she replied.
      "Third quote" with no verb.
    `;
    const entitySpans: EntitySpan[] = [
      { entityId: 'entity-marcus', name: 'Marcus', start: 21, end: 27, type: 'PERSON' },
      { entityId: 'entity-sarah', name: 'Sarah', start: 0, end: 5, type: 'PERSON' },
    ];

    const { stats } = extractQuotesWithSpeakers(text, {
      docId: 'test-doc',
      entitySpans,
    });

    expect(stats.quotesFound).toBe(3);
    expect(stats.attributedBySpeechVerb).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// INTEGRATION WITH EXISTING PIPELINE
// =============================================================================

describe('Integration with quote-tell-extractor', () => {
  it('should produce QuoteSignals compatible with extractTellFromQuotes', async () => {
    // Verify the output format is compatible
    const text = '"I saw everything!" Kelly shouted.';
    const entitySpans: EntitySpan[] = [
      { entityId: 'entity-kelly', name: 'Kelly', start: 20, end: 25, type: 'PERSON' },
    ];

    const { quotes } = extractQuotesWithSpeakers(text, {
      docId: 'test-doc',
      entitySpans,
    });

    // Import and use the existing quote-tell-extractor
    const { extractTellFromQuotes } = await import('../../app/engine/ir/quote-tell-extractor');

    const result = extractTellFromQuotes(quotes, 'test-doc');

    expect(result.assertions).toHaveLength(1);
    expect(result.assertions[0].subject).toBe('entity-kelly');
    expect(result.assertions[0].predicate).toBe('said');
  });
});
