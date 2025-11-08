import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

async function test() {
  const testPath = path.join(process.cwd(), 'quick-test.json');
  clearStorage(testPath);

  const text = 'Aragorn, son of Arathorn, married Arwen.';
  console.log(`Testing: "${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('Entities extracted:');
  graph?.entities.forEach(e => {
    console.log(`  - ${e.canonical} (${e.type})`);
  });

  console.log('\nRelations extracted:');
  graph?.relations.forEach(r => {
    const subj = graph?.entities.find(e => e.id === r.subj)?.canonical;
    const obj = graph?.entities.find(e => e.id === r.obj)?.canonical;
    console.log(`  - ${subj} --${r.pred}-> ${obj}`);
  });

  console.log('\nExpected relations:');
  console.log('  - Aragorn --child_of-> Arathorn');
  console.log('  - Arathorn --parent_of-> Aragorn');
  console.log('  - Aragorn --married_to-> Arwen');
  console.log('  - Arwen --married_to-> Aragorn');

  clearStorage(testPath);
}

test().catch(console.error);
