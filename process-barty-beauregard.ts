/**
 * Process "Barty Beauregard and the Fabulous Fraud" long document
 *
 * Strategy:
 * 1. Chunk text into 400-600 word segments on paragraph boundaries
 * 2. Extract entities/relations from each segment
 * 3. Aggregate into global graph
 * 4. Inspect for issues (coordination, aliases, etc.)
 * 5. Record performance metrics
 */

import * as fs from 'fs';
import { extractFromSegments } from './app/engine/extract/orchestrator';
import { GlobalKnowledgeGraph } from './app/engine/global-graph';
import { filterGlobalEntities } from './app/engine/linguistics/global-graph-filters';

const TARGET_MIN_WORDS = 400;
const TARGET_MAX_WORDS = 600;

interface Chunk {
  id: string;
  text: string;
  wordCount: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Simple sentence splitter (regex-based)
 * Splits on: period, exclamation, question mark followed by whitespace
 */
function splitSentences(text: string): string[] {
  // Split on sentence boundaries, but keep the punctuation
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return sentences.filter(s => s.trim().length > 0);
}

/**
 * Chunk text into 400-600 word segments on sentence boundaries
 * Uses sentence-based splitting instead of paragraph-based to avoid huge chunks
 */
function chunkText(fullText: string): Chunk[] {
  const sentences = splitSentences(fullText);

  const chunks: Chunk[] = [];
  let currentSentences: string[] = [];
  let currentWordCount = 0;
  let chunkIndex = 0;
  let charIndex = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length;

    // If adding this sentence would exceed MAX and we're above MIN, finalize chunk
    if (currentWordCount + sentenceWords > TARGET_MAX_WORDS && currentWordCount >= TARGET_MIN_WORDS) {
      const chunkText = currentSentences.join(' ');
      chunks.push({
        id: `barty-chunk-${chunkIndex}`,
        text: chunkText,
        wordCount: currentWordCount,
        startIndex: charIndex - chunkText.length,
        endIndex: charIndex
      });
      chunkIndex++;
      currentSentences = [];
      currentWordCount = 0;
    }

    // Add sentence to current chunk
    currentSentences.push(sentence);
    currentWordCount += sentenceWords;
    charIndex += sentence.length + 1; // +1 for space

    // If we've hit the target and next addition would exceed max, finalize
    if (currentWordCount >= TARGET_MIN_WORDS && currentWordCount + 50 > TARGET_MAX_WORDS) {
      const chunkText = currentSentences.join(' ');
      chunks.push({
        id: `barty-chunk-${chunkIndex}`,
        text: chunkText,
        wordCount: currentWordCount,
        startIndex: charIndex - chunkText.length,
        endIndex: charIndex
      });
      chunkIndex++;
      currentSentences = [];
      currentWordCount = 0;
    }
  }

  // Add final chunk if any content remains
  if (currentSentences.length > 0) {
    const chunkText = currentSentences.join(' ');
    chunks.push({
      id: `barty-chunk-${chunkIndex}`,
      text: chunkText,
      wordCount: currentWordCount,
      startIndex: charIndex - chunkText.length,
      endIndex: charIndex
    });
  }

  return chunks;
}

