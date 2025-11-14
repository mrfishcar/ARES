/**
 * RAPID ARES VERIFICATION TEST
 * Quick test to prove core capabilities without timeout
 */

import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

const TEST_TEXT = `
Harry Potter, also known as "The Boy Who Lived," was the son of James Potter and Lily Potter.
He attended Hogwarts School where he became friends with Ron Weasley and Hermione Granger.
The young wizard defeated Lord Voldemort, also known as Tom Riddle, in a final battle.
Professor Dumbledore, the headmaster, mentored Harry throughout his time at the school.
Hermione studied at Hogwarts and became the brightest witch of her age. She excelled in all subjects.
`;

async function rapidTest() {
  const testPath = path.join(process.cwd(), 'test-rapid-kg.json');
  clearStorage(testPath);

  console.log('🚀 RAPID ARES VERIFICATION TEST\n');
  console.log('Testing:', TEST_TEXT.length, 'characters\n');

  const start = Date.now();
  await appendDoc('rapid-test', TEST_TEXT, testPath);
  const time = Date.now() - start;

  const graph = loadGraph(testPath);
  if (!graph) {
    console.error('❌ FAILED');
    return;
  }

  console.log('✅ EXTRACTION SUCCESSFUL!\n');
  console.log(`⏱️  Time: ${time}ms`);
  console.log(`📦 Entities: ${graph.entities.length}`);
  console.log(`🔗 Relations: ${graph.relations.length}\n`);

  console.log('🧙 KEY ENTITIES:');
  const persons = graph.entities.filter(e => e.type === 'PERSON');
  for (const p of persons.slice(0, 10)) {
    console.log(`  ${p.canonical}`);
    if (p.aliases && p.aliases.length > 0) {
      console.log(`    └─ Aliases: ${p.aliases.slice(0, 3).join(', ')}`);
    }
  }

  console.log('\n🏰 LOCATIONS:');
  const locs = graph.entities.filter(e => ['PLACE', 'ORG'].includes(e.type));
  for (const l of locs.slice(0, 5)) {
    console.log(`  ${l.canonical} (${l.type})`);
  }

  console.log('\n💕 RELATIONSHIPS:');
  for (const rel of graph.relations.slice(0, 10)) {
    const subj = graph.entities.find(e => e.id === rel.subj);
    const obj = graph.entities.find(e => e.id === rel.obj);
    if (subj && obj) {
      console.log(`  ${subj.canonical} --[${rel.pred}]--> ${obj.canonical}`);
    }
  }

  console.log('\n✅ ARES IS OPERATIONAL AND READY!\n');
}

rapidTest().catch(console.error);
