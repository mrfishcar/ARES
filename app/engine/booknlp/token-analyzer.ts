/**
 * Token Analyzer - Phase 5.1
 *
 * Provides utilities for analyzing BookNLP token data including:
 * - Paragraph structure extraction
 * - Sentence boundary detection
 * - Lemma-based entity matching
 * - POS tag analysis for quality filtering
 */

import type { BookNLPToken, BookNLPContract } from './types';

// ============================================================================
// DOCUMENT STRUCTURE
// ============================================================================

/**
 * Paragraph structure with token and sentence references
 */
export interface Paragraph {
  index: number;
  startToken: number;
  endToken: number;
  startChar: number;
  endChar: number;
  sentences: number[];  // Sentence indices in this paragraph
  text?: string;  // Optional reconstructed text
}

/**
 * Sentence structure with token references
 */
export interface SentenceBoundary {
  index: number;
  startToken: number;
  endToken: number;
  startChar: number;
  endChar: number;
  paragraphIndex: number;
}

/**
 * Extract paragraph structure from tokens
 */
export function extractParagraphs(tokens: BookNLPToken[]): Paragraph[] {
  if (!tokens.length) return [];

  const paragraphs = new Map<number, Paragraph>();

  for (const token of tokens) {
    const paraIdx = token.paragraph_idx;

    if (!paragraphs.has(paraIdx)) {
      paragraphs.set(paraIdx, {
        index: paraIdx,
        startToken: token.idx,
        endToken: token.idx,
        startChar: token.start_char,
        endChar: token.end_char,
        sentences: [],
      });
    }

    const para = paragraphs.get(paraIdx)!;
    para.endToken = Math.max(para.endToken, token.idx);
    para.endChar = Math.max(para.endChar, token.end_char);

    // Track unique sentence indices
    if (!para.sentences.includes(token.sentence_idx)) {
      para.sentences.push(token.sentence_idx);
    }
  }

  // Sort and return
  return Array.from(paragraphs.values())
    .sort((a, b) => a.index - b.index);
}

/**
 * Extract sentence boundaries from tokens
 */
export function extractSentences(tokens: BookNLPToken[]): SentenceBoundary[] {
  if (!tokens.length) return [];

  const sentences = new Map<number, SentenceBoundary>();

  for (const token of tokens) {
    const sentIdx = token.sentence_idx;

    if (!sentences.has(sentIdx)) {
      sentences.set(sentIdx, {
        index: sentIdx,
        startToken: token.idx,
        endToken: token.idx,
        startChar: token.start_char,
        endChar: token.end_char,
        paragraphIndex: token.paragraph_idx,
      });
    }

    const sent = sentences.get(sentIdx)!;
    sent.endToken = Math.max(sent.endToken, token.idx);
    sent.endChar = Math.max(sent.endChar, token.end_char);
  }

  // Sort and return
  return Array.from(sentences.values())
    .sort((a, b) => a.index - b.index);
}

// ============================================================================
// LEMMA-BASED MATCHING
// ============================================================================

/**
 * Token lookup index for efficient lemma matching
 */
export interface TokenIndex {
  byLemma: Map<string, BookNLPToken[]>;
  byPosition: Map<number, BookNLPToken>;
  byCharPosition: Map<number, BookNLPToken>;  // For char offset lookup
}

/**
 * Build a token index for efficient lookups
 */
export function buildTokenIndex(tokens: BookNLPToken[]): TokenIndex {
  const byLemma = new Map<string, BookNLPToken[]>();
  const byPosition = new Map<number, BookNLPToken>();
  const byCharPosition = new Map<number, BookNLPToken>();

  for (const token of tokens) {
    // Index by position
    byPosition.set(token.idx, token);

    // Index by char position (map each char in range to token)
    for (let i = token.start_char; i < token.end_char; i++) {
      byCharPosition.set(i, token);
    }

    // Index by lemma (lowercased)
    const lemma = token.lemma.toLowerCase();
    if (!byLemma.has(lemma)) {
      byLemma.set(lemma, []);
    }
    byLemma.get(lemma)!.push(token);
  }

  return { byLemma, byPosition, byCharPosition };
}

/**
 * Find tokens matching a lemma (case-insensitive)
 */
export function findByLemma(
  index: TokenIndex,
  lemma: string
): BookNLPToken[] {
  return index.byLemma.get(lemma.toLowerCase()) || [];
}

/**
 * Find tokens matching any of the given lemmas
 */
export function findByLemmas(
  index: TokenIndex,
  lemmas: string[]
): BookNLPToken[] {
  const results: BookNLPToken[] = [];

  for (const lemma of lemmas) {
    const tokens = findByLemma(index, lemma);
    results.push(...tokens);
  }

  return results;
}

/**
 * Find token at a character position
 */
export function findTokenAtChar(
  index: TokenIndex,
  charPosition: number
): BookNLPToken | undefined {
  return index.byCharPosition.get(charPosition);
}

/**
 * Find tokens in a character range
 */
