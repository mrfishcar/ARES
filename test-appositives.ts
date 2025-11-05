/**
 * Test appositive patterns
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testAppositives() {
  console.log('APPOSITIVE PATTERN TESTS');
  console.log('='.repeat(80));

  const tests = [
    {
      name: 'CEO of',
      text: 'Robert Morrison, CEO of Zenith Computing, announced the merger',
      expected: 'leads: Robert Morrison → Zenith Computing'
    },
    {
      name: 'Founder of',
      text: 'Sarah Chen, founder of DataVision Systems, spoke at the conference',
      expected: 'leads: Sarah Chen → DataVision Systems'
    },
    {
      name: 'Professor at',
      text: 'Dr. Michael Thompson, professor at Stanford University, published a paper',
      expected: 'teaches_at: Michael Thompson → Stanford University'
    },
    {
      name: 'Researcher at',
      text: 'Gabriel Santos, researcher at MIT, discovered the algorithm',
      expected: 'member_of: Gabriel Santos → MIT'
    },
    {
      name: 'Student at',
      text: 'Emily Rodriguez, student at Berkeley, won the award',
      expected: 'studies_at: Emily Rodriguez → Berkeley'
    },
  ];

  let passed = 0;

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
    if (relations.length > 0) {
      for (const rel of relations) {
        const subj = entities.find(e => e.id === rel.subj)?.canonical || 'unknown';
        const obj = entities.find(e => e.id === rel.obj)?.canonical || 'unknown';
        console.log(`     ✓ ${rel.pred}: ${subj} → ${obj} (conf: ${rel.confidence.toFixed(2)})`);
        if (test.expected.includes(rel.pred)) passed++;
      }
    } else {
      console.log('     ⚠️  No relations found');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`RESULTS: ${passed}/${tests.length} patterns working`);
  console.log('='.repeat(80));
}

testAppositives()
  .then(() => {
    console.log('\nTests complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
