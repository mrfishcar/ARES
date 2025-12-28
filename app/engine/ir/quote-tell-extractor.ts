/**
 * Quote-Aware TELL Extractor
 *
 * Extracts TELL events from quoted speech with speaker attribution.
 * Quote beats verb - quoted speech is the primary source of TELL events.
 *
 * Key principle: Quotes are evidence of speech acts. Verbs are hints.
 *
 * @module ir/quote-tell-extractor
 */

import type {
  Assertion,
  AssertionId,
  EntityId,
  EvidenceSpan,
  Modality,
  Attribution,
  Confidence,
} from './types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A quote signal from BookNLP or similar source.
 */
export interface QuoteSignal {
  /** Unique quote identifier */
  id: string;

  /** The quoted text */
  text: string;

  /** Character offset start */
  start: number;

  /** Character offset end */
  end: number;

  /** Resolved speaker entity ID (null if unknown) */
  speakerId: EntityId | null;

  /** Speaker name for display */
  speakerName: string | null;

  /** Confidence in speaker attribution (0-1) */
  confidence: number;

  /** Sentence index (if available) */
  sentenceIndex?: number;
}

/**
 * Index for fast quote lookup by position.
 */
export interface QuoteIndex {
  /** All quotes in document order */
  quotes: QuoteSignal[];

  /** Map of sentence index to quotes in that sentence */
  bySentence: Map<number, QuoteSignal[]>;

  /** Check if a character position is inside a quote */
  isInsideQuote(charPos: number): QuoteSignal | null;

  /** Check if a position is adjacent to a quote (within N chars) */
  isAdjacentToQuote(charPos: number, maxDistance?: number): QuoteSignal | null;
}

/**
 * Result of quote-based TELL extraction.
 */
export interface QuoteTellResult {
  /** TELL assertions from quotes */
  assertions: Assertion[];

  /** Stats about extraction */
  stats: {
    totalQuotes: number;
    withSpeaker: number;
    withoutSpeaker: number;
    tellEventsCreated: number;
  };
}

// =============================================================================
// QUOTE INDEX
// =============================================================================

/**
 * Build a quote index for fast lookup.
 *
 * @param quotes - Array of quote signals from BookNLP
 * @returns QuoteIndex for position-based lookup
 */
export function buildQuoteIndex(quotes: QuoteSignal[]): QuoteIndex {
  // Sort by start position
  const sorted = [...quotes].sort((a, b) => a.start - b.start);

  // Build sentence index
  const bySentence = new Map<number, QuoteSignal[]>();
  for (const quote of sorted) {
    if (quote.sentenceIndex !== undefined) {
      const existing = bySentence.get(quote.sentenceIndex) || [];
      existing.push(quote);
      bySentence.set(quote.sentenceIndex, existing);
    }
  }

  return {
    quotes: sorted,
    bySentence,

    isInsideQuote(charPos: number): QuoteSignal | null {
      // Binary search would be faster for large quote lists
      for (const quote of sorted) {
        if (charPos >= quote.start && charPos < quote.end) {
          return quote;
        }
        if (quote.start > charPos) break; // Past our position
      }
      return null;
    },

    isAdjacentToQuote(charPos: number, maxDistance = 50): QuoteSignal | null {
      for (const quote of sorted) {
        // Check if position is just after quote end
        if (charPos >= quote.end && charPos < quote.end + maxDistance) {
          return quote;
        }
        // Check if position is just before quote start
        if (charPos < quote.start && charPos >= quote.start - maxDistance) {
          return quote;
        }
      }
      return null;
    },
  };
}

// =============================================================================
// QUOTE-FIRST TELL EXTRACTION
// =============================================================================

let assertionIdCounter = 0;

function generateAssertionId(): AssertionId {
  return `quote-tell-${++assertionIdCounter}`;
}

/**
 * Extract TELL assertions from quotes with known speakers.
 *
 * This is the primary source of TELL events - quote beats verb.
 *
 * @param quotes - Quote signals from BookNLP
 * @param docId - Document identifier
 * @param options - Extraction options
 * @returns TELL assertions and stats
 */
