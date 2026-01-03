/**
 * Quick test for Barty Beauregard extraction
 */
import { extractEntities } from '../app/engine/extract/entities';

const testText = 'Barty Beauregard is thirteen years old.';

async function test() {
  console.log('Testing: "' + testText + '"');
  const result = await extractEntities(testText);
  console.log('\nEntities extracted:', result.entities.length);
  result.entities.forEach(e => {
    console.log(`  - ${e.canonical} (${e.type})`);
  });
}

test().catch(console.error);
