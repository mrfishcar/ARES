import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const tests = [
    // Passive voice with entity names
    "DataVision Systems was founded by Eric Nelson and Maria Garcia.",
    "MobileFirst Technologies was founded by Matthew Brooks.",
    "CloudTech was founded by Jason Lee and Priya Sharma.",

    // Active voice for comparison
    "Eric Nelson founded DataVision Systems.",
    "Matthew Brooks founded MobileFirst Technologies.",
  ];

  for (let i = 0; i < tests.length; i++) {
    const text = tests[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST ${i + 1}: ${text}`);
    console.log('='.repeat(80));

    const { entities, relations } = await extractFromSegments(`passive-fix-${i}`, text);

    console.log(`\nEntities (${entities.length}):`);
    for (const e of entities) {
      console.log(`  - ${e.canonical} (${e.type})`);
    }

    console.log(`\nRelations (${relations.length}):`);
    for (const rel of relations) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || rel.subj.slice(0, 8);
      const obj = entities.find(e => e.id === rel.obj)?.canonical || rel.obj.slice(0, 8);
      console.log(`  ${rel.pred}: ${subj} → ${obj}`);
    }
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
