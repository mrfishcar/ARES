/**
 * Pipeline Extraction Integration Tests
 *
 * Tests the new grammar-first extraction pipeline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runExtractionPipeline } from '../../app/engine/extract/pipeline';
import type { ParsedSentence } from '../../app/engine/extract/parse-types';

// Mock parsed sentences for testing
function createMockSentence(
  tokens: Array<{ text: string; pos: string; dep: string; ent: string }>,
  sentenceIndex: number = 0
): ParsedSentence {
  let offset = 0;
  const parsedTokens = tokens.map((t, i) => {
    const start = offset;
    const end = offset + t.text.length;
    offset = end + 1; // +1 for space

    return {
      i,
      text: t.text,
      lemma: t.text.toLowerCase(),
      pos: t.pos,
      tag: t.pos === 'PROPN' ? 'NNP' : t.pos === 'VERB' ? 'VB' : t.pos,
      dep: t.dep,
      head: i > 0 ? 0 : -1,
      ent: t.ent,
      start,
      end,
    };
  });

  const text = tokens.map(t => t.text).join(' ');
  return {
    sentence_index: sentenceIndex,
    tokens: parsedTokens,
    start: 0,
    end: text.length,
  };
}

describe('Pipeline Extraction', () => {
  describe('Meaning Gate', () => {
    it('should reject verb phrases', () => {
      // Set ent to a fake label so it gets nominated, then rejected
      const sentences: ParsedSentence[] = [
        createMockSentence([
          { text: 'only', pos: 'ADV', dep: 'advmod', ent: 'MISC' },
          { text: 'agree', pos: 'VERB', dep: 'ROOT', ent: 'MISC' },
        ]),
      ];

      const text = 'only agree';
      const result = runExtractionPipeline(sentences, text);

      expect(result.entities).toHaveLength(0);
      expect(result.stats.gateResults.nonEntity).toBeGreaterThan(0);
    });

    it('should reject PP-led fragments', () => {
      const sentences: ParsedSentence[] = [
        createMockSentence([
          { text: 'with', pos: 'ADP', dep: 'prep', ent: '' },
          { text: 'teachers', pos: 'NOUN', dep: 'pobj', ent: '' },
        ]),
      ];

      const text = 'with teachers';
      const result = runExtractionPipeline(sentences, text);

      // Should reject "with teachers" but may extract "teachers" as NP object
      const hasFullPP = result.entities.some(e => e.canonical === 'with teachers');
      expect(hasFullPP).toBe(false);
    });

    it('should reject discourse markers', () => {
      // Set ent to a fake label so it gets nominated, then rejected
      const sentences: ParsedSentence[] = [
        createMockSentence([
          { text: 'However', pos: 'ADV', dep: 'advmod', ent: 'MISC' },
        ]),
      ];

      const text = 'However';
      const result = runExtractionPipeline(sentences, text);

      expect(result.entities).toHaveLength(0);
      expect(result.stats.gateResults.nonEntity).toBeGreaterThan(0);
    });

    it('should accept proper noun PERSON entities', () => {
      const sentences: ParsedSentence[] = [
        createMockSentence([
          { text: 'Barty', pos: 'PROPN', dep: 'nsubj', ent: 'PERSON' },
          { text: 'Beauregard', pos: 'PROPN', dep: 'flat', ent: 'PERSON' },
        ]),
      ];

      const text = 'Barty Beauregard';
      const result = runExtractionPipeline(sentences, text, {
        promotion: {
          mentionThreshold: 1, // Lower for testing
          allowStrongNERSingleton: true,
          allowIntroductionPattern: true,
          whitelist: new Set(),
        },
      });

      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities.some(e => e.canonical.includes('Barty'))).toBe(true);
    });
  });

  describe('Promotion Gate', () => {
    it('should defer single-mention entities by default', () => {
      // Use multi-token MISC NER span to avoid sentence-initial filtering
      // This should pass the Gate but fail promotion due to threshold + weak NER
      const sentences: ParsedSentence[] = [
        createMockSentence([
          { text: 'The', pos: 'DET', dep: 'det', ent: '' },
          { text: 'Random', pos: 'PROPN', dep: 'compound', ent: 'MISC' },
          { text: 'Guild', pos: 'PROPN', dep: 'pobj', ent: 'MISC' },
        ]),
      ];

      const text = 'The Random Guild';
      const result = runExtractionPipeline(sentences, text, {
        promotion: {
          mentionThreshold: 2,
          allowStrongNERSingleton: false,
          allowIntroductionPattern: false,
          whitelist: new Set(),
        },
      });

      expect(result.entities).toHaveLength(0);
      expect(result.stats.clustersDeferred).toBeGreaterThan(0);
    });

    it('should promote multi-mention entities', () => {
      const sentences: ParsedSentence[] = [
        createMockSentence([
          { text: 'Harry', pos: 'PROPN', dep: 'nsubj', ent: 'PERSON' },
        ], 0),
        createMockSentence([
          { text: 'Harry', pos: 'PROPN', dep: 'nsubj', ent: 'PERSON' },
        ], 1),
      ];

      const text = 'Harry said hello. Harry went home.';
      const result = runExtractionPipeline(sentences, text, {
        promotion: {
          mentionThreshold: 2,
          allowStrongNERSingleton: false,
          allowIntroductionPattern: false,
          whitelist: new Set(),
        },
      });

      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.stats.clustersPromoted).toBeGreaterThan(0);
    });
  });

  describe('Stats Integrity', () => {
    it('should have honest stats - rejected > 0 when junk exists', () => {
      // Include NER-labeled junk so it gets nominated, then rejected
      const sentences: ParsedSentence[] = [
        createMockSentence([
          { text: 'only', pos: 'ADV', dep: 'advmod', ent: 'MISC' },
          { text: 'agree', pos: 'VERB', dep: 'ROOT', ent: 'MISC' },
        ]),
        createMockSentence([
          { text: 'Harry', pos: 'PROPN', dep: 'nsubj', ent: 'PERSON' },
        ], 1),
      ];

      const text = 'only agree. Harry said.';
      const result = runExtractionPipeline(sentences, text);

      // Stats should show rejection happened
      expect(result.stats.gateResults.nonEntity).toBeGreaterThan(0);
      expect(result.stats.totalNominations).toBeGreaterThan(0);
    });

    it('should count all nomination sources', () => {
      const sentences: ParsedSentence[] = [
        createMockSentence([
          { text: 'Harry', pos: 'PROPN', dep: 'nsubj', ent: 'PERSON' },
          { text: 'Potter', pos: 'PROPN', dep: 'flat', ent: 'PERSON' },
        ]),
      ];

      const text = 'Harry Potter';
      const result = runExtractionPipeline(sentences, text);

      expect(result.stats.totalNominations).toBeGreaterThan(0);
      expect(result.stats.nominationsBySource.NER + result.stats.nominationsBySource.DEP).toBeGreaterThan(0);
    });
  });
});
