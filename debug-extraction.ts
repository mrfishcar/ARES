/**
 * Debug script to see what's actually being extracted
 */
import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

const testPath = path.join(__dirname, 'test-storage', 'debug-extraction.json');

async function debug() {
  clearStorage(testPath);

  const testCases = [
    {
      id: '2.1',
      text: 'Harry went to Hogwarts. He studied magic there.',
      gold: {
        entities: ['PERSON::harry', 'ORG::hogwarts'],
        relations: ['harry::traveled_to::hogwarts', 'harry::studies_at::hogwarts']
      }
    },
    {
      id: '2.2',
      text: 'Hermione lives in London. She studies at Hogwarts.',
      gold: {
        entities: ['PERSON::hermione', 'PLACE::london', 'ORG::hogwarts'],
        relations: ['hermione::lives_in::london', 'hermione::studies_at::hogwarts']
      }
    },
    {
      id: '2.4',
      text: 'Aragorn married Arwen. He loved her deeply.',
      gold: {
        entities: ['PERSON::aragorn', 'PERSON::arwen'],
        relations: ['aragorn::married_to::arwen', 'arwen::married_to::aragorn']
      }
    }
  ];

  for (const tc of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test ${tc.id}: ${tc.text}`);
    console.log(`${'='.repeat(60)}`);

    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath);

    if (!graph) {
      console.log('❌ No graph extracted!');
      continue;
    }

    console.log('\n📦 Entities Extracted:');
    graph.entities.forEach(e => {
      console.log(`  ${e.type}::${e.canonical.toLowerCase()}`);
      if (e.aliases && e.aliases.length > 0) {
        console.log(`    aliases: ${e.aliases.join(', ')}`);
      }
    });

    console.log('\n🔗 Relations Extracted:');
    graph.relations.forEach(r => {
      const subj = graph.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '?';
      const obj = graph.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '?';
      console.log(`  ${subj}::${r.pred}::${obj} (conf: ${r.confidence.toFixed(2)})`);
    });

    console.log('\n✅ Gold Standard:');
    console.log(`  Entities: ${tc.gold.entities.join(', ')}`);
    console.log(`  Relations: ${tc.gold.relations.join(', ')}`);

    // Check what's missing
    const extractedEntities = new Set(graph.entities.map(e => `${e.type}::${e.canonical.toLowerCase()}`));
    const extractedRelations = new Set(
      graph.relations.map(r => {
        const subj = graph.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '';
        const obj = graph.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '';
        return `${subj}::${r.pred}::${obj}`;
      })
    );

    const goldEntities = new Set(tc.gold.entities);
    const goldRelations = new Set(tc.gold.relations);

    const missingEntities = Array.from(goldEntities).filter(e => !extractedEntities.has(e));
    const missingRelations = Array.from(goldRelations).filter(r => !extractedRelations.has(r));
    const extraEntities = Array.from(extractedEntities).filter(e => !goldEntities.has(e));
    const extraRelations = Array.from(extractedRelations).filter(r => !goldRelations.has(r));

    if (missingEntities.length > 0) {
      console.log(`\n❌ Missing Entities: ${missingEntities.join(', ')}`);
    }
    if (missingRelations.length > 0) {
      console.log(`❌ Missing Relations: ${missingRelations.join(', ')}`);
    }
    if (extraEntities.length > 0) {
      console.log(`\n⚠️  Extra Entities: ${extraEntities.join(', ')}`);
    }
    if (extraRelations.length > 0) {
      console.log(`⚠️  Extra Relations: ${extraRelations.join(', ')}`);
    }
  }

  clearStorage(testPath);
}

debug().catch(console.error);
