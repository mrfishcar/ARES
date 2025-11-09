/**
 * Run Level 2 and show detailed results
 */

import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

// First 3 test cases from level-2-multisentence.spec.ts
const testCases = [
  {
    id: '2.1',
    text: 'Harry went to Hogwarts. He studied magic there.',
    gold: {
      entities: [
        { text: 'Harry', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' }
      ],
      relations: [
        { subj: 'Harry', pred: 'traveled_to', obj: 'Hogwarts' },
        { subj: 'Harry', pred: 'studies_at', obj: 'Hogwarts' }
      ]
    }
  },
  {
    id: '2.2',
    text: 'Hermione lives in London. She studies at Hogwarts.',
    gold: {
      entities: [
        { text: 'Hermione', type: 'PERSON' },
        { text: 'London', type: 'PLACE' },
        { text: 'Hogwarts', type: 'ORG' }
      ],
      relations: [
        { subj: 'Hermione', pred: 'lives_in', obj: 'London' },
        { subj: 'Hermione', pred: 'studies_at', obj: 'Hogwarts' }
      ]
    }
  },
  {
    id: '2.3',
    text: 'Frodo lived in the Shire. He traveled to Mordor.',
    gold: {
      entities: [
        { text: 'Frodo', type: 'PERSON' },
        { text: 'Shire', type: 'PLACE' },
        { text: 'Mordor', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Frodo', pred: 'lives_in', obj: 'Shire' },
        { subj: 'Frodo', pred: 'traveled_to', obj: 'Mordor' }
      ]
    }
  }
];

function computePrecision(extracted: Set<string>, gold: Set<string>): number {
  if (extracted.size === 0) return 0;
  const correct = Array.from(extracted).filter(e => gold.has(e)).length;
  return correct / extracted.size;
}

function computeRecall(extracted: Set<string>, gold: Set<string>): number {
  if (gold.size === 0) return 1;
  const correct = Array.from(extracted).filter(e => gold.has(e)).length;
  return correct / gold.size;
}

async function runLevel2Sample() {
  const testPath = path.join(process.cwd(), 'test-ladder-2.json');

  console.log('\n=== LEVEL 2 SAMPLE (3 tests) ===\n');

  const results: any[] = [];

  for (const tc of testCases) {
    clearStorage(testPath);

    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;

    const goldEntities = new Set(tc.gold.entities.map(e => `${e.type}::${e.text.toLowerCase()}`));
    const goldRelations = new Set(tc.gold.relations.map(r => `${r.subj.toLowerCase()}::${r.pred}::${r.obj.toLowerCase()}`));

    const extractedEntities = new Set(
      graph.entities.map(e => `${e.type}::${e.canonical.toLowerCase()}`)
    );

    const extractedRelations = new Set(
      graph.relations.map(r => {
        const subj = graph.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '';
        const obj = graph.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '';
        return `${subj}::${r.pred}::${obj}`;
      })
    );

    const entityP = computePrecision(extractedEntities, goldEntities);
    const entityR = computeRecall(extractedEntities, goldEntities);
    const relationP = computePrecision(extractedRelations, goldRelations);
    const relationR = computeRecall(extractedRelations, goldRelations);

    results.push({ id: tc.id, entityP, entityR, relationP, relationR });

    const passed = entityP >= 0.85 && entityR >= 0.80 && relationP >= 0.85 && relationR >= 0.80;
    console.log(`${passed ? '✅' : '❌'} Test ${tc.id}: E[P=${(entityP * 100).toFixed(0)}% R=${(entityR * 100).toFixed(0)}%] R[P=${(relationP * 100).toFixed(0)}% R=${(relationR * 100).toFixed(0)}%]`);

    if (!passed) {
      console.log(`   Text: "${tc.text}"`);
      console.log(`   Gold entities: ${Array.from(goldEntities).join(', ')}`);
      console.log(`   Extracted: ${Array.from(extractedEntities).join(', ')}`);
      console.log(`   Gold relations: ${Array.from(goldRelations).join(', ')}`);
      console.log(`   Extracted: ${Array.from(extractedRelations).join(', ')}`);
    }
  }

  const avgEntityP = results.reduce((sum, r) => sum + r.entityP, 0) / results.length;
  const avgEntityR = results.reduce((sum, r) => sum + r.entityR, 0) / results.length;
  const avgRelationP = results.reduce((sum, r) => sum + r.relationP, 0) / results.length;
  const avgRelationR = results.reduce((sum, r) => sum + r.relationR, 0) / results.length;

  const entityF1 = (2 * avgEntityP * avgEntityR) / (avgEntityP + avgEntityR);
  const relationF1 = (2 * avgRelationP * avgRelationR) / (avgRelationP + avgRelationR);

  console.log('\n📊 AGGREGATE METRICS (3 tests):');
  console.log(`\nEntities:`);
  console.log(`  Precision: ${(avgEntityP * 100).toFixed(1)}% (target: ≥85%)`);
  console.log(`  Recall: ${(avgEntityR * 100).toFixed(1)}% (target: ≥80%)`);
  console.log(`  F1: ${(entityF1 * 100).toFixed(1)}% (target: ≥82%)`);

  console.log(`\nRelations:`);
  console.log(`  Precision: ${(avgRelationP * 100).toFixed(1)}% (target: ≥85%)`);
  console.log(`  Recall: ${(avgRelationR * 100).toFixed(1)}% (target: ≥80%)`);
  console.log(`  F1: ${(relationF1 * 100).toFixed(1)}% (target: ≥82%)`);

  const passed = avgEntityP >= 0.85 && avgEntityR >= 0.80 && avgRelationP >= 0.85 && avgRelationR >= 0.80;
  console.log(`\n${passed ? '🎉 SAMPLE PASSED!' : '❌ SAMPLE FAILED'}\n`);

  clearStorage(testPath);
}

runLevel2Sample().catch(console.error);
