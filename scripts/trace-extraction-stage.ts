/**
 * Minimal test - just runs the entity extraction stage
 */

import { extractEntities } from '../app/engine/extract/entities';
import { ParseStage } from '../app/engine/pipeline/parse-stage';
import { EntityExtractionStage } from '../app/engine/pipeline/entity-extraction-stage';
import { DEFAULT_LLM_CONFIG } from '../app/engine/llm-config';

const TEST_TEXT = `He had not spoken face to face with his father, Andrew Beauregard, for thirty-two days. Mr. Beauregard audited business books for a living.`;

async function main() {
  console.log('='.repeat(60));
  console.log('STAGE TEST: Document Parse + Entity Extraction');
  console.log('='.repeat(60));

  // Step 1: Parse
  const parseStage = new ParseStage();
  const parseResult = await parseStage.execute({
    docId: 'test',
    fullText: TEST_TEXT,
    llmConfig: DEFAULT_LLM_CONFIG
  });

  console.log(`\nParsed: ${parseResult.segments.length} segments, ${parseResult.sentences.length} sentences`);

  // Step 2: Extract entities
  const extractStage = new EntityExtractionStage();
  const extractResult = await extractStage.execute({
    ...parseResult,
    fullText: TEST_TEXT,
    llmConfig: DEFAULT_LLM_CONFIG
  });

  console.log(`\nExtracted ${extractResult.entities.length} entities:`);
  for (const e of extractResult.entities) {
    const isAndrew = e.canonical.toLowerCase().includes('andrew');
    const marker = isAndrew ? '🎯' : '  ';
    console.log(`${marker} "${e.canonical}" (${e.type})`);
    if (e.aliases?.length) {
      console.log(`   aliases: [${e.aliases.join(', ')}]`);
    }
  }

  // Check for Andrew Beauregard
  console.log('\n' + '='.repeat(60));
  const hasAndrewBeauregard = extractResult.entities.some(e =>
    e.canonical.toLowerCase() === 'andrew beauregard'
  );
  console.log(`Andrew Beauregard found: ${hasAndrewBeauregard ? '✅ YES' : '❌ NO'}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
