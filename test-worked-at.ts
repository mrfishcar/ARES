/**
 * Test "worked at" patterns
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const tests = [
    'Thomas Morrison worked at General Motors',
    'Sophie Laurent, a French designer who worked at Adobe',
    'Rachel Thompson had been working at Intel in Santa Clara',
  ];

  let found = 0;

  for (let i = 0; i < tests.length; i++) {
    const text = tests[i];
    console.log(`\n${i + 1}. "${text}"`);

    const { entities, relations } = await extractFromSegments(`test-${i}`, text);

    console.log(`   Entities: ${entities.map(e => e.canonical).join(', ')}`);

    if (relations.length > 0) {
      found++;
      for (const rel of relations) {
        const subj = entities.find(e => e.id === rel.subj)?.canonical || '?';
        const obj = entities.find(e => e.id === rel.obj)?.canonical || '?';
        console.log(`   ✓ ${rel.pred}: ${subj} → ${obj}`);
      }
    } else {
      console.log(`   ⚠️  MISSING`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Found: ${found}/${tests.length}`);
}

test().then(() => process.exit(0));