export function findTokensInRange(
  index: TokenIndex,
  startChar: number,
  endChar: number
): BookNLPToken[] {
  const tokens: BookNLPToken[] = [];
  const seen = new Set<number>();

  for (let i = startChar; i < endChar; i++) {
    const token = index.byCharPosition.get(i);
    if (token && !seen.has(token.idx)) {
      tokens.push(token);
      seen.add(token.idx);
    }
  }

  return tokens.sort((a, b) => a.idx - b.idx);
}

/**
 * Match entity name using lemmas for better fuzzy matching
 *
 * Example: "ran" matches "running" via shared lemma "run"
 */
export function matchEntityByLemma(
  entityName: string,
  index: TokenIndex
): { exactMatches: BookNLPToken[][]; lemmaMatches: BookNLPToken[][] } {
  const entityWords = entityName.toLowerCase().split(/\s+/);
  const exactMatches: BookNLPToken[][] = [];
  const lemmaMatches: BookNLPToken[][] = [];

  // For each word in entity name, find tokens that match either the word or its lemma
  for (const word of entityWords) {
    // Exact text matches
    const exactTokens = Array.from(index.byPosition.values())
      .filter(t => t.text.toLowerCase() === word);

    if (exactTokens.length > 0) {
      exactMatches.push(exactTokens);
    }

    // Lemma matches (broader)
    const lemmaTokens = findByLemma(index, word);
    if (lemmaTokens.length > 0) {
      lemmaMatches.push(lemmaTokens);
    }
  }

  return { exactMatches, lemmaMatches };
}

// ============================================================================
// POS TAG ANALYSIS
// ============================================================================

/**
 * POS tag categories for entity quality filtering
 */
export const POS_CATEGORIES = {
  // Noun tags (likely entity components)
  NOUN: new Set(['NN', 'NNS', 'NNP', 'NNPS']),

  // Proper noun tags (high entity confidence)
  PROPER_NOUN: new Set(['NNP', 'NNPS']),

  // Verb tags (unlikely to be entities)
  VERB: new Set(['VB', 'VBD', 'VBG', 'VBN', 'VBP', 'VBZ']),

  // Adjective tags (entity descriptors)
  ADJECTIVE: new Set(['JJ', 'JJR', 'JJS']),

  // Determiner/article tags (sentence-initial indicators)
  DETERMINER: new Set(['DT', 'PDT', 'WDT']),

  // Pronoun tags (should be resolved, not entities)
  PRONOUN: new Set(['PRP', 'PRP$', 'WP', 'WP$']),

  // Punctuation
  PUNCTUATION: new Set(['.', ',', ':', ';', '!', '?', '-LRB-', '-RRB-', '``', "''", '"']),
};

/**
 * Analyze POS tags for an entity mention
 */
export interface POSAnalysis {
  tokens: BookNLPToken[];
  isAllProperNouns: boolean;
  hasProperNoun: boolean;
  hasCommonNoun: boolean;
  isVerb: boolean;
  isPronoun: boolean;
  leadingDeterminer: boolean;
  posSequence: string[];
}

/**
 * Analyze POS tags for tokens in a mention span
 */
export function analyzePOS(tokens: BookNLPToken[]): POSAnalysis {
  if (!tokens.length) {
    return {
      tokens: [],
      isAllProperNouns: false,
      hasProperNoun: false,
      hasCommonNoun: false,
      isVerb: false,
      isPronoun: false,
      leadingDeterminer: false,
      posSequence: [],
    };
  }

  const posSequence = tokens.map(t => t.pos);
  const isAllProperNouns = tokens.every(t => POS_CATEGORIES.PROPER_NOUN.has(t.pos));
  const hasProperNoun = tokens.some(t => POS_CATEGORIES.PROPER_NOUN.has(t.pos));
  const hasCommonNoun = tokens.some(t => POS_CATEGORIES.NOUN.has(t.pos) && !POS_CATEGORIES.PROPER_NOUN.has(t.pos));
  const isVerb = tokens.length === 1 && POS_CATEGORIES.VERB.has(tokens[0].pos);
  const isPronoun = tokens.length === 1 && POS_CATEGORIES.PRONOUN.has(tokens[0].pos);
  const leadingDeterminer = POS_CATEGORIES.DETERMINER.has(tokens[0].pos);

  return {
    tokens,
    isAllProperNouns,
    hasProperNoun,
    hasCommonNoun,
    isVerb,
    isPronoun,
    leadingDeterminer,
    posSequence,
  };
}

/**
 * Get entity quality signals from POS analysis
 */
export interface POSQualitySignals {
  /** All tokens are proper nouns - high confidence entity */
  highConfidence: boolean;
  /** Has at least one proper noun - medium confidence */
  mediumConfidence: boolean;
  /** Is a verb or pronoun - should not be an entity */
  shouldReject: boolean;
  /** Starts with determiner - may be common phrase, not entity */
  suspiciousStart: boolean;
  /** Confidence adjustment factor (0.5 to 1.2) */
  confidenceMultiplier: number;
}

/**
 * Get quality signals for entity filtering from POS tags
 */
