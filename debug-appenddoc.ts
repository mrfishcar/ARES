import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

async function debug() {
  const testPath = '/tmp/debug-appenddoc.json';
  clearStorage(testPath);

  const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

  console.log(`Text:\n"${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log(`\nEntities (${graph!.entities.length}):`);
  for (const e of graph!.entities) {
    console.log(`  "${e.canonical}" (${e.type})`);
  }

  console.log(`\nGold entities:`);
  const gold = ['Harry Potter', 'James', 'Lily Potter', 'Dursleys', 'Privet Drive', 'Ron Weasley', 'Arthur', 'Ministry of Magic'];
  for (const g of gold) {
    const found = graph!.entities.find(e => e.canonical.toLowerCase() === g.toLowerCase());
    if (found) {
      console.log(`  ✅ ${g}`);
    } else {
      console.log(`  ❌ ${g} - MISSING`);
    }
  }

  clearStorage(testPath);
}

debug().catch(console.error);
