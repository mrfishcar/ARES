import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

async function test() {
  const testPath = path.join(process.cwd(), 'test-title.json');
  clearStorage(testPath);

  const text = 'Dumbledore is a wizard. The wizard teaches at Hogwarts.';
  console.log(`Testing: "${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('Entities:');
  graph?.entities.forEach(e => {
    console.log(`  - ${e.canonical} (${e.type})`);
  });

  console.log('\nRelations extracted:');
  if (graph?.relations.length === 0) {
    console.log('  ❌ NO RELATIONS');
  } else {
    graph?.relations.forEach(r => {
      const subj = graph?.entities.find(e => e.id === r.subj)?.canonical;
      const obj = graph?.entities.find(e => e.id === r.obj)?.canonical;
      console.log(`  - ${subj} --${r.pred}-> ${obj}`);
    });
  }

  console.log('\nExpected:');
  console.log('  - Dumbledore --teaches_at-> Hogwarts');

  clearStorage(testPath);
}

test().catch(console.error);
