/**
 * Test Phase 2 Extended patterns: Ownership, Social, Professional, Academic
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testPhase2Extended() {
  console.log('PHASE 2 EXTENDED PATTERN TESTS');
  console.log('='.repeat(80));

  const tests = [
    // Ownership patterns
    {
      name: 'Owns active',
      text: 'Robert Morrison owns Zenith Computing',
      expected: 'owns: Robert Morrison → Zenith Computing'
    },
    {
      name: 'Owned by passive',
      text: 'DataVision Systems is owned by Robert Morrison',
      expected: 'owns: Robert Morrison → DataVision Systems'
    },

    // Social patterns
    {
      name: 'Became friends',
      text: 'Gabriel Santos became friends with Michael Chen',
      expected: 'friends_with: Gabriel Santos → Michael Chen'
    },
    {
      name: 'Was friends with',
      text: 'Sarah Morrison was friends with Emily Thompson',
      expected: 'friends_with: Sarah Morrison → Emily Thompson'
    },
    {
      name: 'Became rival',
      text: 'Alexander Petrov became a rival to Viktor Sokolov',
      expected: 'enemy_of: Alexander Petrov → Viktor Sokolov'
    },

    // Professional patterns
    {
      name: 'Manages',
      text: 'Victoria Chen manages the engineering team',
      expected: 'leads: Victoria Chen → team'
    },
    {
      name: 'Collaborated with',
      text: 'Dr. Yuki Tanaka collaborated with Professor Richard Foster',
      expected: 'ally_of: Yuki Tanaka → Richard Foster'
    },
    {
      name: 'Worked with',
      text: 'Gabriel Santos worked with Michael Chen',
      expected: 'ally_of: Gabriel Santos → Michael Chen'
    },
    {
      name: 'Reports to',
      text: 'Eric Nelson reports to the CTO',
      expected: 'member_of: Eric Nelson → CTO'
    },

    // Academic patterns
    {
      name: 'Graduated from',
      text: 'Isabella Garcia graduated from Stanford University',
      expected: 'attended: Isabella Garcia → Stanford University'
    },
    {
      name: 'Received degree',
      text: 'Michael Chen received his PhD from MIT',
      expected: 'attended: Michael Chen → MIT'
    },
    {
      name: 'Researched at',
      text: 'Dr. Yuki Tanaka researched at Tokyo Institute',
      expected: 'member_of: Yuki Tanaka → Tokyo Institute'
    },
  ];

  let passed = 0;
  let total = tests.length;

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
      if (relations.length > 0) {
        for (const rel of relations) {
          const subj = entities.find(e => e.id === rel.subj)?.canonical || 'unknown';
          const obj = entities.find(e => e.id === rel.obj)?.canonical || 'unknown';
          const result = `${rel.pred}: ${subj} → ${obj}`;
          const matches = result.includes(rel.pred) ? '✓' : '✗';
          console.log(`     ${matches} ${result} (conf: ${rel.confidence.toFixed(2)})`);
          if (matches === '✓') passed++;
        }
      } else {
        console.log('     ⚠️  No relations found');
      }

    } catch (error: any) {
      console.log(`   ❌ Error: ${error?.message || error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`RESULTS: ${passed}/${total} patterns working (${Math.round(100 * passed / total)}%)`);
  console.log('='.repeat(80));
}

testPhase2Extended()
  .then(() => {
    console.log('\nTests complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
