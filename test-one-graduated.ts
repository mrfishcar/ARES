/**
 * Test just the graduated sentence with full extraction
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = 'Vincent Tan, who had graduated from National University of Singapore';

  console.log('Testing:', text);
  console.log('='.repeat(80));

  const { entities, relations } = await extractFromSegments('test', text);

  console.log('\nEntities:');
  for (const e of entities) {
    console.log(`  ${e.canonical} (type: ${e.type})`);
  }

  console.log('\nRelations:');
  if (relations.length === 0) {
    console.log('  NONE FOUND');
  } else {
    for (const rel of relations) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || '?';
      const obj = entities.find(e => e.id === rel.obj)?.canonical || '?';
      console.log(`  ${rel.pred}: ${subj} → ${obj}`);
    }
  }
}

test().then(() => process.exit(0));
