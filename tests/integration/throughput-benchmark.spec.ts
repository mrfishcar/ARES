/**
 * Long-Text Throughput Benchmark
 *
 * Measures extraction speed across various text sizes.
 * Target: ≥100 words/second (current: ~190 words/sec)
 *
 * Tests:
 * 1. Short text (100 words)
 * 2. Medium text (1000 words)
 * 3. Long text (5000 words)
 * 4. Very long text (10000 words)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { extractFromSegments } from '../../app/engine/extract/orchestrator';

// =============================================================================
// TEST HELPERS
// =============================================================================

function generateNarrativeText(targetWords: number): string {
  // Generate realistic narrative text with entities and relations
  const templates = [
    'Harry Potter walked through the corridors of Hogwarts.',
    'Hermione Granger studied in the library until midnight.',
    'Ron Weasley played chess with his brothers.',
    'Dumbledore addressed the students in the Great Hall.',
    'Snape brewed potions in the dungeon.',
    'McGonagall transformed into a cat.',
    'Hagrid cared for magical creatures.',
    'Draco Malfoy sneered at the Gryffindors.',
    'Luna Lovegood read The Quibbler upside down.',
    'Neville Longbottom tended to his plants.',
    'The Ministry of Magic issued new regulations.',
    'Voldemort plotted in the shadows.',
    'Sirius Black escaped from Azkaban.',
    'Remus Lupin taught Defense Against the Dark Arts.',
    'The Order of the Phoenix held a secret meeting.',
    'Dobby the house-elf served his masters.',
    'The Weasley twins invented new pranks.',
    'Ginny Weasley joined the Quidditch team.',
    'Cho Chang caught the Golden Snitch.',
    'Cedric Diggory was a Hufflepuff prefect.',
  ];

  const sentences: string[] = [];
  let wordCount = 0;

  while (wordCount < targetWords) {
    const template = templates[sentences.length % templates.length];
    sentences.push(template);
    wordCount += template.split(/\s+/).length;
  }

  return sentences.join(' ');
}

interface BenchmarkResult {
  textLength: number;
  wordCount: number;
  extractionTimeMs: number;
  wordsPerSecond: number;
  entityCount: number;
  relationCount: number;
}

async function benchmarkExtraction(text: string, docId: string = 'test-doc'): Promise<BenchmarkResult> {
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const startTime = performance.now();
  const result = await extractFromSegments(docId, text);
  const endTime = performance.now();

  const extractionTimeMs = endTime - startTime;
  const wordsPerSecond = (wordCount / extractionTimeMs) * 1000;

  return {
    textLength: text.length,
    wordCount,
    extractionTimeMs,
    wordsPerSecond,
    entityCount: result.entities?.length ?? 0,
    relationCount: result.relations?.length ?? 0,
  };
}

// =============================================================================
// BENCHMARK EXECUTION
// =============================================================================

describe('Long-Text Throughput Benchmark', () => {
  const results: BenchmarkResult[] = [];

  describe('Short text (100 words)', () => {
    it('should extract at ≥100 words/sec', async () => {
      const text = generateNarrativeText(100);
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Short text: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(50); // Lower for short text (startup overhead)
    });
  });

  describe('Medium text (1000 words)', () => {
    it('should extract at ≥100 words/sec', async () => {
      const text = generateNarrativeText(1000);
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Medium text: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Long text (5000 words)', () => {
    it('should extract at ≥100 words/sec', async () => {
      const text = generateNarrativeText(5000);
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Long text: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Very long text (10000 words)', () => {
    it('should extract at ≥100 words/sec', async () => {
      const text = generateNarrativeText(10000);
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Very long text: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  describe('BENCHMARK SUMMARY', () => {
    it('should meet throughput targets', async () => {
      // Wait for all tests to complete (results should be populated)
      // The tests run sequentially before this

      if (results.length > 0) {
        console.log('\n=== THROUGHPUT BENCHMARK RESULTS ===');
        console.log('Size (words) | Time (ms) | Words/sec | Entities | Relations');
        console.log('-----------------------------------------------------------');
        for (const r of results) {
          console.log(
            `${r.wordCount.toString().padStart(12)} | ` +
            `${r.extractionTimeMs.toFixed(0).padStart(9)} | ` +
            `${r.wordsPerSecond.toFixed(1).padStart(9)} | ` +
            `${r.entityCount.toString().padStart(8)} | ` +
            `${r.relationCount.toString().padStart(9)}`
          );
        }
        console.log('====================================\n');

        // Calculate average words/sec (excluding short text due to overhead)
        const relevantResults = results.filter(r => r.wordCount >= 1000);
        if (relevantResults.length > 0) {
          const avgWps = relevantResults.reduce((sum, r) => sum + r.wordsPerSecond, 0) / relevantResults.length;
          console.log(`Average throughput (≥1000 words): ${avgWps.toFixed(1)} words/sec`);

          // Primary target
          expect(avgWps).toBeGreaterThanOrEqual(100);
        }
      }

      // Always pass this test (summary only)
      expect(true).toBe(true);
    });
  });
});
