/**
 * Test coordination expansion
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testCoordination() {
  console.log('COORDINATION EXPANSION TESTS');
  console.log('='.repeat(80));

  const tests = [
    {
      name: 'Two subjects',
      text: 'Robert and Sarah founded Zenith Computing',
      expected: '2 leads relations (Robert→Zenith, Sarah→Zenith)'
    },
    {
      name: 'Three subjects',
      text: 'Gabriel, Michael, and David worked together',
      expected: 'Multiple ally_of relations'
    },
    {
      name: 'Two subjects (compound names)',
      text: 'Eric Nelson and Maria Garcia led the AI initiative',
      expected: '2 leads relations'
    },
  ];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n${i + 1}. ${test.name}`);
    console.log(`   Text: "${test.text}"`);
    console.log(`   Expected: ${test.expected}`);
    console.log('-'.repeat(80));

    const { entities, relations } = await extractFromSegments(`test-${i}`, test.text);

    console.log(`   Entities (${entities.length}):`);
    for (const e of entities) {
      console.log(`     - ${e.canonical} (${e.type})`);
    }

    console.log(`   Relations (${relations.length}):`);
    for (const rel of relations) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || 'unknown';
      const obj = entities.find(e => e.id === rel.obj)?.canonical || 'unknown';
      console.log(`     ✓ ${rel.pred}: ${subj} → ${obj} (conf: ${rel.confidence.toFixed(2)})`);
    }

    if (relations.length === 0) {
      console.log('     ⚠️  No relations found');
    }
  }

  console.log('\n' + '='.repeat(80));
}

testCoordination()
  .then(() => {
    console.log('\nTests complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
