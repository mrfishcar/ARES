/**
 * Quick test of pattern-based entity extraction
 */

import { extractFromSegments } from '../app/engine/pipeline/orchestrator';
import { DEFAULT_LLM_CONFIG } from '../app/engine/llm-config';

async function main() {
  const testText = `He had not spoken face to face with his father, Andrew Beauregard, for thirty-two days. Mr. Beauregard audited business books for a living. They met at Hell Hall, where the Preppy Pinks held their meetings.`;

  console.log('Testing pattern-based extraction...\n');
  console.log('Input text:');
  console.log(testText);
  console.log('\n---');

  const result = await extractFromSegments('test-doc', testText, undefined, DEFAULT_LLM_CONFIG);

  console.log('\nExtracted entities:');
  for (const entity of result.entities) {
    console.log(`  - ${entity.canonical} (${entity.type})`);
  }

  console.log('\nChecking for expected entities:');
  const expected = ['Andrew Beauregard', 'Mr. Beauregard', 'Hell Hall', 'Preppy Pinks'];
  for (const exp of expected) {
    const found = result.entities.some(e =>
      e.canonical.toLowerCase().includes(exp.toLowerCase()) ||
      exp.toLowerCase().includes(e.canonical.toLowerCase())
    );
    console.log(`  ${found ? '✅' : '❌'} ${exp}`);
  }
}

main().catch(console.error);
