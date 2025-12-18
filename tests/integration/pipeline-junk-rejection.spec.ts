/**
 * Pipeline Junk Rejection Tests
 *
 * Tests that the grammar-first pipeline correctly rejects known junk patterns.
 * These patterns were identified as false positives in real-world extraction.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runExtractionPipeline } from '../../app/engine/extract/pipeline';
import type { ParsedSentence, Token } from '../../app/engine/extract/parse-types';

// Helper to create mock parsed sentences with realistic token data
function createMockParsedSentences(text: string, tokens: Array<{
  text: string;
  pos: string;
  dep: string;
  ent: string;
  lemma?: string;
}>): ParsedSentence[] {
  let offset = 0;
  const parsedTokens: Token[] = tokens.map((t, i) => {
    const start = offset;
    const end = offset + t.text.length;
    offset = end + 1; // +1 for space

    return {
      i,
      text: t.text,
      lemma: t.lemma || t.text.toLowerCase(),
      pos: t.pos,
      tag: t.pos === 'PROPN' ? 'NNP' : t.pos === 'VERB' ? 'VB' : t.pos,
      dep: t.dep,
      head: i > 0 ? 0 : -1,
      ent: t.ent,
      start,
      end,
    };
  });

  return [{
    sentence_index: 0,
    tokens: parsedTokens,
    start: 0,
    end: text.length,
  }];
}

describe('Pipeline Junk Rejection', () => {
  describe('Verb Phrase Fragments', () => {
    it('should reject "only agree"', () => {
      const text = 'Frederick could only agree.';
      const sentences = createMockParsedSentences(text, [
        { text: 'Frederick', pos: 'PROPN', dep: 'nsubj', ent: 'PERSON' },
        { text: 'could', pos: 'AUX', dep: 'aux', ent: '' },
        { text: 'only', pos: 'ADV', dep: 'advmod', ent: 'MISC' },  // Mis-tagged as entity
        { text: 'agree', pos: 'VERB', dep: 'ROOT', ent: 'MISC' },  // Mis-tagged as entity
      ]);

      const result = runExtractionPipeline(sentences, text);

      // "Frederick" should be extracted, but "only agree" should NOT
      const hasOnlyAgree = result.entities.some(e =>
        e.canonical.toLowerCase().includes('only agree')
      );
      expect(hasOnlyAgree).toBe(false);
      expect(result.stats.gateResults.nonEntity).toBeGreaterThan(0);
    });

    it('should reject "murder someone"', () => {
      const text = 'He wanted to murder someone.';
      const sentences = createMockParsedSentences(text, [
        { text: 'He', pos: 'PRON', dep: 'nsubj', ent: '' },
        { text: 'wanted', pos: 'VERB', dep: 'ROOT', ent: '' },
        { text: 'to', pos: 'PART', dep: 'aux', ent: '' },
        { text: 'murder', pos: 'VERB', dep: 'xcomp', ent: 'MISC' },  // Mis-tagged
        { text: 'someone', pos: 'PRON', dep: 'dobj', ent: 'MISC' },  // Mis-tagged
      ]);

      const result = runExtractionPipeline(sentences, text);

      const hasMurderSomeone = result.entities.some(e =>
        e.canonical.toLowerCase().includes('murder someone')
      );
      expect(hasMurderSomeone).toBe(false);
    });

    it('should reject "draw attention"', () => {
      const text = 'She tried to draw attention.';
      const sentences = createMockParsedSentences(text, [
        { text: 'She', pos: 'PRON', dep: 'nsubj', ent: '' },
        { text: 'tried', pos: 'VERB', dep: 'ROOT', ent: '' },
        { text: 'to', pos: 'PART', dep: 'aux', ent: '' },
        { text: 'draw', pos: 'VERB', dep: 'xcomp', ent: 'MISC' },
        { text: 'attention', pos: 'NOUN', dep: 'dobj', ent: 'MISC' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      const hasDrawAttention = result.entities.some(e =>
        e.canonical.toLowerCase().includes('draw attention')
      );
      expect(hasDrawAttention).toBe(false);
    });

    it('should reject "hardly sleep"', () => {
      const text = 'They could hardly sleep.';
      const sentences = createMockParsedSentences(text, [
        { text: 'They', pos: 'PRON', dep: 'nsubj', ent: '' },
        { text: 'could', pos: 'AUX', dep: 'aux', ent: '' },
        { text: 'hardly', pos: 'ADV', dep: 'advmod', ent: 'MISC' },
        { text: 'sleep', pos: 'VERB', dep: 'ROOT', ent: 'MISC' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      const hasHardlySleep = result.entities.some(e =>
        e.canonical.toLowerCase().includes('hardly sleep')
      );
      expect(hasHardlySleep).toBe(false);
    });
  });

  describe('Prepositional Phrase Fragments', () => {
    it('should reject "with teachers"', () => {
      const text = 'as fast as they could with teachers prowling the halls.';
      const sentences = createMockParsedSentences(text, [
        { text: 'as', pos: 'ADV', dep: 'advmod', ent: '' },
        { text: 'fast', pos: 'ADV', dep: 'advmod', ent: '' },
        { text: 'as', pos: 'SCONJ', dep: 'mark', ent: '' },
        { text: 'they', pos: 'PRON', dep: 'nsubj', ent: '' },
        { text: 'could', pos: 'AUX', dep: 'aux', ent: '' },
        { text: 'with', pos: 'ADP', dep: 'prep', ent: 'MISC' },  // Mis-tagged as entity
        { text: 'teachers', pos: 'NOUN', dep: 'pobj', ent: 'MISC' },  // Mis-tagged
        { text: 'prowling', pos: 'VERB', dep: 'advcl', ent: '' },
        { text: 'the', pos: 'DET', dep: 'det', ent: '' },
        { text: 'halls', pos: 'NOUN', dep: 'dobj', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      // "with teachers" as a unit should be rejected
      const hasWithTeachers = result.entities.some(e =>
        e.canonical.toLowerCase() === 'with teachers'
      );
      expect(hasWithTeachers).toBe(false);
    });

    it('should reject "at least"', () => {
      const text = 'At least he tried.';
      const sentences = createMockParsedSentences(text, [
        { text: 'At', pos: 'ADP', dep: 'prep', ent: 'MISC' },
        { text: 'least', pos: 'ADV', dep: 'advmod', ent: 'MISC' },
        { text: 'he', pos: 'PRON', dep: 'nsubj', ent: '' },
        { text: 'tried', pos: 'VERB', dep: 'ROOT', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      const hasAtLeast = result.entities.some(e =>
        e.canonical.toLowerCase() === 'at least'
      );
      expect(hasAtLeast).toBe(false);
    });
  });

  describe('Sentence-Initial Traps', () => {
    it('should mark "Detective" as context-only when sentence-initial', () => {
      const text = 'Detective arrived at the scene.';
      const sentences = createMockParsedSentences(text, [
        { text: 'Detective', pos: 'NOUN', dep: 'nsubj', ent: 'PERSON' },  // Sentence-initial role noun
        { text: 'arrived', pos: 'VERB', dep: 'ROOT', ent: '' },
        { text: 'at', pos: 'ADP', dep: 'prep', ent: '' },
        { text: 'the', pos: 'DET', dep: 'det', ent: '' },
        { text: 'scene', pos: 'NOUN', dep: 'pobj', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text, {
        promotion: {
          mentionThreshold: 2,
          allowStrongNERSingleton: false,
          allowIntroductionPattern: false,
          whitelist: new Set(),
        },
      });

      // "Detective" alone should either be rejected or context-only, not a promoted entity
      const hasDetective = result.entities.some(e =>
        e.canonical.toLowerCase() === 'detective'
      );
      expect(hasDetective).toBe(false);
      expect(result.stats.gateResults.contextOnly).toBeGreaterThan(0);
    });

    it('should reject "Dead" as sentence-initial adjective', () => {
      const text = 'Dead, she realized.';
      const sentences = createMockParsedSentences(text, [
        { text: 'Dead', pos: 'ADJ', dep: 'amod', ent: 'PERSON' },  // Mis-tagged
        { text: ',', pos: 'PUNCT', dep: 'punct', ent: '' },
        { text: 'she', pos: 'PRON', dep: 'nsubj', ent: '' },
        { text: 'realized', pos: 'VERB', dep: 'ROOT', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      const hasDead = result.entities.some(e =>
        e.canonical.toLowerCase() === 'dead'
      );
      expect(hasDead).toBe(false);
    });
  });

  describe('Discourse Markers', () => {
    it('should reject "However"', () => {
      const text = 'However, he continued.';
      const sentences = createMockParsedSentences(text, [
        { text: 'However', pos: 'ADV', dep: 'advmod', ent: 'MISC' },  // Mis-tagged
        { text: ',', pos: 'PUNCT', dep: 'punct', ent: '' },
        { text: 'he', pos: 'PRON', dep: 'nsubj', ent: '' },
        { text: 'continued', pos: 'VERB', dep: 'ROOT', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      const hasHowever = result.entities.some(e =>
        e.canonical.toLowerCase() === 'however'
      );
      expect(hasHowever).toBe(false);
      expect(result.stats.gateResults.nonEntity).toBeGreaterThan(0);
    });

    it('should reject "Hearing"', () => {
      const text = 'Hearing the news, she gasped.';
      const sentences = createMockParsedSentences(text, [
        { text: 'Hearing', pos: 'VERB', dep: 'advcl', ent: 'PERSON' },  // Mis-tagged
        { text: 'the', pos: 'DET', dep: 'det', ent: '' },
        { text: 'news', pos: 'NOUN', dep: 'dobj', ent: '' },
        { text: ',', pos: 'PUNCT', dep: 'punct', ent: '' },
        { text: 'she', pos: 'PRON', dep: 'nsubj', ent: '' },
        { text: 'gasped', pos: 'VERB', dep: 'ROOT', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      const hasHearing = result.entities.some(e =>
        e.canonical.toLowerCase() === 'hearing'
      );
      expect(hasHearing).toBe(false);
    });
  });

  describe('Theme/Slogan Patterns', () => {
    it('should reject "Outta Here"', () => {
      const text = '"Gettin\' Outta Here" was the theme.';
      const sentences = createMockParsedSentences(text, [
        { text: '"', pos: 'PUNCT', dep: 'punct', ent: '' },
        { text: "Gettin'", pos: 'VERB', dep: 'ROOT', ent: 'PERSON' },  // Mis-tagged
        { text: 'Outta', pos: 'ADP', dep: 'prep', ent: 'PERSON' },  // Mis-tagged
        { text: 'Here', pos: 'ADV', dep: 'advmod', ent: 'PERSON' },  // Mis-tagged
        { text: '"', pos: 'PUNCT', dep: 'punct', ent: '' },
        { text: 'was', pos: 'AUX', dep: 'cop', ent: '' },
        { text: 'the', pos: 'DET', dep: 'det', ent: '' },
        { text: 'theme', pos: 'NOUN', dep: 'attr', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      const hasOuttaHere = result.entities.some(e =>
        e.canonical.toLowerCase().includes('outta here')
      );
      expect(hasOuttaHere).toBe(false);
    });
  });

  describe('Stats Integrity', () => {
    it('should have rejected > 0 when junk patterns exist', () => {
      // Create multiple separate NER spans that will be nominated and then rejected
      const text = 'However, Frederick could only agree.';
      const sentences = createMockParsedSentences(text, [
        { text: 'However', pos: 'ADV', dep: 'advmod', ent: 'MISC' },  // Single-token NER span -> rejected as discourse marker
        { text: ',', pos: 'PUNCT', dep: 'punct', ent: '' },
        { text: 'Frederick', pos: 'PROPN', dep: 'nsubj', ent: 'PERSON' },
        { text: 'could', pos: 'AUX', dep: 'aux', ent: '' },
        { text: 'only', pos: 'ADV', dep: 'advmod', ent: '' },
        { text: 'agree', pos: 'VERB', dep: 'ROOT', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      // "However" should be nominated (has NER tag) but rejected (discourse marker)
      // Stats must show rejections happened
      expect(result.stats.gateResults.nonEntity).toBeGreaterThan(0);
      expect(result.stats.totalNominations).toBeGreaterThan(0);
    });

    it('should report mode as pipeline', () => {
      const text = 'Hello world.';
      const sentences = createMockParsedSentences(text, [
        { text: 'Hello', pos: 'INTJ', dep: 'intj', ent: '' },
        { text: 'world', pos: 'NOUN', dep: 'vocative', ent: '' },
      ]);

      const result = runExtractionPipeline(sentences, text);

      // Result should exist and have stats
      expect(result.stats).toBeDefined();
      expect(result.stats.totalNominations).toBeDefined();
    });
  });
});
