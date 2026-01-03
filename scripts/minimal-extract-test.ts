/**
 * Minimal extraction test to debug issues
 */
import { appendDoc, clearStorage } from '../app/storage/storage';

// Skip pattern library
process.env.SKIP_PATTERN_LIBRARY = '1';

const testText = `Frederick the mailman walked to the house.
Saul the demon watched from inside.
Barty Beauregard is thirteen years old.
His father Andrew Beauregard is away.
Dr. Wilson examined Barty.
Kelly Prescott is dating Beau Adams.`;

async function test() {
  console.log('Starting minimal extraction test...');
  const storagePath = './data/minimal-test.json';
  clearStorage(storagePath);

  const start = Date.now();
  const result = await appendDoc('minimal-test', testText, storagePath);
  console.log(`Time: ${Date.now() - start}ms`);
  console.log(`Entities: ${result.entities.length}`);
  result.entities.forEach((e: any) => console.log(`  - ${e.canonical} (${e.type})`));
  console.log(`Relations: ${result.relations.length}`);
  result.relations.forEach((r: any) => console.log(`  - ${r.subj} --[${r.pred}]--> ${r.obj}`));
}

test().catch(console.error);
