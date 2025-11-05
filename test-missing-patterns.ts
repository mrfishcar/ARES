/**
 * Test specific sentences from narrative that should have relations
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testMissing() {
  console.log('MISSING PATTERN DETECTION');
  console.log('='.repeat(80));

  const tests = [
    {
      name: 'Invested (seed round)',
      text: 'Alexander Petrov agreed to lead their seed round, investing five hundred thousand dollars',
      expected: 'invested_in: Alexander Petrov → Zenith / seed round'
    },
    {
      name: 'Recruited from',
      text: 'They recruited heavily from Carnegie Mellon, bringing in graduates like Daniel Kim',
      expected: 'attended: Daniel Kim → Carnegie Mellon'
    },
    {
      name: 'Product manager at',
      text: 'Lisa Kim was a product manager at Apple in Cupertino',
      expected: 'member_of: Lisa Kim → Apple'
    },
    {
      name: 'Hired researcher',
      text: 'Robert Morrison hired Dr. Yuki Tanaka, a brilliant researcher',
      expected: 'member_of: Yuki Tanaka → Zenith (via hired)'
    },
    {
      name: 'Previously worked at',
      text: 'Eric Nelson had previously worked at IBM in Armoneda before starting DataVision',
      expected: 'member_of: Eric Nelson → IBM'
    },
    {
      name: 'Partner at (appositive)',
      text: 'His partner at Sequoia, Katherine Rodriguez, also participated',
      expected: 'member_of: Katherine Rodriguez → Sequoia'
    },
    {
      name: 'Graduated from (nominal)',
      text: 'Vincent Tan, who had graduated from National University of Singapore',
      expected: 'attended: Vincent Tan → National University of Singapore'
    },
    {
      name: 'Left position at',
      text: 'Kenji Nakamura left his position at Tokyo University to join Zenith',
      expected: 'member_of: Kenji Nakamura → Tokyo University'
    },
  ];

  let total = 0;
  let found = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n${i + 1}. ${test.name}`);
    console.log(`   Text: "${test.text}"`);
    console.log(`   Expected: ${test.expected}`);
    console.log('-'.repeat(80));

    const { entities, relations } = await extractFromSegments(`test-${i}`, test.text);

    console.log(`   Entities (${entities.length}): ${entities.map(e => e.canonical).join(', ')}`);
    console.log(`   Relations (${relations.length}):`);

    total++;
    if (relations.length > 0) {
      for (const rel of relations) {
        const subj = entities.find(e => e.id === rel.subj)?.canonical || 'unknown';
        const obj = entities.find(e => e.id === rel.obj)?.canonical || 'unknown';
        console.log(`     ✓ ${rel.pred}: ${subj} → ${obj}`);
      }
      found++;
    } else {
      console.log('     ⚠️  No relations found - MISSING PATTERN!');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`RESULTS: ${found}/${total} sentences extracted relations (${Math.round(100*found/total)}%)`);
  console.log(`MISSING: ${total - found} patterns need to be added`);
  console.log('='.repeat(80));
}

testMissing()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
