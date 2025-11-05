import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

async function debug() {
  const testPath = '/tmp/debug-dumbledore.json';
  clearStorage(testPath);

  const text = "Dumbledore is a wizard. The wizard teaches at Hogwarts.";
  console.log(`\nText: "${text}"\n`);

  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);

  console.log('Entities:');
  for (const e of graph!.entities) {
    console.log(`  ${e.canonical} (${e.type}) - aliases: [${e.aliases.join(', ')}]`);
  }

  console.log('\nExpected:');
  console.log('  Dumbledore (PERSON)');
  console.log('  Hogwarts (ORG)');

  clearStorage(testPath);
}

debug().catch(console.error);