export function extractTellFromQuotes(
  quotes: QuoteSignal[],
  docId: string,
  options: {
    /** Minimum confidence for speaker attribution */
    minSpeakerConfidence?: number;
    /** Include quotes without speakers (lower confidence) */
    includeUnattributed?: boolean;
  } = {}
): QuoteTellResult {
  const {
    minSpeakerConfidence = 0.5,
    includeUnattributed = false,
  } = options;

  const assertions: Assertion[] = [];
  let withSpeaker = 0;
  let withoutSpeaker = 0;

  for (const quote of quotes) {
    // Check if quote has a speaker with sufficient confidence
    const hasSpeaker = quote.speakerId && quote.confidence >= minSpeakerConfidence;

    if (hasSpeaker) {
      withSpeaker++;
    } else {
      withoutSpeaker++;
      if (!includeUnattributed) continue;
    }

    // Build evidence span
    const evidence: EvidenceSpan = {
      docId,
      charStart: quote.start,
      charEnd: quote.end,
      text: quote.text.length > 100 ? quote.text.slice(0, 97) + '...' : quote.text,
      sentenceIndex: quote.sentenceIndex,
    };

    // Build attribution
    const attribution: Attribution = {
      source: hasSpeaker ? 'CHARACTER' : 'NARRATOR',
      character: quote.speakerId || undefined,
      reliability: quote.confidence,
      isDialogue: true,
      isThought: false,
    };

    // Build confidence
    const confidence: Confidence = {
      extraction: quote.confidence,
      resolution: hasSpeaker ? 0.9 : 0.4,
      overall: hasSpeaker ? quote.confidence * 0.9 : 0.3,
    };

    // Create TELL assertion
    const assertion: Assertion = {
      id: generateAssertionId(),
      subject: quote.speakerId || 'UNKNOWN_SPEAKER',
      predicate: 'said',  // Canonical TELL predicate
      object: undefined,   // No addressee inference yet
      evidence: [evidence],
      modality: 'CLAIM' as Modality,  // Characters can lie
      confidence,
      attribution,
      extractedFrom: 'quote',
    };

    assertions.push(assertion);
  }

  return {
    assertions,
    stats: {
      totalQuotes: quotes.length,
      withSpeaker,
      withoutSpeaker,
      tellEventsCreated: assertions.length,
    },
  };
}

// =============================================================================
// VERB-QUOTE FUSION (DEDUPE)
// =============================================================================

/**
 * Check if a verb-based assertion overlaps with or is adjacent to a quote.
 */
export function findOverlappingQuote(
  assertion: Assertion,
  quoteIndex: QuoteIndex
): QuoteSignal | null {
  // Get the character position from evidence
  const evidence = assertion.evidence?.[0];
  if (!evidence) return null;

  // Check if verb is inside a quote
  const inside = quoteIndex.isInsideQuote(evidence.charStart);
  if (inside) return inside;

  // Check if verb is adjacent to a quote (speech verb after quote)
  const adjacent = quoteIndex.isAdjacentToQuote(evidence.charStart);
  if (adjacent) return adjacent;

  return null;
}

/**
 * Filter verb-based TELL assertions that overlap with quote-based TELLs.
 *
 * This prevents double-counting: if a quote already generated a TELL,
 * don't create another TELL from the "said" verb.
 *
 * @param verbAssertions - Verb-based assertions from predicate extractor
 * @param quoteIndex - Quote index for overlap checking
 * @param quoteTellAssertions - Assertions already created from quotes
 * @returns Filtered verb assertions (non-overlapping only)
 */
export function filterOverlappingVerbTells(
  verbAssertions: Assertion[],
  quoteIndex: QuoteIndex,
  quoteTellAssertions: Assertion[]
): {
  kept: Assertion[];
  filtered: Assertion[];
  merged: Assertion[];
} {
  const kept: Assertion[] = [];
  const filtered: Assertion[] = [];
  const merged: Assertion[] = [];

  // TELL predicates that might overlap with quotes
  const TELL_PREDICATES = new Set([
    'said', 'told', 'asked', 'replied', 'answered', 'explained',
    'announced', 'declared', 'stated', 'mentioned', 'noted',
    'shouted', 'whispered', 'called', 'cried',
  ]);

  for (const assertion of verbAssertions) {
    const predicate = String(assertion.predicate);

    // Only check TELL predicates for overlap
    if (!TELL_PREDICATES.has(predicate)) {
      kept.push(assertion);
      continue;
    }

    // Check if this verb overlaps with a quote
    const overlappingQuote = findOverlappingQuote(assertion, quoteIndex);

    if (overlappingQuote) {
      // Find the quote-based assertion for this quote
      const quoteTell = quoteTellAssertions.find(qa => {
        const qEvidence = qa.evidence?.[0];
        return qEvidence &&
          qEvidence.charStart === overlappingQuote.start &&
          qEvidence.charEnd === overlappingQuote.end;
      });

      if (quoteTell) {
        // Merge: add verb evidence to quote assertion
        const verbEvidence = assertion.evidence?.[0];
        if (verbEvidence && quoteTell.evidence) {
          // Add verb span as additional evidence (don't duplicate)
          const alreadyHas = quoteTell.evidence.some(
            e => e.charStart === verbEvidence.charStart
          );
          if (!alreadyHas) {
            quoteTell.evidence.push(verbEvidence);
          }
        }
        merged.push(assertion);
        filtered.push(assertion);
      } else {
        // Quote exists but no assertion for it - keep verb assertion
        kept.push(assertion);
      }
    } else {
      // No overlapping quote - keep verb assertion
      kept.push(assertion);
    }
  }

  return { kept, filtered, merged };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  QuoteSignal,
  QuoteIndex,
  QuoteTellResult,
};
