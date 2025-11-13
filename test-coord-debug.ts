/**
 * Debug coordination splitting for "James and Lily Potter"
 */

import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

const text = `Harry Potter was the son of James and Lily Potter.`;

async function debugCoord() {
  const testPath = './test-coord-debug.json';
  await clearStorage(testPath);

  console.log('\n=== TEXT ===');
  console.log(text);
  console.log('');

  await appendDoc('coord-debug', text, testPath);
  const graph = loadGraph(testPath);

  if (!graph) {
    console.error('No graph loaded');
    return;
  }

  console.log('\n=== ENTITIES ===');
  for (const entity of graph.entities) {
    console.log(`${entity.type}::${entity.canonical}`);
  }

  console.log(`\nTotal: ${graph.entities.length} entities`);

  // Check if "Lily Potter" was extracted
  const hasLilyPotter = graph.entities.some(e =>
    e.canonical.toLowerCase().includes('lily')
  );

  console.log(`\n"Lily Potter" extracted: ${hasLilyPotter ? 'YES ✓' : 'NO ❌'}`);
}

debugCoord().catch(console.error);
