import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const tests = [
    // Advisor patterns
    "Professor Anderson was an advisor to the founders.",
    "Dr. Anderson advised the startup.",
    "Kevin mentored Jessica at DataFlow.",

    // Investment patterns
    "Sequoia Capital invested in Zenith Computing.",
    "Alexander Petrov invested two million dollars in DataFlow Technologies.",

    // Founded patterns (from earlier test)
    "Jessica Martinez founded DataFlow Technologies.",
    "The company was founded by Eric Nelson.",
    "Antonio Santos co-founded DataStream.",
  ];

  for (let i = 0; i < tests.length; i++) {
    const text = tests[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST ${i + 1}: ${text}`);
    console.log('='.repeat(80));

    const { entities, relations } = await extractFromSegments(`pattern-test-${i}`, text);

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
