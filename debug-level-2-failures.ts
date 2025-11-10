/**
 * Debug Level 2 failures - detailed entity and relation extraction
 */

import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

const test1 = {
  text: 'Harry went to Hogwarts. He studied magic there.',
  id: 'test-2.1'
};

const test2 = {
  text: 'Hermione lives in London. She studies at Hogwarts.',
  id: 'test-2.2'
};

async function debug(testCase: typeof test1) {
  console.log(`\n=== ${testCase.id} ===`);
  console.log(`Text: "${testCase.text}"\n`);

  const testPath = path.join(process.cwd(), `debug-${testCase.id}.json`);
  clearStorage(testPath);

  await appendDoc(testCase.id, testCase.text, testPath);
  const graph = loadGraph(testPath);

  if (!graph) {
    console.log('ERROR: No graph generated');
    return;
  }

  console.log('Entities extracted:');
  for (const entity of graph.entities) {
    console.log(`  - ${entity.type}::${entity.canonical}`);
  }

  console.log('\nRelations extracted:');
  for (const rel of graph.relations) {
    const subj = graph.entities.find(e => e.id === rel.subj)?.canonical || rel.subj;
    const obj = graph.entities.find(e => e.id === rel.obj)?.canonical || rel.obj;
    console.log(`  - ${subj} --[${rel.pred}]--> ${obj}`);

    // Show evidence
    if (rel.evidence && rel.evidence[0]) {
      const ev = rel.evidence[0];
      console.log(`    Evidence: "${ev.span.text.substring(0, 50)}..."`);
    }
  }

  clearStorage(testPath);
}

async function main() {
  await debug(test1);
  await debug(test2);
}

main().catch(console.error);
