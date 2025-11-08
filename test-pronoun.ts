import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

async function test() {
  const testPath = path.join(process.cwd(), 'test-pronoun.json');
  clearStorage(testPath);

  const text = 'Harry went to Hogwarts. He studied magic there.';
  console.log(`Testing: "${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('Entities:');
  graph?.entities.forEach(e => {
    console.log(`  - ${e.canonical} (${e.type})`);
  });

  console.log('\nRelations extracted:');
  graph?.relations.forEach(r => {
    const subj = graph?.entities.find(e => e.id === r.subj)?.canonical;
    const obj = graph?.entities.find(e => e.id === r.obj)?.canonical;
    console.log(`  - ${subj} --${r.pred}-> ${obj}`);
  });

  console.log('\nExpected:');
  console.log('  - Harry --traveled_to-> Hogwarts');
  console.log('  - Harry --studies_at-> Hogwarts');

  clearStorage(testPath);
}

test().catch(console.error);
