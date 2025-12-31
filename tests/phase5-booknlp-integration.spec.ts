/**
 * Phase 5 Tests: Enhanced BookNLP Integration
 *
 * Verifies that the BookNLP integration:
 * - Extracts paragraph and sentence structure from tokens
 * - Uses lemmas for entity matching
 * - Provides POS tag analysis for quality filtering
 * - Includes agent_score and quote tracking in entities
 *
 * Key invariants:
 * 1. Token structure should be extracted correctly
 * 2. Lemma-based matching should find related tokens
 * 3. POS analysis should identify quality signals
 * 4. Entities should include agent_score and quote data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractParagraphs,
  extractSentences,
  buildTokenIndex,
  findByLemma,
  findTokensInRange,
  matchEntityByLemma,
  analyzePOS,
  getPOSQualitySignals,
  TokenAnalyzer,
  createTokenAnalyzer,
  POS_CATEGORIES,
} from '../app/engine/booknlp/token-analyzer';
import {
  adaptCharacters,
  adaptBookNLPContract,
} from '../app/engine/booknlp/adapter';
import type {
  BookNLPToken,
  BookNLPCharacter,
  BookNLPQuote,
  BookNLPContract,
} from '../app/engine/booknlp/types';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createTestToken(overrides: Partial<BookNLPToken> = {}): BookNLPToken {
  return {
    idx: 0,
    text: 'word',
    lemma: 'word',
    pos: 'NN',
    ner: 'O',
    start_char: 0,
    end_char: 4,
    sentence_idx: 0,
    paragraph_idx: 0,
    ...overrides,
  };
}

function createTestCharacter(overrides: Partial<BookNLPCharacter> = {}): BookNLPCharacter {
  return {
    id: `char_${Math.random().toString(36).substr(2, 9)}`,
    canonical_name: 'Test Character',
    aliases: [],
    mention_count: 5,
    gender: null,
    agent_score: 0.5,
    ...overrides,
  };
}

function createTestQuote(overrides: Partial<BookNLPQuote> = {}): BookNLPQuote {
  return {
    id: `quote_${Math.random().toString(36).substr(2, 9)}`,
    text: '"Hello," he said.',
    start_token: 0,
    end_token: 4,
    start_char: 0,
    end_char: 17,
    speaker_id: null,
    speaker_name: null,
    addressee_id: null,
    quote_type: 'explicit',
    ...overrides,
  };
}

function createTestContract(overrides: Partial<BookNLPContract> = {}): BookNLPContract {
  return {
    schema_version: '1.0',
    document_id: 'test-doc',
    metadata: {
      booknlp_version: '1.0',
      text_length: 100,
      text_hash: 'abc123',
      processing_time_seconds: 1.5,
      token_count: 20,
      sentence_count: 3,
      character_count: 2,
      mention_count: 10,
      quote_count: 2,
    },
    characters: [],
    mentions: [],
    coref_chains: [],
    quotes: [],
    tokens: [],
    ...overrides,
  };
}

// ============================================================================
// PHASE 5.1: TOKEN-BASED STRUCTURE
// ============================================================================

describe('Phase 5.1: Token-Based Structure', () => {
  describe('extractParagraphs', () => {
    it('should extract paragraph structure from tokens', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, paragraph_idx: 0, sentence_idx: 0, start_char: 0, end_char: 5 }),
        createTestToken({ idx: 1, paragraph_idx: 0, sentence_idx: 0, start_char: 6, end_char: 10 }),
        createTestToken({ idx: 2, paragraph_idx: 1, sentence_idx: 1, start_char: 12, end_char: 18 }),
        createTestToken({ idx: 3, paragraph_idx: 1, sentence_idx: 1, start_char: 19, end_char: 25 }),
      ];

      const paragraphs = extractParagraphs(tokens);

      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0].index).toBe(0);
      expect(paragraphs[0].startToken).toBe(0);
      expect(paragraphs[0].endToken).toBe(1);
      expect(paragraphs[1].index).toBe(1);
      expect(paragraphs[1].startToken).toBe(2);
      expect(paragraphs[1].endToken).toBe(3);
    });

    it('should track sentences within paragraphs', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, paragraph_idx: 0, sentence_idx: 0 }),
        createTestToken({ idx: 1, paragraph_idx: 0, sentence_idx: 0 }),
        createTestToken({ idx: 2, paragraph_idx: 0, sentence_idx: 1 }),
        createTestToken({ idx: 3, paragraph_idx: 0, sentence_idx: 1 }),
      ];

      const paragraphs = extractParagraphs(tokens);

      expect(paragraphs).toHaveLength(1);
      expect(paragraphs[0].sentences).toContain(0);
      expect(paragraphs[0].sentences).toContain(1);
    });

    it('should handle empty token array', () => {
      const paragraphs = extractParagraphs([]);
      expect(paragraphs).toHaveLength(0);
    });
  });

  describe('extractSentences', () => {
    it('should extract sentence boundaries from tokens', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, sentence_idx: 0, start_char: 0, end_char: 5 }),
        createTestToken({ idx: 1, sentence_idx: 0, start_char: 6, end_char: 10 }),
        createTestToken({ idx: 2, sentence_idx: 1, start_char: 12, end_char: 18 }),
      ];

      const sentences = extractSentences(tokens);

      expect(sentences).toHaveLength(2);
      expect(sentences[0].startChar).toBe(0);
      expect(sentences[0].endChar).toBe(10);
      expect(sentences[1].startChar).toBe(12);
      expect(sentences[1].endChar).toBe(18);
    });

    it('should track paragraph for each sentence', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, paragraph_idx: 0, sentence_idx: 0 }),
        createTestToken({ idx: 1, paragraph_idx: 1, sentence_idx: 1 }),
      ];

      const sentences = extractSentences(tokens);

      expect(sentences[0].paragraphIndex).toBe(0);
      expect(sentences[1].paragraphIndex).toBe(1);
    });
  });

  describe('Lemma-Based Matching', () => {
    it('should build token index by lemma', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, text: 'running', lemma: 'run' }),
        createTestToken({ idx: 1, text: 'runs', lemma: 'run' }),
        createTestToken({ idx: 2, text: 'walked', lemma: 'walk' }),
      ];

      const index = buildTokenIndex(tokens);

      const runTokens = findByLemma(index, 'run');
      expect(runTokens).toHaveLength(2);

      const walkTokens = findByLemma(index, 'walk');
      expect(walkTokens).toHaveLength(1);
    });

    it('should be case-insensitive for lemma lookup', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, lemma: 'Run' }),
      ];

      const index = buildTokenIndex(tokens);

      expect(findByLemma(index, 'run')).toHaveLength(1);
      expect(findByLemma(index, 'RUN')).toHaveLength(1);
    });

    it('should find tokens in character range', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, start_char: 0, end_char: 5 }),
        createTestToken({ idx: 1, start_char: 6, end_char: 10 }),
        createTestToken({ idx: 2, start_char: 11, end_char: 15 }),
      ];

      const index = buildTokenIndex(tokens);
      // Range [3, 12) includes: chars 3-4 (token 0), chars 6-9 (token 1), char 11 (token 2)
      const found = findTokensInRange(index, 3, 12);

      expect(found).toHaveLength(3);
      expect(found[0].idx).toBe(0);
      expect(found[1].idx).toBe(1);
      expect(found[2].idx).toBe(2);
    });

    it('should match entity name by lemma', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, text: 'John', lemma: 'john' }),
        createTestToken({ idx: 1, text: 'runs', lemma: 'run' }),
        createTestToken({ idx: 2, text: 'quickly', lemma: 'quickly' }),
      ];

      const index = buildTokenIndex(tokens);
      const { exactMatches, lemmaMatches } = matchEntityByLemma('john', index);

      expect(lemmaMatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POS Tag Analysis', () => {
    it('should identify proper nouns', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ pos: 'NNP' }),
        createTestToken({ pos: 'NNP' }),
      ];

      const analysis = analyzePOS(tokens);

      expect(analysis.isAllProperNouns).toBe(true);
      expect(analysis.hasProperNoun).toBe(true);
    });

    it('should identify verbs', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ pos: 'VBZ' }),
      ];

      const analysis = analyzePOS(tokens);

      expect(analysis.isVerb).toBe(true);
    });

    it('should identify pronouns', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ pos: 'PRP' }),
      ];

      const analysis = analyzePOS(tokens);

      expect(analysis.isPronoun).toBe(true);
    });

    it('should detect leading determiner', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ pos: 'DT' }),
        createTestToken({ pos: 'NN' }),
      ];

      const analysis = analyzePOS(tokens);

      expect(analysis.leadingDeterminer).toBe(true);
    });

    it('should generate quality signals for proper nouns', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ pos: 'NNP' }),
        createTestToken({ pos: 'NNP' }),
      ];

      const analysis = analyzePOS(tokens);
      const signals = getPOSQualitySignals(analysis);

      expect(signals.highConfidence).toBe(true);
      expect(signals.shouldReject).toBe(false);
      expect(signals.confidenceMultiplier).toBeGreaterThan(1.0);
    });

    it('should reject verbs and pronouns', () => {
      const verbAnalysis = analyzePOS([createTestToken({ pos: 'VB' })]);
      const verbSignals = getPOSQualitySignals(verbAnalysis);
      expect(verbSignals.shouldReject).toBe(true);

      const pronounAnalysis = analyzePOS([createTestToken({ pos: 'PRP' })]);
      const pronounSignals = getPOSQualitySignals(pronounAnalysis);
      expect(pronounSignals.shouldReject).toBe(true);
    });
  });

  describe('TokenAnalyzer Class', () => {
    it('should provide unified access to token analysis', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, paragraph_idx: 0, sentence_idx: 0, lemma: 'test', start_char: 0, end_char: 4 }),
        createTestToken({ idx: 1, paragraph_idx: 0, sentence_idx: 0, lemma: 'word', start_char: 5, end_char: 9 }),
        createTestToken({ idx: 2, paragraph_idx: 1, sentence_idx: 1, lemma: 'test', start_char: 10, end_char: 14 }),
      ];

      const analyzer = new TokenAnalyzer(tokens);

      expect(analyzer.getTokens()).toHaveLength(3);
      expect(analyzer.getParagraphs()).toHaveLength(2);
      expect(analyzer.getSentences()).toHaveLength(2);
      expect(analyzer.findByLemma('test')).toHaveLength(2);
    });

    it('should check sentence and paragraph boundaries', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, paragraph_idx: 0, sentence_idx: 0, start_char: 0, end_char: 5 }),
        createTestToken({ idx: 1, paragraph_idx: 0, sentence_idx: 0, start_char: 6, end_char: 10 }),
      ];

      const analyzer = new TokenAnalyzer(tokens);

      expect(analyzer.isSentenceStart(0)).toBe(true);
      expect(analyzer.isSentenceStart(6)).toBe(false);
      expect(analyzer.isParagraphStart(0)).toBe(true);
    });

    it('should get quality signals for a mention', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, pos: 'NNP', start_char: 0, end_char: 5 }),
        createTestToken({ idx: 1, pos: 'NNP', start_char: 6, end_char: 10 }),
      ];

      const analyzer = new TokenAnalyzer(tokens);
      const signals = analyzer.getQualitySignals(0, 10);

      expect(signals.highConfidence).toBe(true);
      expect(signals.confidenceMultiplier).toBeGreaterThan(1.0);
    });

    it('should provide document stats', () => {
      const tokens: BookNLPToken[] = [
        createTestToken({ idx: 0, paragraph_idx: 0, sentence_idx: 0 }),
        createTestToken({ idx: 1, paragraph_idx: 0, sentence_idx: 0 }),
        createTestToken({ idx: 2, paragraph_idx: 0, sentence_idx: 1 }),
        createTestToken({ idx: 3, paragraph_idx: 1, sentence_idx: 2 }),
      ];

      const analyzer = new TokenAnalyzer(tokens);
      const stats = analyzer.getStats();

      expect(stats.tokenCount).toBe(4);
      expect(stats.paragraphCount).toBe(2);
      expect(stats.sentenceCount).toBe(3);
    });
  });
});

// ============================================================================
// PHASE 5.2: ENHANCED ENTITY PROFILES
// ============================================================================

describe('Phase 5.2: Enhanced Entity Profiles', () => {
  describe('adaptCharacters with agent_score', () => {
    it('should include agent_score in adapted entities', () => {
      const characters = [
        createTestCharacter({
          id: 'char_1',
          canonical_name: 'Harry Potter',
          agent_score: 0.85,
        }),
      ];

      const entities = adaptCharacters(characters);

      expect(entities[0].agent_score).toBe(0.85);
    });

    it('should handle missing agent_score', () => {
      const characters = [
        {
          ...createTestCharacter(),
          agent_score: undefined as unknown as number,
        },
      ];

      const entities = adaptCharacters(characters);

      expect(entities[0].agent_score).toBeUndefined();
    });
  });

  describe('Quote tracking per entity', () => {
    it('should count quotes attributed to each character', () => {
      const characters = [
        createTestCharacter({ id: 'char_1', canonical_name: 'Gandalf' }),
        createTestCharacter({ id: 'char_2', canonical_name: 'Frodo' }),
      ];

      const quotes: BookNLPQuote[] = [
        createTestQuote({ id: 'q1', speaker_id: 'char_1' }),
        createTestQuote({ id: 'q2', speaker_id: 'char_1' }),
        createTestQuote({ id: 'q3', speaker_id: 'char_2' }),
      ];

      const entities = adaptCharacters(characters, quotes);

      const gandalf = entities.find(e => e.canonical === 'Gandalf');
      const frodo = entities.find(e => e.canonical === 'Frodo');

      expect(gandalf?.quote_count).toBe(2);
      expect(gandalf?.quote_ids).toContain('q1');
      expect(gandalf?.quote_ids).toContain('q2');
      expect(frodo?.quote_count).toBe(1);
      expect(frodo?.quote_ids).toContain('q3');
    });

    it('should handle characters with no quotes', () => {
      const characters = [
        createTestCharacter({ id: 'char_1', canonical_name: 'Silent Bob' }),
      ];

      const quotes: BookNLPQuote[] = [
        createTestQuote({ speaker_id: 'char_other' }),
      ];

      const entities = adaptCharacters(characters, quotes);

      expect(entities[0].quote_count).toBeUndefined();
      expect(entities[0].quote_ids).toBeUndefined();
    });

    it('should handle quotes with no speaker', () => {
      const characters = [
        createTestCharacter({ id: 'char_1', canonical_name: 'Test' }),
      ];

      const quotes: BookNLPQuote[] = [
        createTestQuote({ speaker_id: null }),
      ];

      const entities = adaptCharacters(characters, quotes);

      expect(entities[0].quote_count).toBeUndefined();
    });
  });

  describe('Full contract adaptation', () => {
    it('should include all enhanced data in adapted result', () => {
      const contract = createTestContract({
        characters: [
          createTestCharacter({
            id: 'char_gandalf',
            canonical_name: 'Gandalf',
            agent_score: 0.9,
            mention_count: 50,
            gender: 'male',
          }),
        ],
        quotes: [
          createTestQuote({ id: 'q1', speaker_id: 'char_gandalf' }),
          createTestQuote({ id: 'q2', speaker_id: 'char_gandalf' }),
        ],
        tokens: [
          createTestToken({ idx: 0 }),
        ],
        mentions: [],
        coref_chains: [],
      });

      const result = adaptBookNLPContract(contract);

      expect(result.entities).toHaveLength(1);
      const gandalf = result.entities[0];

      expect(gandalf.canonical).toBe('Gandalf');
      expect(gandalf.agent_score).toBe(0.9);
      expect(gandalf.mention_count).toBe(50);
      expect(gandalf.gender).toBe('male');
      expect(gandalf.quote_count).toBe(2);
      expect(gandalf.quote_ids).toHaveLength(2);
    });
  });
});

// ============================================================================
// PHASE 5.3: QUOTE INTEGRATION
// ============================================================================

describe('Phase 5.3: Quote Integration', () => {
  describe('Quote to entity linkage', () => {
    it('should maintain quote-to-speaker relationships', () => {
      const contract = createTestContract({
        characters: [
          createTestCharacter({ id: 'char_1', canonical_name: 'Speaker' }),
        ],
        quotes: [
          createTestQuote({
            id: 'quote_1',
            text: '"Hello, world!"',
            speaker_id: 'char_1',
            speaker_name: 'Speaker',
          }),
        ],
        tokens: [],
        mentions: [],
        coref_chains: [],
      });

      const result = adaptBookNLPContract(contract);

      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0].speaker_name).toBe('Speaker');
      expect(result.quotes[0].confidence).toBe(0.9); // High confidence when speaker known
    });

    it('should lower confidence for quotes without speaker', () => {
      const contract = createTestContract({
        quotes: [
          createTestQuote({
            speaker_id: null,
            speaker_name: null,
          }),
        ],
        characters: [],
        tokens: [],
        mentions: [],
        coref_chains: [],
      });

      const result = adaptBookNLPContract(contract);

      expect(result.quotes[0].confidence).toBe(0.5); // Lower confidence
    });
  });

  describe('Quote evidence linking', () => {
    it('should preserve quote character positions', () => {
      const contract = createTestContract({
        quotes: [
          createTestQuote({
            text: '"I am Gandalf!"',
            start_char: 100,
            end_char: 115,
          }),
        ],
        characters: [],
        tokens: [],
        mentions: [],
        coref_chains: [],
      });

      const result = adaptBookNLPContract(contract);

      expect(result.quotes[0].start).toBe(100);
      expect(result.quotes[0].end).toBe(115);
      expect(result.quotes[0].text).toBe('"I am Gandalf!"');
    });
  });
});

// ============================================================================
// POS CATEGORIES
// ============================================================================

describe('POS Categories', () => {
  it('should classify noun tags correctly', () => {
    expect(POS_CATEGORIES.NOUN.has('NN')).toBe(true);
    expect(POS_CATEGORIES.NOUN.has('NNS')).toBe(true);
    expect(POS_CATEGORIES.NOUN.has('NNP')).toBe(true);
    expect(POS_CATEGORIES.NOUN.has('NNPS')).toBe(true);
  });

  it('should classify proper noun tags correctly', () => {
    expect(POS_CATEGORIES.PROPER_NOUN.has('NNP')).toBe(true);
    expect(POS_CATEGORIES.PROPER_NOUN.has('NNPS')).toBe(true);
    expect(POS_CATEGORIES.PROPER_NOUN.has('NN')).toBe(false);
  });

  it('should classify verb tags correctly', () => {
    expect(POS_CATEGORIES.VERB.has('VB')).toBe(true);
    expect(POS_CATEGORIES.VERB.has('VBD')).toBe(true);
    expect(POS_CATEGORIES.VERB.has('VBG')).toBe(true);
    expect(POS_CATEGORIES.VERB.has('VBN')).toBe(true);
    expect(POS_CATEGORIES.VERB.has('VBP')).toBe(true);
    expect(POS_CATEGORIES.VERB.has('VBZ')).toBe(true);
  });

  it('should classify pronoun tags correctly', () => {
    expect(POS_CATEGORIES.PRONOUN.has('PRP')).toBe(true);
    expect(POS_CATEGORIES.PRONOUN.has('PRP$')).toBe(true);
    expect(POS_CATEGORIES.PRONOUN.has('WP')).toBe(true);
    expect(POS_CATEGORIES.PRONOUN.has('WP$')).toBe(true);
  });
});
