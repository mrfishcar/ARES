/**
 * Test dependency path integration in main extraction pipeline
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testSimpleExamples() {
  console.log('DEPENDENCY PATH INTEGRATION TEST');
  console.log('='.repeat(80));

  const tests = [
    // Simple marriage (should work with old and new patterns)
    "Jessica married David",

    // Creative marriage (dependency paths only)
    "She made him a husband",

    // Simple founding (should work with old and new patterns)
    "Jessica founded DataFlow",

    // Passive founding (dependency paths should help)
    "DataFlow was founded by Jessica",

    // Complex with relative clause
    "CloudTech, which had been founded by Jason Lee, received funding",
  ];

  for (let i = 0; i < tests.length; i++) {
    const text = tests[i];
    console.log(`\n${i + 1}. "${text}"`);
    console.log('-'.repeat(80));

    try {
      const { entities, relations } = await extractFromSegments(`test-${i}`, text);

      console.log(`   Entities (${entities.length}):`);
      for (const e of entities) {
        console.log(`     - ${e.canonical} (${e.type})`);
      }

      console.log(`   Relations (${relations.length}):`);
      for (const rel of relations) {
        const subj = entities.find(e => e.id === rel.subj)?.canonical || rel.subj.slice(0, 8);
        const obj = entities.find(e => e.id === rel.obj)?.canonical || rel.obj.slice(0, 8);
        console.log(`     ✓ ${rel.pred}: ${subj} → ${obj} (conf: ${rel.confidence.toFixed(2)}, ext: ${rel.extractor})`);
      }

      if (relations.length === 0) {
        console.log('     ⚠️  No relations found');
      }

    } catch (error: any) {
      console.log(`   ❌ Error: ${error?.message || error}`);
      if (error?.stack) {
        console.log(error.stack);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
}

testSimpleExamples()
  .then(() => {
    console.log('\nTest complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    console.error(err.stack);
    process.exit(1);
  });
