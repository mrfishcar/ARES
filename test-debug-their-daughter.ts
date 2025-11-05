/**
 * Debug "their daughter" pattern
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const tests = [
    'Robert Morrison and Jennifer Park married in 1984. The couple lived in Sunnyvale with their daughter, Akiko',
    'Robert and Sarah had a daughter, Emma Morrison',
    'Daniel Kim was promoted to CTO. His wife Lisa had left Apple',
  ];

  for (const text of tests) {
    console.log('\n' + '='.repeat(80));
    console.log('Text:', text);
    console.log('='.repeat(80));

    const { entities, relations } = await extractFromSegments('test', text);

    console.log('\nEntities:');
    for (const e of entities) {
      console.log(`  - ${e.canonical} (${e.type})`);
    }

    console.log('\nRelations:');
    if (relations.length === 0) {
      console.log('  NONE FOUND');
    } else {
      for (const rel of relations) {
        const subj = entities.find(e => e.id === rel.subj)?.canonical || '?';
        const obj = entities.find(e => e.id === rel.obj)?.canonical || '?';
        console.log(`  ✓ ${rel.pred}: ${subj} → ${obj}`);
      }
    }
  }
}

test().then(() => process.exit(0));
