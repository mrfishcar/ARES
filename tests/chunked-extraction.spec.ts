/**
 * Chunked Long-Form Extraction Tests
 *
 * Verifies that the chunked extraction pipeline:
 * 1. Correctly splits documents into chunks
 * 2. Merges entities across chunk boundaries
 * 3. Preserves offset correctness after merging
 * 4. Maintains extraction quality comparable to legacy mode
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  splitIntoMacroChunks,
  extractFromLongDocument,
  extractWithOptimalStrategy,
  isChunkedModeEnabled,
} from '../app/engine/chunked-extraction';
import { extractFromSegments } from '../app/engine/extract/orchestrator';

describe('Chunked Long-Form Extraction', () => {
  describe('Macro-Chunk Splitting', () => {
    it('should not split small documents', () => {
      const smallText = 'Harry Potter was a wizard. He lived in London.';
      const chunks = splitIntoMacroChunks(smallText, { chunkSizeWords: 5000 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(smallText);
      expect(chunks[0].globalStart).toBe(0);
      expect(chunks[0].globalEnd).toBe(smallText.length);
    });

    it('should split large documents into multiple chunks', () => {
      // Generate a ~7000 word document (should result in 2+ chunks with 5000 word target)
      const paragraph = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
      const largeText = (paragraph + '\n\n').repeat(8); // ~7200 words

      const chunks = splitIntoMacroChunks(largeText, {
        chunkSizeWords: 5000,
        overlapChars: 500,
        minChunkWords: 1000,
      });

      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // Verify first chunk starts at 0
      expect(chunks[0].globalStart).toBe(0);
      expect(chunks[0].hasOverlapPrefix).toBe(false);

      // Verify subsequent chunks have overlap
      if (chunks.length > 1) {
        expect(chunks[1].hasOverlapPrefix).toBe(true);
        expect(chunks[1].overlapPrefixChars).toBeGreaterThan(0);
      }

      // Verify chunks cover the entire document
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.globalEnd).toBe(largeText.length);
    });

    it('should find split points at paragraph boundaries when possible', () => {
      const text = 'First paragraph with some content here.\n\nSecond paragraph with more content.\n\nThird paragraph continues.';
      const chunks = splitIntoMacroChunks(text, {
        chunkSizeWords: 5, // Very small to force splitting
        minChunkWords: 3,
      });

      // With such a small chunk size, we'd expect multiple chunks
      // The algorithm should prefer paragraph boundaries
      for (const chunk of chunks) {
        // Chunks should generally not start/end mid-sentence
        const startsClean = chunk.globalStart === 0 ||
          text[chunk.globalStart - 1] === '\n' ||
          text[chunk.globalStart - 1] === ' ';
        expect(startsClean).toBe(true);
      }
    });
  });

  describe('Cross-Chunk Entity Merging', () => {
    it('should merge same entity appearing in different chunks', async () => {
      // Create a document where "Harry Potter" appears in multiple chunks
      const chunk1Content = 'Harry Potter was born in Godric\'s Hollow. He was a young wizard with great potential. '.repeat(50);
      const chunk2Content = 'Years later, Harry Potter became famous. He defeated Voldemort and saved the wizarding world. '.repeat(50);

      const fullText = chunk1Content + '\n\n' + chunk2Content;

      // Use chunked extraction with small chunk size to force multiple chunks
      const result = await extractFromLongDocument(
        'test-merge',
        fullText,
        undefined,
        undefined,
        undefined,
        undefined,
        { chunkSizeWords: 500, overlapChars: 100, minChunkWords: 200 }
      );

      // Count how many "Harry Potter" entities we have
      const harryEntities = result.entities.filter(e =>
        e.canonical.toLowerCase().includes('harry') ||
        e.aliases.some(a => a.toLowerCase().includes('harry'))
      );

      // Should be merged into single entity despite appearing in multiple chunks
      expect(harryEntities.length).toBeLessThanOrEqual(2); // Allow for some variants

      // Should have chunk stats
      expect(result.chunkStats).toBeDefined();
      expect(result.chunkStats!.totalChunks).toBeGreaterThan(1);
    });
  });

  describe('Offset Correctness', () => {
    it('should preserve correct span offsets after merging', async () => {
      const text = 'Gandalf the Grey was a wizard. He lived in Middle-earth for thousands of years.';

      const result = await extractWithOptimalStrategy(
        'test-offsets',
        text,
        undefined,
        undefined,
        undefined,
        undefined,
        { chunkSizeWords: 10000 } // Large enough to not split
      );

      // Find Gandalf entity
      const gandalf = result.entities.find(e =>
        e.canonical.toLowerCase().includes('gandalf')
      );

      if (gandalf) {
        // Find span for Gandalf
        const gandalfSpans = result.spans.filter(s => s.entity_id === gandalf.id);

        for (const span of gandalfSpans) {
          // Verify the span is within the text bounds
          expect(span.start).toBeGreaterThanOrEqual(0);
          expect(span.end).toBeLessThanOrEqual(text.length);
          expect(span.start).toBeLessThan(span.end);

          // Verify the span points to something related to Gandalf
          // (could be "Gandalf", "Grey", or "Gandalf the Grey")
          const extractedText = text.slice(span.start, span.end);
          const isGandalfRelated = extractedText.toLowerCase().includes('gandalf') ||
            extractedText.toLowerCase().includes('grey') ||
            gandalf.aliases.some(a => extractedText.toLowerCase().includes(a.toLowerCase()));
          expect(isGandalfRelated).toBe(true);
        }
      }
    });
  });

  describe('Extraction Quality Comparison', () => {
    it('should produce similar results to legacy mode for small documents', async () => {
      const text = `
        Aragorn was the heir of Isildur. He was also known as Strider.
        Arwen was an elf of Rivendell. She loved Aragorn.
        They were married after the War of the Ring.
      `;

      // Run both modes
      const chunkedResult = await extractFromLongDocument(
        'test-compare-chunked',
        text,
        undefined,
        undefined,
        undefined,
        undefined,
        { chunkSizeWords: 10000 } // Won't actually chunk
      );

      const legacyResult = await extractFromSegments(
        'test-compare-legacy',
        text
      );

      // Entity counts should be similar (allow some variance)
      expect(Math.abs(chunkedResult.entities.length - legacyResult.entities.length)).toBeLessThanOrEqual(2);

      // Relation counts should be similar
      expect(Math.abs(chunkedResult.relations.length - legacyResult.relations.length)).toBeLessThanOrEqual(2);
    });
  });

  describe('Performance and Responsiveness', () => {
    it('should report chunk statistics', async () => {
      const text = 'Simple test document. '.repeat(100);

      const result = await extractWithOptimalStrategy(
        'test-stats',
        text
      );

      expect(result.chunkStats).toBeDefined();
      expect(result.chunkStats!.totalChunks).toBeGreaterThanOrEqual(1);
      expect(result.chunkStats!.totalWords).toBeGreaterThan(0);
      expect(result.chunkStats!.processingTimeMs).toBeGreaterThan(0);
      expect(result.chunkStats!.wordsPerSecond).toBeGreaterThan(0);
    });

    it('should support progress callbacks', async () => {
      // Create a document large enough to require multiple chunks
      const paragraph = 'The wizard Gandalf traveled through Middle-earth. He met many friends along the way. '.repeat(100);
      const largeText = (paragraph + '\n\n').repeat(6); // ~7200 words

      const progressUpdates: number[] = [];

      const result = await extractFromLongDocument(
        'test-progress',
        largeText,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          chunkSizeWords: 3000,
          onProgress: (progress) => {
            progressUpdates.push(progress.currentChunk);
          }
        }
      );

      // Should have received progress updates for each chunk
      expect(progressUpdates.length).toBe(result.chunkStats!.totalChunks);

      // Progress should be sequential
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i]).toBe(progressUpdates[i - 1] + 1);
      }
    });
  });
});
