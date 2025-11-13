/**
 * Debug Stage 3 extraction issues
 */

import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';

const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

async function debugStage3() {
  const testPath = './test-stage3-debug.json';
  await clearStorage(testPath);

  console.log('\n=== EXTRACTING ===');
  console.log('Text:', text);
  console.log('');

  await appendDoc('3.1-debug', text, testPath);
  const graph = loadGraph(testPath);

  if (!graph) {
    console.error('No graph loaded');
    return;
  }

  console.log('\n=== ENTITIES ===');
  for (const entity of graph.entities) {
    console.log(`${entity.type}::${entity.canonical} (aliases: ${entity.aliases.join(', ') || 'none'})`);
  }

  console.log('\n=== RELATIONS ===');
  for (const rel of graph.relations) {
    const subj = graph.entities.find(e => e.id === rel.subj)?.canonical || rel.subj;
    const obj = graph.entities.find(e => e.id === rel.obj)?.canonical || rel.obj;
    console.log(`${subj} --[${rel.pred}]--> ${obj}`);
  }

  console.log(`\nTotal: ${graph.entities.length} entities, ${graph.relations.length} relations`);
}

debugStage3().catch(console.error);
