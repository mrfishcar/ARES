import type { ParseResponse, Token } from '../extract/parse-types';
import { buildTokenStats, TokenOccurrence, TokenStats } from './token-stats';

/**
 * Build TokenStats from a parsed document
 * This analyzes the full document to understand token usage patterns before entity extraction
 */
export function buildTokenStatsFromParse(
  text: string,
  parsed: ParseResponse
): TokenStats {
  const occurrences: TokenOccurrence[] = [];

  // Get sentence starts for sentence-initial detection
  const sentenceStarts = new Set(parsed.sentences.map(sent => sent.start));

  for (const sentence of parsed.sentences) {
    const tokens = sentence.tokens;

    // Collect NER spans for "inside longer proper name" detection
    const nerSpans = extractNERSpans(sentence);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const tokenText = token.text;

      // Skip punctuation and whitespace
      if (/^[^\w]$/.test(tokenText)) {
        continue;
      }

      // Detect if token is lowercase or capitalized
      const isLowercase = /^[a-z]/.test(tokenText);
      const isCapitalized = /^[A-Z]/.test(tokenText);

      // Check if token is at sentence start
      const isSentenceInitial = sentenceStarts.has(token.start) ||
                                 Math.abs(token.start - sentence.start) <= 2;

      // Check if token is standalone NP (not part of multi-token NER span)
      const isStandaloneNP = isCapitalized && !isPartOfMultiTokenSpan(token, nerSpans);

      // Check if token is inside a longer proper name
      const insideLongerProperName = isPartOfMultiTokenSpan(token, nerSpans);

      occurrences.push({
        token: tokenText,
        isLowercase,
        isCapitalized,
        isSentenceInitial,
        isStandaloneNP,
        insideLongerProperName,
      });
    }
  }

  return buildTokenStats(occurrences);
}

/**
 * Extract NER spans from sentence (multi-token proper names)
 */
interface NERSpan {
  start: number;
  end: number;
  tokens: Token[];
}

function extractNERSpans(sentence: { tokens: Token[] }): NERSpan[] {
  const spans: NERSpan[] = [];
  const tokens = sentence.tokens;

  // Coordination conjunctions should not be part of NER spans
  const COORD_CONJ = new Set(['and', 'or', '&']);

  let currentSpan: NERSpan | null = null;

  for (const token of tokens) {
    // Check if token is part of NER (has entity label or is capitalized multi-word)
    const isNER = token.ent && token.ent !== '' && token.ent !== 'O';
    const isCapitalized = /^[A-Z]/.test(token.text);

    // COORDINATION FIX: Treat coordination conjunctions as span boundaries
    // Even if spaCy tags "and" as part of a PERSON entity (e.g., "Alice and Bob"),
    // we should break the span at the conjunction
    const isCoordConj = COORD_CONJ.has(token.text.toLowerCase()) && token.pos === 'CCONJ';
    if (isCoordConj) {
      // Finalize current span if exists
      if (currentSpan && currentSpan.tokens.length > 1) {
        spans.push(currentSpan);
      }
      currentSpan = null;
      continue;
    }

    if (isNER || isCapitalized) {
      if (!currentSpan) {
        currentSpan = {
          start: token.start,
          end: token.end,
          tokens: [token],
        };
      } else {
        // Extend current span if consecutive
        const prevToken = currentSpan.tokens[currentSpan.tokens.length - 1];
        const gap = token.start - prevToken.end;

        if (gap <= 1) { // Allow single space between tokens
          currentSpan.end = token.end;
          currentSpan.tokens.push(token);
        } else {
          // Gap too large, finalize current span
          if (currentSpan.tokens.length > 1) {
            spans.push(currentSpan);
          }
          currentSpan = {
            start: token.start,
            end: token.end,
            tokens: [token],
          };
        }
      }
    } else {
      // Finalize current span if exists
      if (currentSpan && currentSpan.tokens.length > 1) {
        spans.push(currentSpan);
      }
      currentSpan = null;
    }
  }

  // Finalize last span
  if (currentSpan && currentSpan.tokens.length > 1) {
    spans.push(currentSpan);
  }

  return spans;
}

/**
 * Check if a token is part of a multi-token NER span
 */
function isPartOfMultiTokenSpan(token: Token, spans: NERSpan[]): boolean {
  for (const span of spans) {
    if (token.start >= span.start && token.end <= span.end) {
      return true;
    }
  }
  return false;
}
