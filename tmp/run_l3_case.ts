import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

const cases: Record<string, string> = {
  '3.9': `Professor McGonagall taught Transfiguration at Hogwarts. She was also the head of Gryffindor House.

Professor Snape taught Potions. The stern professor later became headmaster.`
};

async function run() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node tmp/run_l3_case.ts <id>');
    process.exit(1);
  }
  const text = cases[id];
  if (!text) {
    console.error(`Unknown case ${id}`);
    process.exit(1);
  }
  const testPath = path.join(process.cwd(), `tmp/l3-case-${id}.json`);
  await clearStorage(testPath);
  await appendDoc(id, text, testPath);
  const graph = loadGraph(testPath);
  if (!graph) {
    console.error('Graph load failed');
    process.exit(1);
  }

  console.log(`Entities for ${id}:`);
  for (const ent of graph.entities) {
    console.log(`  ${ent.type}::${ent.canonical} (aliases: ${ent.aliases?.join(', ') || 'none'})`);
  }
  console.log(`\nRelations for ${id}:`);
  for (const rel of graph.relations) {
    const subj = graph.entities.find(e => e.id === rel.subj)?.canonical || rel.subj;
    const obj = graph.entities.find(e => e.id === rel.obj)?.canonical || rel.obj;
    console.log(`  ${subj} --[${rel.pred}]--> ${obj}`);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