export function getPOSQualitySignals(analysis: POSAnalysis): POSQualitySignals {
  // Reject verbs and pronouns
  if (analysis.isVerb || analysis.isPronoun) {
    return {
      highConfidence: false,
      mediumConfidence: false,
      shouldReject: true,
      suspiciousStart: false,
      confidenceMultiplier: 0.5,
    };
  }

  // All proper nouns = high confidence
  if (analysis.isAllProperNouns) {
    return {
      highConfidence: true,
      mediumConfidence: true,
      shouldReject: false,
      suspiciousStart: false,
      confidenceMultiplier: 1.2,
    };
  }

  // Has proper noun = medium confidence
  if (analysis.hasProperNoun) {
    return {
      highConfidence: false,
      mediumConfidence: true,
      shouldReject: false,
      suspiciousStart: analysis.leadingDeterminer,
      confidenceMultiplier: 1.0,
    };
  }

  // Common nouns only - lower confidence
  if (analysis.hasCommonNoun) {
    return {
      highConfidence: false,
      mediumConfidence: false,
      shouldReject: false,
      suspiciousStart: analysis.leadingDeterminer,
      confidenceMultiplier: 0.8,
    };
  }

  // Other cases
  return {
    highConfidence: false,
    mediumConfidence: false,
    shouldReject: false,
    suspiciousStart: analysis.leadingDeterminer,
    confidenceMultiplier: 0.7,
  };
}

// ============================================================================
// MAIN ANALYZER CLASS
// ============================================================================

/**
 * Token Analyzer - comprehensive token analysis
 */
export class TokenAnalyzer {
  private tokens: BookNLPToken[];
  private index: TokenIndex;
  private paragraphs: Paragraph[];
  private sentences: SentenceBoundary[];

  constructor(tokens: BookNLPToken[]) {
    this.tokens = tokens;
    this.index = buildTokenIndex(tokens);
    this.paragraphs = extractParagraphs(tokens);
    this.sentences = extractSentences(tokens);
  }

  /**
   * Get all tokens
   */
  getTokens(): BookNLPToken[] {
    return this.tokens;
  }

  /**
   * Get token index
   */
  getIndex(): TokenIndex {
    return this.index;
  }

  /**
   * Get paragraphs
   */
  getParagraphs(): Paragraph[] {
    return this.paragraphs;
  }

  /**
   * Get sentences
   */
  getSentences(): SentenceBoundary[] {
    return this.sentences;
  }

  /**
   * Find tokens by lemma
   */
  findByLemma(lemma: string): BookNLPToken[] {
    return findByLemma(this.index, lemma);
  }

  /**
   * Find tokens in character range
   */
  findInRange(startChar: number, endChar: number): BookNLPToken[] {
    return findTokensInRange(this.index, startChar, endChar);
  }

  /**
   * Analyze POS for a mention
   */
  analyzeMentionPOS(startChar: number, endChar: number): POSAnalysis {
    const tokens = this.findInRange(startChar, endChar);
    return analyzePOS(tokens);
  }

  /**
   * Get quality signals for a mention
   */
  getQualitySignals(startChar: number, endChar: number): POSQualitySignals {
    const analysis = this.analyzeMentionPOS(startChar, endChar);
    return getPOSQualitySignals(analysis);
  }

  /**
   * Get sentence at character position
   */
  getSentenceAt(charPosition: number): SentenceBoundary | undefined {
    return this.sentences.find(
      s => charPosition >= s.startChar && charPosition < s.endChar
    );
  }

  /**
   * Get paragraph at character position
   */
  getParagraphAt(charPosition: number): Paragraph | undefined {
    return this.paragraphs.find(
      p => charPosition >= p.startChar && charPosition < p.endChar
    );
  }

  /**
   * Check if position is at sentence start
   */
  isSentenceStart(charPosition: number): boolean {
    const token = findTokenAtChar(this.index, charPosition);
    if (!token) return false;

    const sentence = this.getSentenceAt(charPosition);
    return sentence ? sentence.startToken === token.idx : false;
  }

  /**
   * Check if position is at paragraph start
   */
  isParagraphStart(charPosition: number): boolean {
    const token = findTokenAtChar(this.index, charPosition);
    if (!token) return false;

    const paragraph = this.getParagraphAt(charPosition);
    return paragraph ? paragraph.startToken === token.idx : false;
  }

  /**
   * Get statistics about the document structure
   */
  getStats(): {
    tokenCount: number;
    paragraphCount: number;
    sentenceCount: number;
    avgSentencesPerParagraph: number;
    avgTokensPerSentence: number;
  } {
    const tokenCount = this.tokens.length;
    const paragraphCount = this.paragraphs.length;
    const sentenceCount = this.sentences.length;

    return {
      tokenCount,
      paragraphCount,
      sentenceCount,
      avgSentencesPerParagraph: paragraphCount > 0
        ? sentenceCount / paragraphCount
        : 0,
      avgTokensPerSentence: sentenceCount > 0
        ? tokenCount / sentenceCount
        : 0,
    };
  }
}

/**
 * Create a token analyzer from a BookNLP contract
 */
export function createTokenAnalyzer(contract: BookNLPContract): TokenAnalyzer {
  return new TokenAnalyzer(contract.tokens);
}
