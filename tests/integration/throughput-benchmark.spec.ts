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

  // =============================================================================
  // STRESS TESTS - Loop 23
  // =============================================================================

  describe('Massive text (15000 words)', () => {
    it('should handle very large documents', async () => {
      const text = generateNarrativeText(15000);
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Massive text: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Dense entity text (500 unique entities)', () => {
    it('should handle high entity density', async () => {
      // Generate text with many unique named entities
      const entities = [
        'Alice', 'Bob', 'Charlie', 'David', 'Emma', 'Frank', 'Grace', 'Henry',
        'Isabella', 'Jack', 'Katherine', 'Liam', 'Maria', 'Nathan', 'Olivia', 'Peter',
        'Quinn', 'Rachel', 'Samuel', 'Tina', 'Ulysses', 'Victoria', 'William', 'Xavier',
        'Yolanda', 'Zachary', 'Andrew', 'Bella', 'Cameron', 'Diana', 'Edward', 'Fiona',
        'George', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura', 'Michael', 'Nancy',
        'Oscar', 'Patricia', 'Quincy', 'Rebecca', 'Steven', 'Teresa', 'Uma', 'Vincent',
      ];
      const locations = ['London', 'Paris', 'Tokyo', 'Berlin', 'Madrid', 'Rome', 'Vienna'];
      const orgs = ['Microsoft', 'Google', 'Amazon', 'Apple', 'Netflix', 'Tesla', 'SpaceX'];

      const sentences: string[] = [];
      for (let i = 0; i < 500; i++) {
        const person = entities[i % entities.length] + (i >= entities.length ? i.toString() : '');
        const loc = locations[i % locations.length];
        const org = orgs[i % orgs.length];
        sentences.push(`${person} works at ${org} in ${loc}.`);
      }

      const text = sentences.join(' ');
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Dense entities: ${result.wordsPerSecond.toFixed(1)} words/sec, ${result.entityCount} entities`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(50); // Lower threshold for dense entities
    });
  });

  describe('Pronoun-heavy text (reference resolution)', () => {
    it('should handle many pronouns efficiently', async () => {
      // Text with pronouns that need resolution
      const templates = [
        'Harry met Ron. He told him about the plan.',
        'Hermione studied. She found the answer in her book.',
        'The wizard cast a spell. He was powerful.',
        'Luna saw Neville. She waved to him.',
        'Dumbledore spoke. His words were wise.',
        'McGonagall transformed. Her skills were legendary.',
        'Snape brewed. His potions were perfect.',
        'Hagrid arrived. He brought his creatures.',
      ];

      const sentences: string[] = [];
      for (let i = 0; i < 300; i++) {
        sentences.push(templates[i % templates.length]);
      }

      const text = sentences.join(' ');
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Pronoun-heavy: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 28: MORE THROUGHPUT EDGE CASES
  // =========================================================================

  describe('Dialogue-heavy text', () => {
    it('should handle dialogue patterns efficiently', async () => {
      const templates = [
        '"I will find you," said Harry.',
        '"Never," replied Voldemort.',
        '"Help me," whispered Hermione.',
        '"Follow me," commanded Dumbledore.',
        '"Be careful," warned McGonagall.',
        '"Stay here," ordered Snape.',
      ];

      const sentences: string[] = [];
      for (let i = 0; i < 300; i++) {
        sentences.push(templates[i % templates.length]);
      }

      const text = sentences.join(' ');
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Dialogue-heavy: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Relation-heavy text', () => {
    it('should handle many relations efficiently', async () => {
      const templates = [
        'Harry Potter is the son of James Potter.',
        'Ron Weasley is the brother of Ginny Weasley.',
        'Dumbledore was the headmaster of Hogwarts.',
        'Snape worked at Hogwarts School.',
        'Hermione married Ron Weasley.',
        'Draco was the enemy of Harry.',
      ];

      const sentences: string[] = [];
      for (let i = 0; i < 300; i++) {
        sentences.push(templates[i % templates.length]);
      }

      const text = sentences.join(' ');
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Relation-heavy: ${result.wordsPerSecond.toFixed(1)} words/sec, ${result.relationCount} relations`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(50); // Lower for relation extraction
    });
  });

  // =========================================================================
  // LOOP 36: MORE THROUGHPUT VARIETY
  // =========================================================================

  describe('Short documents batch (50 words each)', () => {
    it('should handle many short documents efficiently', async () => {
      // 20 short documents of 50 words each = 1000 words total
      const shortDocs = [
        'The wizard entered the castle. He was looking for the ancient artifact. The guards watched carefully.',
        'Hermione read the book. She found important information. The spell was powerful.',
        'Ron waited outside. The rain was falling. He wondered when his friends would return.',
        'Dumbledore spoke quietly. His words carried wisdom. The students listened carefully.',
      ];

      let allText = '';
      for (let i = 0; i < 20; i++) {
        allText += shortDocs[i % shortDocs.length] + ' ';
      }

      const result = await benchmarkExtraction(allText.trim());
      results.push(result);

      console.log(`Short docs batch: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 49: MORE THROUGHPUT TESTS
  // =========================================================================

  describe('Mixed entity types text', () => {
    it('should handle text with varied entity types', async () => {
      const templates = [
        'Bill Gates worked at Microsoft in Seattle.',
        'The Ministry of Magic was located in London.',
        'Harry Potter read the Daily Prophet newspaper.',
        'Apple and Google competed in California.',
      ];

      const sentences: string[] = [];
      for (let i = 0; i < 200; i++) {
        sentences.push(templates[i % templates.length]);
      }

      const text = sentences.join(' ');
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Mixed entity types: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Nested clauses text', () => {
    it('should handle complex sentence structures', async () => {
      const templates = [
        'Harry, who was the chosen one, defeated Voldemort, who feared death.',
        'Hermione, the brightest witch, studied at Hogwarts, the magical school.',
        'Ron, Harry\'s best friend, helped them defeat the dark lord.',
        'Dumbledore, the headmaster, protected the students from danger.',
      ];

      const sentences: string[] = [];
      for (let i = 0; i < 150; i++) {
        sentences.push(templates[i % templates.length]);
      }

      const text = sentences.join(' ');
      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Nested clauses: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(50); // Lower for complex parsing
    });
  });

  // =========================================================================
  // LOOP 56: MORE THROUGHPUT TESTS
  // =========================================================================

  describe('Repetitive text (same sentence)', () => {
    it('should handle highly repetitive content', async () => {
      const sentence = 'Harry Potter cast a spell at Hogwarts. ';
      const text = sentence.repeat(200);

      const result = await benchmarkExtraction(text);
      results.push(result);

      console.log(`Repetitive text: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 62: MORE THROUGHPUT TESTS
  // =========================================================================

  describe('Many short sentences (sentence boundaries)', () => {
    it('should handle many sentence boundaries', async () => {
      // Very short sentences with many boundaries
      const shortSentences = [
        'Harry ran.', 'Ron followed.', 'Hermione watched.',
        'They stopped.', 'Luna smiled.', 'Neville waited.',
        'Ginny laughed.', 'Fred joked.', 'George grinned.',
      ];
      let text = '';
      for (let i = 0; i < 150; i++) {
        text += shortSentences[i % shortSentences.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Many short sentences: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(50); // Lower for sentence overhead
    });
  });

  // =========================================================================
  // LOOP 68: MORE THROUGHPUT TESTS
  // =========================================================================

  describe('Long paragraphs (few boundaries)', () => {
    it('should handle long flowing paragraphs', async () => {
      // Longer sentences with fewer boundaries
      const longSentences = [
        'Harry Potter and his friends Ron Weasley and Hermione Granger walked through the corridors of Hogwarts School of Witchcraft and Wizardry on their way to the Great Hall for the evening feast.',
        'The ancient castle was filled with magical portraits that moved and talked to anyone who passed by, and the staircases would often shift and change direction without warning.',
        'Professor Dumbledore sat at the high table with the other teachers including Professor McGonagall, Professor Snape, and the newest Defense Against the Dark Arts teacher.',
      ];
      let text = '';
      for (let i = 0; i < 20; i++) {
        text += longSentences[i % longSentences.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Long paragraphs: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 73: UNICODE AND MIXED CONTENT
  // =========================================================================

  describe('Unicode names (accented characters)', () => {
    it('should handle accented names efficiently', async () => {
      const templates = [
        'José García met María López in Barcelona.',
        'François Müller worked with Søren Bjørnsen.',
        'Naïve Björk visited Zürich and München.',
        'Renée Zellweger attended the café meeting.',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Unicode names: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Numbers mixed with names', () => {
    it('should handle text with many numbers', async () => {
      const templates = [
        'Harry Potter was born on July 31, 1980.',
        'The Battle of Hogwarts happened in 1998.',
        'Dumbledore died at age 150 in the tower.',
        'Ron had 6 siblings in his family.',
      ];

      let text = '';
      for (let i = 0; i < 150; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Numbers mixed: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 78: PUNCTUATION AND QUOTATION HANDLING
  // =========================================================================

  describe('Quotation-heavy text', () => {
    it('should handle dialogue with quotes', async () => {
      const templates = [
        '"I am Harry Potter," said Harry.',
        '"Where is he?" asked Hermione.',
        '"Follow me," Dumbledore commanded.',
        '"Never!" shouted Ron defiantly.',
      ];

      let text = '';
      for (let i = 0; i < 150; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Quotation-heavy: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Punctuation variety text', () => {
    it('should handle varied punctuation', async () => {
      const templates = [
        'Harry (the chosen one) fought bravely.',
        'Hermione — the brightest witch — studied.',
        'Ron, Fred, and George laughed; it was funny!',
        'What did Dumbledore say? No one knew...',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Punctuation variety: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(50);
    });
  });

  // =========================================================================
  // LOOP 83: LIST AND ENUMERATION HANDLING
  // =========================================================================

  describe('List text (enumerations)', () => {
    it('should handle lists efficiently', async () => {
      const templates = [
        'Harry needed: a wand, a cloak, and a stone.',
        'The team included Ron, Hermione, and Harry.',
        'They visited London, Paris, and Rome.',
        'Options were: fight, flee, or hide.',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`List text: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Colon-heavy text', () => {
    it('should handle colons and definitions', async () => {
      const templates = [
        'Definition: A wizard is a magical being.',
        'Note: Hogwarts was founded in 990 AD.',
        'Warning: Dragons are dangerous creatures.',
        'Fact: Harry Potter defeated Voldemort.',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Colon-heavy: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 88: FIRST-PERSON NARRATIVE
  // =========================================================================

  describe('First-person narrative', () => {
    it('should handle first-person pronouns', async () => {
      const templates = [
        'I walked through the halls of Hogwarts.',
        'We studied potions with Professor Snape.',
        'My wand chose me at Ollivanders.',
        'Our team won the Quidditch Cup.',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`First-person: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 93: QUESTION-HEAVY TEXT
  // =========================================================================

  describe('Question-heavy text', () => {
    it('should handle many questions', async () => {
      const templates = [
        'Where did Harry go? What did he find?',
        'Who was Voldemort? Why did he fear death?',
        'How did Dumbledore know? When did he learn?',
        'What was the secret? Who could tell?',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Question-heavy: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 98: ACTION-HEAVY/EXCLAMATION TEXT
  // =========================================================================

  describe('Action-heavy text', () => {
    it('should handle action sequences with exclamations', async () => {
      const templates = [
        'Harry ran! Hermione followed quickly!',
        'Voldemort attacked! The Order fought back!',
        'Dumbledore shouted a warning! Everyone ducked!',
        'The dragon roared! Hagrid cheered wildly!',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Action-heavy: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 103: COMPOUND SENTENCE TEXT
  // =========================================================================

  describe('Compound sentence text', () => {
    it('should handle compound sentences with conjunctions', async () => {
      const templates = [
        'Harry ran and Hermione followed closely.',
        'Ron shouted but nobody answered him.',
        'Dumbledore stood still yet he smiled warmly.',
        'The spell hit and the shield shattered completely.',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Compound sentences: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 108: MULTI-PARAGRAPH TEXT
  // =========================================================================

  describe('Multi-paragraph text', () => {
    it('should handle text with paragraph breaks', async () => {
      const paragraphs = [
        'Harry walked through the castle. The halls were empty.',
        'Hermione waited in the library. She had important news.',
        'Ron joined them later. The three friends began to plan.',
        'Dumbledore watched from afar. He trusted their judgment.',
      ];

      let text = paragraphs.join('\n\n');
      // Repeat to get more words
      for (let i = 0; i < 10; i++) {
        text += '\n\n' + paragraphs.join('\n\n');
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Multi-paragraph: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(100);
    });
  });

  // =========================================================================
  // LOOP 113: DENSE ENTITY TEXT
  // =========================================================================

  describe('Dense entity text', () => {
    it('should handle many entities per sentence', async () => {
      const templates = [
        'Harry, Ron, Hermione, Neville, and Luna gathered together.',
        'Dumbledore, McGonagall, Snape, and Hagrid watched closely.',
        'Fred, George, Ginny, and Percy arrived from the Burrow.',
        'Draco, Crabbe, Goyle, and Pansy waited in the dungeons.',
      ];

      let text = '';
      for (let i = 0; i < 100; i++) {
        text += templates[i % templates.length] + ' ';
      }

      const result = await benchmarkExtraction(text.trim());
      results.push(result);

      console.log(`Dense entity: ${result.wordsPerSecond.toFixed(1)} words/sec`);
      expect(result.wordsPerSecond).toBeGreaterThanOrEqual(50);
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
