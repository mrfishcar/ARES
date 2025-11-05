import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

async function debug() {
  const testPath = '/tmp/debug-exact.json';
  clearStorage(testPath);

  // Exact text from diagnostic with leading spaces
  const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

    Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

  console.log(`Text with repr:\n${JSON.stringify(text)}\n`);

  await appendDoc('3.1', text, testPath);
  const graph = loadGraph(testPath);

  console.log(`\nEntities (${graph!.entities.length}):`);
  for (const e of graph!.entities) {
    console.log(`  "${e.canonical}" (${e.type})`);
  }

  clearStorage(testPath);
}

debug().catch(console.error);
