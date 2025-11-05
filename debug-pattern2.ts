import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

async function debug() {
  const testPath = '/tmp/debug-pattern2.json';
  clearStorage(testPath);

  const text = "Aragorn, son of Arathorn, married Arwen.";
  console.log(`\nText: "${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('Entities:');
  const entityCounts = new Map<string, number>();
  for (const e of graph!.entities) {
    console.log(`  ${e.id}: ${e.canonical} (${e.type})`);
    const key = e.canonical.toLowerCase();
    entityCounts.set(key, (entityCounts.get(key) || 0) + 1);
  }

  console.log('\nDuplicate Analysis:');
  for (const [name, count] of entityCounts) {
    if (count > 1) {
      console.log(`  "${name}" appears ${count} times`);
      const dupes = graph!.entities.filter(e => e.canonical.toLowerCase() === name);
      for (const d of dupes) {
        console.log(`    - ${d.id} (${d.type})`);
      }
    }
  }

  console.log('\nRelations:');
  for (const r of graph!.relations) {
    const subj = graph!.entities.find(e => e.id === r.subj);
    const obj = graph!.entities.find(e => e.id === r.obj);
    console.log(`  ${subj?.canonical} (${r.subj}) --${r.pred}--> ${obj?.canonical} (${r.obj}) (${r.extractor})`);
  }

  clearStorage(testPath);
}

debug().catch(console.error);
