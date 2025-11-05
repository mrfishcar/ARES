import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

async function debug() {
  const testPath = '/tmp/debug-test2.1.json';
  clearStorage(testPath);

  const text = "Harry went to Hogwarts. He studied magic there.";
  console.log(`\nText: "${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('Entities:');
  for (const e of graph!.entities) {
    console.log(`  ${e.canonical} (${e.type})`);
  }

  console.log('\nRelations:');
  for (const r of graph!.relations) {
    const subj = graph!.entities.find(e => e.id === r.subj);
    const obj = graph!.entities.find(e => e.id === r.obj);
    console.log(`  ${subj?.canonical} --${r.pred}--> ${obj?.canonical}`);
  }

  console.log('\nExpected Relations:');
  console.log('  Harry --traveled_to--> Hogwarts');
  console.log('  Harry --studies_at--> Hogwarts');

  clearStorage(testPath);
}

debug().catch(console.error);
