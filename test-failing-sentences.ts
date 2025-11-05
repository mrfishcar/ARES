import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const tests = [
    // This worked before
    { name: "Simple sibling", text: "Sarah's younger brother David lives in Austin." },
    // This is failing now
    { name: "Full name sibling", text: "Sarah's younger brother David Chen started his own startup in Austin, Texas." },

    // This worked before
    { name: "Simple marriage", text: "Sarah and Marcus got married in 2022." },
    // This is failing now
    { name: "Complex marriage", text: "Meanwhile, Sarah and Marcus got married in Napa Valley in 2022." },
  ];

  for (const test of tests) {
    console.log('\n' + '='.repeat(80));
    console.log(test.name);
    console.log('TEXT:', test.text);
    console.log('='.repeat(80));

    const { entities, relations } = await extractFromSegments('test', test.text);
    console.log('Entities:', entities.map(e => e.canonical).join(', '));
    console.log('Relations:', relations.length);

    for (const rel of relations) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || rel.subj;
      const obj = entities.find(e => e.id === rel.obj)?.canonical || rel.obj;
      console.log(`  - ${subj} --[${rel.pred}]--> ${obj}`);
    }
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