async function processBartyBeauregard() {
  console.log('='.repeat(80));
  console.log('BARTY BEAUREGARD AND THE FABULOUS FRAUD - EXTRACTION ANALYSIS');
  console.log('='.repeat(80));

  // Read file
  const filePath = './Barty Beauregard and the Fabulous Fraud PLAIN TEXT.txt';
  const fullText = fs.readFileSync(filePath, 'utf-8');
  const totalWords = fullText.split(/\s+/).length;

  console.log(`\n📄 Document Statistics:`);
  console.log(`  Total words: ${totalWords.toLocaleString()}`);
  console.log(`  Total chars: ${fullText.length.toLocaleString()}`);

  // Chunk the text
  console.log(`\n✂️  Chunking text (target: ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS} words)...`);
  const chunks = chunkText(fullText);
  console.log(`  Created ${chunks.length} chunks`);

  // Show chunk distribution
  console.log(`\n📊 Chunk Distribution:`);
  for (const chunk of chunks) {
    console.log(`  ${chunk.id}: ${chunk.wordCount} words`);
  }

  // Initialize global graph
  const graph = new GlobalKnowledgeGraph();
  const startTime = Date.now();

  // Process each chunk
  console.log(`\n🔍 Extracting entities and relations...`);
  let totalEntities = 0;
  let totalRelations = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkStart = Date.now();

    console.log(`\n  [${i + 1}/${chunks.length}] Processing ${chunk.id}...`);

    try {
      const result = await extractFromSegments(chunk.id, chunk.text);

      console.log(`    Entities: ${result.entities.length}`);
      console.log(`    Relations: ${result.relations.length}`);
      console.log(`    Time: ${Date.now() - chunkStart}ms`);

      // Add to global graph
      graph.addDocument(chunk.id, chunk.text, result.entities, result.relations);

      totalEntities += result.entities.length;
      totalRelations += result.relations.length;
    } catch (error) {
      console.error(`    ❌ Error processing ${chunk.id}:`, error);
    }
  }

  const totalTime = Date.now() - startTime;

  // Export global graph
  console.log(`\n📦 Exporting global graph...`);
  let exported = graph.export();

  // Apply global filters to remove problematic entities
  console.log(`\n🧹 Applying global linguistic filters...`);
  exported.entities = filterGlobalEntities(exported.entities);

  // Statistics
  console.log(`\n=`.repeat(80));
  console.log('EXTRACTION RESULTS');
  console.log('='.repeat(80));

  console.log(`\n📈 Global Metrics:`);
  console.log(`  Merged Entities: ${exported.entities.length}`);
  console.log(`  Merged Relations: ${exported.relations.length}`);
  console.log(`  Total Processing Time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`  Words/Second: ${Math.round(totalWords / (totalTime / 1000))}`);

  console.log(`\n🏷️  Entity Types:`);
  const entityTypeCounts = exported.entities.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(entityTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

  console.log(`\n🔗 Relation Types:`);
  const relationTypeCounts = exported.relations.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(relationTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pred, count]) => {
      console.log(`  ${pred}: ${count}`);
    });

  // Top entities by mention count
  console.log(`\n👤 Top Entities (by mentions):`);
  const topEntities = exported.entities
    .filter(e => e.mentionCount > 1)
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 20);

  for (const e of topEntities) {
    console.log(`  ${e.canonical} (${e.type}): ${e.mentionCount} mentions`);
    if (e.aliases.length > 1) {
      console.log(`    Aliases: ${e.aliases.slice(0, 5).join(', ')}`);
    }
  }

  // Check for coordination issues (from HANDOFF warning)
  console.log(`\n⚠️  Checking for potential issues...`);

  // Look for entities with coordination patterns in aliases
  const coordinationIssues = exported.entities.filter(e =>
    e.aliases.some(a => a.includes(' and ') || a.includes(', '))
  );

  if (coordinationIssues.length > 0) {
    console.log(`\n  ⚠️  Potential coordination merging issues:`);
    for (const e of coordinationIssues) {
      console.log(`    ${e.canonical}:`);
      console.log(`      Aliases: ${e.aliases.join(', ')}`);
    }
  } else {
    console.log(`  ✅ No obvious coordination issues found`);
  }

  // Save results to file
  const outputPath = './reports/barty-beauregard-extraction-results.json';
  fs.mkdirSync('./reports', { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        metadata: {
          document: 'Barty Beauregard and the Fabulous Fraud',
          totalWords,
          totalChunks: chunks.length,
          processingTimeMs: totalTime,
          wordsPerSecond: Math.round(totalWords / (totalTime / 1000))
        },
        chunks: chunks.map(c => ({ id: c.id, wordCount: c.wordCount })),
        graph: exported
      },
      null,
      2
    )
  );

  console.log(`\n💾 Results saved to: ${outputPath}`);

  console.log(`\n=`.repeat(80));
  console.log('✅ EXTRACTION COMPLETE');
  console.log('='.repeat(80));

  process.exit(0);
}

processBartyBeauregard().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
