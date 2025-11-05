import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

async function debug() {
  const testPath = '/tmp/debug-span-clip.json';
  clearStorage(testPath);

  const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

  console.log(`Text length: ${text.length}`);
  console.log(`Text:\n${text}\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('\nEntities:');
  for (const e of graph!.entities) {
    console.log(`  "${e.canonical}" (${e.type}) [id: ${e.id}]`);
  }

  console.log('\nSpans:');
  for (const s of graph!.spans) {
    const entity = graph!.entities.find(e => e.id === s.entity_id);
    const spanText = text.slice(s.start, s.end);
    console.log(`  [${s.start}-${s.end}] "${spanText}" -> ${entity?.canonical} (${entity?.type})`);
  }

  clearStorage(testPath);
}

debug().catch(console.error);
