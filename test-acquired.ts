/**
 * Test "acquired" pattern
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = 'Zenith Computing acquired DataVision Systems';

  console.log('Testing:', text);
  console.log('='.repeat(80));

  const { entities, relations } = await extractFromSegments('test', text);

  console.log('\nEntities:', entities.map(e => e.canonical).join(', '));

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
