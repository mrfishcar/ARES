/**
 * Test family relation patterns we might be missing
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const tests = [
    {
      name: 'Eldest son of',
      text: 'Robert Morrison was the eldest son of Thomas Morrison',
      expected: 'child_of: Robert → Thomas'
    },
    {
      name: 'Daughter with name',
      text: 'The couple lived in Sunnyvale with their daughter, Akiko',
      expected: 'parent_of: couple → Akiko'
    },
    {
      name: 'Possessive wife',
      text: "Daniel's wife, Lisa Kim, was a product manager at Apple",
      expected: 'married_to: Daniel → Lisa Kim'
    },
    {
      name: 'Late husband',
      text: 'Her late husband, Dr. Philip Anderson, was a computer science professor',
      expected: 'married_to: her → Philip Anderson'
    },
    {
      name: 'Brother appositive',
      text: "Yuki's brother, Kenji Nakamura, was a professor",
      expected: 'sibling_of: Yuki → Kenji'
    },
  ];

  let found = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n${i + 1}. ${test.name}: "${test.text}"`);

    const { entities, relations } = await extractFromSegments(`test-${i}`, test.text);

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
