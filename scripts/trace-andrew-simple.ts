/**
 * Simple trace - run full extraction and grep for Andrew
 */

import { extractFromSegments } from '../app/engine/pipeline/orchestrator';
import { DEFAULT_LLM_CONFIG } from '../app/engine/llm-config';

process.env.SKIP_PATTERN_LIBRARY = '1';

const TEST_TEXT = `He had not spoken face to face with his father, Andrew Beauregard, for thirty-two days.`;

async function main() {
  console.log('Running extraction on short text...');
  console.log(`Text: "${TEST_TEXT}"`);
  console.log('');

  const result = await extractFromSegments('test', TEST_TEXT, undefined, DEFAULT_LLM_CONFIG);

  console.log('');
  console.log('='.repeat(60));
  console.log('FINAL RESULTS:');
  console.log('='.repeat(60));

  console.log(`\nEntities (${result.entities.length}):`);
  for (const e of result.entities) {
    const isAndrew = e.canonical.toLowerCase().includes('andrew');
    const isBeauregard = e.canonical.toLowerCase().includes('beauregard');
    const marker = (isAndrew || isBeauregard) ? '🎯' : '  ';
    console.log(`${marker} "${e.canonical}" (${e.type})`);
  }

  const hasAndrewBeauregard = result.entities.some(e =>
    e.canonical.toLowerCase() === 'andrew beauregard'
  );

  console.log('');
  console.log(`Andrew Beauregard found: ${hasAndrewBeauregard ? '✅ YES' : '❌ NO'}`);
}

main().catch(console.error);
