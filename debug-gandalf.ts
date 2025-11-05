import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

async function debug() {
  const testPath = '/tmp/debug-gandalf.json';
  clearStorage(testPath);

  const text = "Gandalf traveled to Rivendell. Elrond lived there. He welcomed Gandalf.";
  console.log(`\nText: "${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('Entities:');
  for (const e of graph!.entities) {
    console.log(`  ${e.canonical} (${e.type}) - aliases: [${e.aliases.join(', ')}]`);
  }

  console.log('\nExpected:');
  console.log('  Gandalf (PERSON)');
  console.log('  Rivendell (PLACE)');
  console.log('  Elrond (PERSON)');

  clearStorage(testPath);
}

debug().catch(console.error);
