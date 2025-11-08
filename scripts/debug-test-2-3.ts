/**
 * Debug script for test 2.3 pronoun resolution issue
 */

import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import type { Entity, Relation } from '../app/engine/schema';

async function debug() {
  const text = 'Frodo lived in the Shire. He traveled to Mordor.';
  const testPath = 'test-debug-2-3.json';

  console.log('Testing:', text);
  console.log('');

  clearStorage(testPath);
  await appendDoc('debug-2-3', text, testPath);
  const graph = loadGraph(testPath);

  if (!graph) {
    console.log('ERROR: Failed to load graph');
    return;
  }

  console.log('Entities:');
  graph.entities.forEach((e: Entity) => {
    console.log(`  - ${e.canonical} (${e.type}) [aliases: ${e.aliases?.join(', ') || 'none'}]`);
  });

  console.log('\nRelations:');
  graph.relations.forEach((r: Relation) => {
    const subj = graph.entities.find((e: Entity) => e.id === r.subj);
    const obj = graph.entities.find((e: Entity) => e.id === r.obj);
    console.log(`  - ${subj?.canonical} --[${r.pred}]--> ${obj?.canonical}`);
  });

  console.log('\nExpected relations:');
  console.log('  - Frodo --[lives_in]--> Shire');
  console.log('  - Frodo --[traveled_to]--> Mordor');

  clearStorage(testPath);
}

debug().catch(console.error);
