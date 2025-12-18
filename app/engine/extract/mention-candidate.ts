/**
 * Mention Candidate - Raw nomination before Meaning Gate
 *
 * This represents a span that has been nominated as a potential entity mention
 * but has NOT yet been validated or minted as an entity.
 */

import type { Token } from './parse-types';

export type NominationSource = 'NER' | 'DEP' | 'FALLBACK' | 'PATTERN';

export interface MentionCandidate {
  /** Raw text as it appears in the document */
  surface: string;

  /** Normalized form (trimmed, collapsed whitespace) */
  normalized: string;

  /** Character offset start */
  start: number;

  /** Character offset end */
  end: number;

  /** Parse tokens for this span */
  tokens: Token[];

  /** Source of this nomination */
  source: NominationSource;

  /** spaCy NER label if from NER source */
  nerHint?: string;

  /** Dependency role of head token */
  depRole?: string;

  /** POS tag of head token */
  headPOS?: string;

  /** Sentence index in document */
  sentenceIndex: number;

  /** Whether this span starts at sentence beginning */
  isSentenceInitial: boolean;

  /** Confidence from source (0-1) */
  confidence?: number;
}

/**
 * Normalize a surface form for comparison/clustering
 */
export function normalizeSurface(surface: string): string {
  return surface
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[\-\u2013\u2014'"""'']+/, '')
    .replace(/[,'"\u201c\u201d\u2018\u2019]+$/g, '')
    .replace(/[.;:!?]+$/g, '');
}

/**
 * Get the head token of a span (rightmost non-function word, or last token)
 */
export function getHeadToken(tokens: Token[]): Token | undefined {
  if (tokens.length === 0) return undefined;
  if (tokens.length === 1) return tokens[0];

  // Look for token that is head of others in the span
  for (const tok of tokens) {
    const isHeadOfSpan = tokens.some(
      other => other !== tok && other.head === tok.i
    );
    if (isHeadOfSpan) return tok;
  }

  // Fallback: rightmost PROPN or NOUN
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].pos === 'PROPN' || tokens[i].pos === 'NOUN') {
      return tokens[i];
    }
  }

  return tokens[tokens.length - 1];
}

/**
 * Check if a position is at sentence start
 */
export function isSentenceInitialPosition(
  start: number,
  fullText: string
): boolean {
  if (start === 0) return true;

  // Look backward for sentence boundary
  for (let i = start - 1; i >= 0; i--) {
    const ch = fullText[i];
    if (ch === '\n') return true;
    if (/[.!?]/.test(ch)) return true;
    if (!/\s/.test(ch) && !/[""''"\u201c\u201d\u2018\u2019]/.test(ch)) {
      return false;
    }
  }

  return true;
}

/**
 * Create a MentionCandidate from a span
 */
export function createCandidate(
  surface: string,
  start: number,
  end: number,
  tokens: Token[],
  source: NominationSource,
  fullText: string,
  sentenceIndex: number,
  options?: {
    nerHint?: string;
    confidence?: number;
  }
): MentionCandidate {
  const head = getHeadToken(tokens);

  return {
    surface,
    normalized: normalizeSurface(surface),
    start,
    end,
    tokens,
    source,
    nerHint: options?.nerHint,
    depRole: head?.dep,
    headPOS: head?.pos,
    sentenceIndex,
    isSentenceInitial: isSentenceInitialPosition(start, fullText),
    confidence: options?.confidence,
  };
}
