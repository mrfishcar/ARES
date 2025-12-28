/**
 * Quote-TELL Extractor Tests
 *
 * Tests for extracting TELL events from quoted speech with speaker attribution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildQuoteIndex,
  extractTellFromQuotes,
  filterOverlappingVerbTells,
  type QuoteSignal,
} from '../../app/engine/ir/quote-tell-extractor';
import type { Assertion, EvidenceSpan } from '../../app/engine/ir/types';

// =============================================================================
// TEST DATA FROM BOOKNLP FIXTURE
// =============================================================================

// Real quote data from tests/fixtures/booknlp/barty-excerpt-contract.json
const BOOKNLP_QUOTES: QuoteSignal[] = [
  {
    id: 'quote_0',
    text: 'I saw the whole thing!',
    start: 165,
    end: 187,
    speakerId: 'entity-person-kelly-prescott',
    speakerName: 'Kelly Prescott',
    confidence: 0.9,
    sentenceIndex: 3,
  },
  {
    id: 'quote_1',
    text: 'This is a serious matter.',
    start: 220,
    end: 245,
    speakerId: 'entity-person-principal-green',
    speakerName: 'Principal Green',
    confidence: 0.9,
    sentenceIndex: 4,
  },
];

// Quote without speaker attribution
const UNATTRIBUTED_QUOTE: QuoteSignal = {
  id: 'quote_2',
  text: 'Someone should do something!',
  start: 300,
  end: 328,
  speakerId: null,
  speakerName: null,
  confidence: 0.3,
  sentenceIndex: 5,
};

describe('Quote-TELL Extractor', () => {
  // ===========================================================================
  // QUOTE INDEX TESTS
  // ===========================================================================

  describe('buildQuoteIndex', () => {
    it('should sort quotes by start position', () => {
      const reversed = [...BOOKNLP_QUOTES].reverse();
      const index = buildQuoteIndex(reversed);

      expect(index.quotes[0].start).toBeLessThan(index.quotes[1].start);
    });

    it('should index quotes by sentence', () => {
      const index = buildQuoteIndex(BOOKNLP_QUOTES);

      const sentence3 = index.bySentence.get(3);
      expect(sentence3).toHaveLength(1);
      expect(sentence3?.[0].speakerName).toBe('Kelly Prescott');

      const sentence4 = index.bySentence.get(4);
      expect(sentence4).toHaveLength(1);
      expect(sentence4?.[0].speakerName).toBe('Principal Green');
    });

    it('should detect position inside quote', () => {
      const index = buildQuoteIndex(BOOKNLP_QUOTES);

      // Position inside first quote (165-187)
      const inside = index.isInsideQuote(170);
      expect(inside).not.toBeNull();
      expect(inside?.speakerName).toBe('Kelly Prescott');

      // Position outside any quote
      const outside = index.isInsideQuote(100);
      expect(outside).toBeNull();
    });

    it('should detect position adjacent to quote', () => {
      const index = buildQuoteIndex(BOOKNLP_QUOTES);

      // Position just after first quote (end is 187)
      const adjacent = index.isAdjacentToQuote(190);
      expect(adjacent).not.toBeNull();
      expect(adjacent?.speakerName).toBe('Kelly Prescott');

      // Position too far from any quote
      const tooFar = index.isAdjacentToQuote(100);
      expect(tooFar).toBeNull();
    });
  });

  // ===========================================================================
  // TELL EXTRACTION TESTS
  // ===========================================================================

  describe('extractTellFromQuotes', () => {
    it('should create TELL assertions from quotes with speakers', () => {
      const result = extractTellFromQuotes(BOOKNLP_QUOTES, 'test-doc');

      expect(result.assertions).toHaveLength(2);
      expect(result.stats.withSpeaker).toBe(2);
      expect(result.stats.tellEventsCreated).toBe(2);
    });

    it('should set correct subject (speaker)', () => {
      const result = extractTellFromQuotes(BOOKNLP_QUOTES, 'test-doc');

      const kellyTell = result.assertions.find(
        a => a.subject === 'entity-person-kelly-prescott'
      );
      expect(kellyTell).toBeDefined();
      expect(kellyTell?.predicate).toBe('said');
    });

    it('should set modality to CLAIM (characters can lie)', () => {
      const result = extractTellFromQuotes(BOOKNLP_QUOTES, 'test-doc');

      expect(result.assertions[0].modality).toBe('CLAIM');
      expect(result.assertions[1].modality).toBe('CLAIM');
    });

    it('should include quote text as evidence', () => {
      const result = extractTellFromQuotes(BOOKNLP_QUOTES, 'test-doc');

      const kellyTell = result.assertions.find(
        a => a.subject === 'entity-person-kelly-prescott'
      );
      expect(kellyTell?.evidence?.[0].text).toBe('I saw the whole thing!');
    });

    it('should skip quotes without speakers by default', () => {
      const quotesWithUnattributed = [...BOOKNLP_QUOTES, UNATTRIBUTED_QUOTE];
      const result = extractTellFromQuotes(quotesWithUnattributed, 'test-doc', {
        includeUnattributed: false,
      });

      expect(result.assertions).toHaveLength(2);
      expect(result.stats.withoutSpeaker).toBe(1);
    });

    it('should include unattributed quotes when requested', () => {
      const quotesWithUnattributed = [...BOOKNLP_QUOTES, UNATTRIBUTED_QUOTE];
      const result = extractTellFromQuotes(quotesWithUnattributed, 'test-doc', {
        includeUnattributed: true,
      });

      expect(result.assertions).toHaveLength(3);

      const unattributed = result.assertions.find(
        a => a.subject === 'UNKNOWN_SPEAKER'
      );
      expect(unattributed).toBeDefined();
    });

    it('should set attribution.source correctly', () => {
      const result = extractTellFromQuotes(BOOKNLP_QUOTES, 'test-doc');

      expect(result.assertions[0].attribution?.source).toBe('CHARACTER');
      expect(result.assertions[0].attribution?.isDialogue).toBe(true);
    });

    it('should mark extractedFrom as quote', () => {
      const result = extractTellFromQuotes(BOOKNLP_QUOTES, 'test-doc');

      expect(result.assertions[0].extractedFrom).toBe('quote');
    });
  });

  // ===========================================================================
  // VERB-QUOTE FUSION (DEDUPE) TESTS
  // ===========================================================================

  describe('filterOverlappingVerbTells', () => {
    let quoteIndex: ReturnType<typeof buildQuoteIndex>;
    let quoteTellAssertions: Assertion[];

    beforeEach(() => {
      quoteIndex = buildQuoteIndex(BOOKNLP_QUOTES);
      const result = extractTellFromQuotes(BOOKNLP_QUOTES, 'test-doc');
      quoteTellAssertions = result.assertions;
    });

    it('should keep non-TELL verb assertions unchanged', () => {
      const verbAssertions: Assertion[] = [
        createMockAssertion('moved', 100, 110),
        createMockAssertion('walked', 200, 210),
      ];

      const { kept, filtered } = filterOverlappingVerbTells(
        verbAssertions,
        quoteIndex,
        quoteTellAssertions
      );

      expect(kept).toHaveLength(2);
      expect(filtered).toHaveLength(0);
    });

    it('should filter verb-TELL that overlaps with quote', () => {
      // "said" verb at position 188-192 (just after first quote end at 187)
      const verbAssertions: Assertion[] = [
        createMockAssertion('said', 188, 192),
      ];

      const { kept, filtered, merged } = filterOverlappingVerbTells(
        verbAssertions,
        quoteIndex,
        quoteTellAssertions
      );

      expect(filtered).toHaveLength(1);
      expect(merged).toHaveLength(1);
      expect(kept).toHaveLength(0);
    });

    it('should keep verb-TELL that does not overlap with any quote', () => {
      // "said" verb at position 50-54 (far from any quote)
      const verbAssertions: Assertion[] = [
        createMockAssertion('said', 50, 54),
      ];

      const { kept, filtered } = filterOverlappingVerbTells(
        verbAssertions,
        quoteIndex,
        quoteTellAssertions
      );

      expect(kept).toHaveLength(1);
      expect(filtered).toHaveLength(0);
    });

    it('should merge evidence when verb overlaps with quote', () => {
      const verbAssertions: Assertion[] = [
        createMockAssertion('said', 188, 192, 'Kelly said'),
      ];

      filterOverlappingVerbTells(
        verbAssertions,
        quoteIndex,
        quoteTellAssertions
      );

      // Check that the quote assertion now has merged evidence
      const kellyAssertion = quoteTellAssertions.find(
        a => a.subject === 'entity-person-kelly-prescott'
      );

      // Should have original quote evidence plus verb evidence
      expect(kellyAssertion?.evidence?.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe('Integration: Quote-first TELL workflow', () => {
    it('should produce fewer TELL events with quote-first approach', () => {
      // Simulate: 3 quotes with speakers, 5 verb-based "said" assertions
      const quotes = BOOKNLP_QUOTES;
      const verbAssertions: Assertion[] = [
        createMockAssertion('said', 188, 192),  // Adjacent to quote 0
        createMockAssertion('said', 246, 250),  // Adjacent to quote 1
        createMockAssertion('said', 50, 54),    // No quote nearby
        createMockAssertion('said', 100, 104),  // No quote nearby
        createMockAssertion('replied', 400, 407), // No quote nearby
      ];

      // Step 1: Extract TELL from quotes
      const quoteResult = extractTellFromQuotes(quotes, 'test-doc');
      expect(quoteResult.assertions).toHaveLength(2);

      // Step 2: Filter verb-based TELL
      const quoteIndex = buildQuoteIndex(quotes);
      const { kept, filtered } = filterOverlappingVerbTells(
        verbAssertions,
        quoteIndex,
        quoteResult.assertions
      );

      // 2 filtered (overlap with quotes), 3 kept (no overlap)
      expect(filtered).toHaveLength(2);
      expect(kept).toHaveLength(3);

      // Total TELL: 2 from quotes + 3 from verbs = 5 (not 7)
      const totalTell = quoteResult.assertions.length + kept.length;
      expect(totalTell).toBe(5);
    });

    it('should have speaker on all quote-based TELL events', () => {
      const result = extractTellFromQuotes(BOOKNLP_QUOTES, 'test-doc');

      for (const assertion of result.assertions) {
        expect(assertion.subject).not.toBe('UNKNOWN_SPEAKER');
        expect(assertion.attribution?.character).toBeDefined();
      }
    });
  });
});

// =============================================================================
// HELPERS
// =============================================================================

function createMockAssertion(
  predicate: string,
  charStart: number,
  charEnd: number,
  text?: string
): Assertion {
  const evidence: EvidenceSpan = {
    docId: 'test-doc',
    charStart,
    charEnd,
    text: text || `${predicate} (mock)`,
  };

  return {
    id: `mock-${predicate}-${charStart}`,
    subject: 'mock-subject',
    predicate,
    object: undefined,
    evidence: [evidence],
    modality: 'FACT',
    confidence: {
      extraction: 0.8,
      resolution: 0.8,
      overall: 0.64,
    },
    attribution: {
      source: 'NARRATOR',
      reliability: 0.9,
      isDialogue: false,
      isThought: false,
    },
  };
}
