import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

async function test() {
  const testPath = path.join(process.cwd(), 'debug-went.json');
  clearStorage(testPath);

  const text = 'Hermione went to Hogwarts.';
  console.log(`Testing: "${text}"\n`);

  // Enable debug mode
  process.env.L3_DEBUG = '1';

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('\nEntities extracted:');
  graph?.entities.forEach(e => {
    console.log(`  - ${e.canonical} (${e.type})`);
  });

  console.log('\nRelations extracted:');
  if (graph?.relations.length === 0) {
    console.log('  ❌ NO RELATIONS EXTRACTED');
  } else {
    graph?.relations.forEach(r => {
      const subj = graph?.entities.find(e => e.id === r.subj)?.canonical;
      const obj = graph?.entities.find(e => e.id === r.obj)?.canonical;
      console.log(`  - ${subj} --${r.pred}-> ${obj}`);
    });
  }

  console.log('\nExpected: Hermione --traveled_to-> Hogwarts');

  clearStorage(testPath);
}

test().catch(console.error);
