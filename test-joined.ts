/**
 * Test "joined" patterns
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const tests = [
    {
      name: 'Joined company as role',
      text: 'Andrew Morrison joined the company as Chief Financial Officer',
      expected: 'member_of: Andrew Morrison → company'
    },
    {
      name: 'Joined org as role',
      text: 'Marcus Johnson joined Zenith as Chief Operating Officer',
      expected: 'member_of: Marcus Johnson → Zenith'
    },
    {
      name: 'Joined board',
      text: 'Katherine Rodriguez joined the board of directors',
      expected: 'member_of: Katherine Rodriguez → board'
    },
  ];

  let found = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n${i + 1}. ${test.name}: "${test.text}"`);

    const { entities, relations } = await extractFromSegments(`test-${i}`, test.text);

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
