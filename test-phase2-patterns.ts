/**
 * Test Phase 2 patterns: Advisory, Investment, Acquisition
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testPhase2() {
  console.log('PHASE 2 PATTERN TESTS');
  console.log('='.repeat(80));

  const tests = [
    // Advisory patterns
    {
      name: 'PhD supervision',
      text: 'Gabriel Santos completed his PhD at MIT under Professor Richard Foster',
      expected: 'advised_by: Gabriel Santos → Richard Foster'
    },
    {
      name: 'Mentorship',
      text: 'Dr. Yuki Tanaka mentored young researchers like Gabriel Santos',
      expected: 'advised_by: Gabriel Santos → Yuki Tanaka'
    },
    {
      name: 'Advisor role',
      text: 'Dr. Anderson offered to serve as their technical advisor',
      expected: 'advised_by: ??? → Anderson'
    },

    // Investment patterns
    {
      name: 'Direct investment',
      text: 'Alexander Petrov invested in Zenith Computing',
      expected: 'invested_in: Alexander Petrov → Zenith Computing'
    },
    {
      name: 'Led round',
      text: 'Victoria Chen led Zenith\'s Series A funding',
      expected: 'invested_in: Victoria Chen → Zenith'
    },
    {
      name: 'Investment from X to Y',
      text: 'The first investment from Zenith Ventures went to CloudTech',
      expected: 'invested_in: Zenith Ventures → CloudTech'
    },

    // Acquisition patterns
    {
      name: 'Acquired active',
      text: 'Zenith Computing acquired DataVision Systems',
      expected: 'acquired: Zenith Computing → DataVision Systems'
    },
    {
      name: 'Purchased',
      text: 'Zenith Computing purchased MobileFirst Technologies',
      expected: 'acquired: Zenith Computing → MobileFirst Technologies'
    },
    {
      name: 'Was acquired (passive)',
      text: 'DataVision Systems was acquired by Zenith Computing',
      expected: 'acquired: Zenith Computing → DataVision Systems'
    },
  ];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n${i + 1}. ${test.name}`);
    console.log(`   Text: "${test.text}"`);
    console.log(`   Expected: ${test.expected}`);
    console.log('-'.repeat(80));

    try {
      const { entities, relations } = await extractFromSegments(`test-${i}`, test.text);

      console.log(`   Entities (${entities.length}):`);
      for (const e of entities) {
        console.log(`     - ${e.canonical} (${e.type})`);
      }

      console.log(`   Relations (${relations.length}):`);
      for (const rel of relations) {
        const subj = entities.find(e => e.id === rel.subj)?.canonical || 'unknown';
        const obj = entities.find(e => e.id === rel.obj)?.canonical || 'unknown';
        const result = `${rel.pred}: ${subj} → ${obj}`;
        const matches = result.includes(rel.pred) ? '✓' : '✗';
        console.log(`     ${matches} ${result} (conf: ${rel.confidence.toFixed(2)})`);
      }

      if (relations.length === 0) {
        console.log('     ⚠️  No relations found');
      }

    } catch (error: any) {
      console.log(`   ❌ Error: ${error?.message || error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

testPhase2()
  .then(() => {
    console.log('\nTests complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
