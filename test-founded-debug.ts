import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  // Test specific founding sentences
  const tests = [
    "Jessica Martinez founded DataFlow Technologies with Rebecca Chen.",
    "Robert Morrison, Sarah Chen, and David Williams founded Zenith Computing in 1985.",
    "Eric Nelson and Maria Garcia founded DataVision Systems.",
    "The company was founded by Matthew Brooks and Lauren Davis.",
    "Antonio Santos co-founded DataStream with Olivia Martinez."
  ];

  for (let i = 0; i < tests.length; i++) {
    const text = tests[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST ${i + 1}: ${text}`);
    console.log('='.repeat(80));

    const { entities, relations } = await extractFromSegments(`founded-test-${i}`, text);

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
