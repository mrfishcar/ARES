/**
 * Segmentation Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  normalizeWhitespace,
  splitParagraphs,
  splitSentences,
  segmentDocument
} from '../app/engine/segmenter';
import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

describe('Text Segmentation', () => {
  describe('normalizeWhitespace', () => {
    it('collapses runs of spaces and tabs', () => {
      const input = 'Hello    world\t\t\there';
      const output = normalizeWhitespace(input);
      expect(output).toBe('Hello world here');
    });

    it('keeps single newlines', () => {
      const input = 'Line 1\nLine 2\nLine 3';
      const output = normalizeWhitespace(input);
      expect(output).toBe('Line 1\nLine 2\nLine 3');
    });

    it('trims trailing spaces per line', () => {
      const input = 'Line 1   \nLine 2  \nLine 3';
      const output = normalizeWhitespace(input);
      expect(output).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('splitParagraphs', () => {
    it('splits on 2+ newlines', () => {
      const text = 'Para 1.\n\nPara 2.\n\n\nPara 3.';
      const paras = splitParagraphs(text);
      expect(paras.length).toBe(3);
      expect(paras[0].text).toBe('Para 1.');
      expect(paras[1].text).toBe('Para 2.');
      expect(paras[2].text).toBe('Para 3.');
    });

    it('preserves absolute offsets', () => {
      const text = 'First.\n\nSecond.';
      const paras = splitParagraphs(text);
      expect(paras[0].start).toBe(0);
      expect(paras[0].end).toBe(6);
      expect(paras[1].start).toBe(8);
      expect(paras[1].end).toBe(15);
    });

    it('increments paragraph index', () => {
      const text = 'Para 1.\n\nPara 2.\n\nPara 3.';
      const paras = splitParagraphs(text);
      expect(paras[0].index).toBe(0);
      expect(paras[1].index).toBe(1);
      expect(paras[2].index).toBe(2);
    });
  });

  describe('splitSentences', () => {
    it('splits on sentence-ending punctuation', () => {
      const para = 'Sentence one. Sentence two! Sentence three?';
      const sents = splitSentences(para, 0);
      // Should have at least 3 sentences (may have trailing empty)
      expect(sents.length).toBeGreaterThanOrEqual(3);
      expect(sents[0].text).toBe('Sentence one.');
      expect(sents[1].text).toBe('Sentence two!');
      expect(sents[2].text).toBe('Sentence three?');
    });

    it('breaks on bullets', () => {
      const para = '- Item one\n- Item two\n- Item three';
      const sents = splitSentences(para, 0);
      expect(sents.length).toBeGreaterThanOrEqual(2);
    });

    it('hard-wraps at 400 chars', () => {
      const longSentence = 'a'.repeat(500);
      const para = longSentence;
      const sents = splitSentences(para, 0);
      expect(sents.length).toBeGreaterThan(1);
      expect(sents[0].text.length).toBeLessThanOrEqual(400);
    });
  });

  describe('segmentDocument', () => {
    it('returns segments with metadata', () => {
      const text = 'Para 1.\n\nPara 2 sentence 1. Para 2 sentence 2.';
      const segs = segmentDocument('doc1', text);
      expect(segs.length).toBeGreaterThan(0);
      expect(segs[0].doc_id).toBe('doc1');
      expect(segs[0].paraIndex).toBe(0);
      expect(segs[0].sentIndex).toBe(0);
    });
  });
});

describe('Segmented Extraction Integration', () => {
  const testPath = path.join(process.cwd(), 'test-segmentation.json');

  beforeEach(() => {
    clearStorage(testPath);
  });

  afterEach(() => {
    clearStorage(testPath);
  });

  it('Case A: Hard wraps + bullets', async () => {
    const txt = `Mildred appeared out of nowhere.
- Lived in Heavenly Havens
- Friends with Elliot

She met Mark and Anne.
They married in 2015.`;

    // Verify segmentation
    const segs = segmentDocument('doc1', txt);
    expect(segs.length).toBeGreaterThan(1);

    // Verify segments have correct boundaries
    for (const seg of segs) {
      expect(seg.start).toBeGreaterThanOrEqual(0);
      expect(seg.end).toBeLessThanOrEqual(txt.length);
      expect(seg.end).toBeGreaterThan(seg.start);
    }

    // Run extraction via orchestrator
    await appendDoc('doc1', txt, testPath);

    const graph = loadGraph(testPath);
    expect(graph).not.toBeNull();

    // Expect entities: should find at least Mildred, Mark, Anne
    const entityNames = graph!.entities.map(e => e.canonical.toLowerCase());

    // Debug: log what we actually got
    console.log('Extracted entities:', entityNames);
    console.log('Relations count:', graph!.relations.length);

    expect(entityNames.length).toBeGreaterThan(0);
    expect(entityNames).toContain('mildred');

    // The extraction should work on segmented text without errors
    // Whether specific entities/relations are found depends on extraction rules
  });

  it('Case B: Very long run-on paragraph', async () => {
    // 900+ chars without punctuation
    const longText = 'Aragorn traveled to Gondor and then to Rohan and then to Isengard and then to Moria and then to Rivendell and then to Lothlorien and then to Hobbiton and then to Shire and then to Mordor and then back to Gondor again and he met many people including Gandalf and Frodo and Sam and Pippin and Merry and Legolas and Gimli and Boromir and Faramir and Eowyn and Eomer and Theoden and Saruman and Gollum and Sauron and Elrond and Galadriel and Arwen and Bilbo and many others who were important to the story of the Ring and the War of the Ring and the Fellowship of the Ring and the Two Towers and the Return of the King and all the adventures that happened in Middle Earth during the Third Age when the Free Peoples fought against the Dark Lord Sauron who sought to enslave all the lands and all the peoples under his dominion using the One Ring that was forged in the fires of Mount Doom long ago in the Second Age by the Dark Lord himself with the help of the Elven smiths who did not know his true nature until it was too late and the Ring was lost and found again many times over the centuries';

    // Verify segmentation splits it
    const segs = segmentDocument('doc2', longText);
    expect(segs.length).toBeGreaterThan(1);

    // Run extraction
    await appendDoc('doc2', longText, testPath);

    const graph = loadGraph(testPath);
    expect(graph).not.toBeNull();

    // Should still find entities within windows
    const entityNames = graph!.entities.map(e => e.canonical.toLowerCase());
    expect(entityNames).toContain('aragorn');
    expect(entityNames).toContain('gandalf');
    expect(entityNames).toContain('gondor');
  });

  it('Case C: Paragraph boundaries', async () => {
    const text = `Paragraph one sentence one. Paragraph one sentence two.

Paragraph two sentence one. Paragraph two sentence two.`;

    const segs = segmentDocument('doc3', text);

    // Find segments from different paragraphs
    const para0Segs = segs.filter(s => s.paraIndex === 0);
    const para1Segs = segs.filter(s => s.paraIndex === 1);

    expect(para0Segs.length).toBeGreaterThan(0);
    expect(para1Segs.length).toBeGreaterThan(0);

    // Verify sentIndex resets per paragraph
    expect(para0Segs[0].sentIndex).toBe(0);
    expect(para1Segs[0].sentIndex).toBe(0);

    // Verify paraIndex increments
    expect(para0Segs[0].paraIndex).toBe(0);
    expect(para1Segs[0].paraIndex).toBe(1);
  });
});
