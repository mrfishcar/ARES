import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';

async function test() {
  const testPath = 'test-simple.json';

  const text = 'Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan.';

  console.log(`Testing: "${text}"\n`);

  clearStorage(testPath);
  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  if (!graph) {
    console.log('ERROR: No graph loaded');
    return;
  }

  console.log(`Entities found: ${graph.entities.length}`);
  graph.entities.forEach(e => {
    console.log(`  - ${e.canonical} (${e.type})`);
  });

  console.log(`\nRelations found: ${graph.relations.length}`);
  graph.relations.forEach(r => {
    const subj = graph.entities.find(e => e.id === r.subj);
    const obj = graph.entities.find(e => e.id === r.obj);
    console.log(`  - ${subj?.canonical} --[${r.pred}]--> ${obj?.canonical}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('Expected:');
  console.log('  Entities: Theoden (PERSON), Rohan (PLACE), Eowyn (PERSON)');
  console.log('  Relations:');
  console.log('    - Theoden --[rules]--> Rohan');
  console.log('    - Eowyn --[lives_in]--> Rohan');

  clearStorage(testPath);
}

test().catch(console.error);
