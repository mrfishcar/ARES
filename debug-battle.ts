import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

async function debug() {
  const testPath = '/tmp/debug-battle.json';
  clearStorage(testPath);

  const text = "Eowyn fought in the Battle of Pelennor Fields.";
  console.log(`\nText: "${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('Entities:');
  for (const e of graph!.entities) {
    console.log(`  ${e.canonical} (${e.type}) - aliases: [${e.aliases.join(', ')}]`);
  }

  console.log('\nRelations:');
  for (const r of graph!.relations) {
    const subj = graph!.entities.find(e => e.id === r.subj);
    const obj = graph!.entities.find(e => e.id === r.obj);
    console.log(`  ${subj?.canonical} --${r.pred}--> ${obj?.canonical} (${r.extractor})`);
  }

  console.log('\nExpected:');
  console.log('  Entities: Eowyn (PERSON), Battle of Pelennor Fields (EVENT)');
  console.log('  Relations: Eowyn --fought_in--> Battle of Pelennor Fields');

  clearStorage(testPath);
}

debug().catch(console.error);
