/**
 * Trace "Andrew Beauregard" through each pipeline stage
 * to find where it gets lost
 */

import { extractFromSegments } from '../app/engine/pipeline/orchestrator';
import { DEFAULT_LLM_CONFIG } from '../app/engine/llm-config';

const TEST_TEXT = `He had not spoken face to face with his father, Andrew Beauregard, for thirty-two days. Mr. Beauregard audited business books for a living.`;

async function main() {
  console.log('='.repeat(70));
  console.log('PIPELINE STAGE TRACE: Where does "Andrew Beauregard" disappear?');
  console.log('='.repeat(70));
  console.log('\nInput text:');
  console.log(`"${TEST_TEXT}"\n`);

  // Run full pipeline
  const result = await extractFromSegments('test', TEST_TEXT, undefined, DEFAULT_LLM_CONFIG);

  console.log('\n' + '='.repeat(70));
  console.log('FINAL ENTITIES:');
  console.log('='.repeat(70));

  for (const e of result.entities) {
    const isAndrew = e.canonical.toLowerCase().includes('andrew');
    const isBeauregard = e.canonical.toLowerCase().includes('beauregard');
    const marker = (isAndrew || isBeauregard) ? '🎯' : '  ';
    console.log(`${marker} "${e.canonical}" (${e.type})`);
    if (e.aliases?.length) {
      console.log(`   aliases: [${e.aliases.join(', ')}]`);
    }
  }

  // Check for expected entity
  console.log('\n' + '='.repeat(70));
  console.log('CHECK:');
  const hasAndrewBeauregard = result.entities.some(e =>
    e.canonical.toLowerCase() === 'andrew beauregard'
  );
  const hasMrBeauregard = result.entities.some(e =>
    e.canonical.toLowerCase().includes('mr') && e.canonical.toLowerCase().includes('beauregard')
  );

  console.log(`  "Andrew Beauregard" as canonical: ${hasAndrewBeauregard ? '✅ YES' : '❌ NO'}`);
  console.log(`  "Mr. Beauregard" extracted: ${hasMrBeauregard ? '✅ YES' : '❌ NO'}`);

  // Check if Andrew Beauregard was merged into something else
  for (const e of result.entities) {
    if (e.aliases?.some(a => a.toLowerCase().includes('andrew'))) {
      console.log(`  ⚠️  "Andrew" appears as alias of: "${e.canonical}"`);
    }
  }
  console.log('='.repeat(70));
}

main().catch(console.error);
