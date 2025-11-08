/**
 * Analyze test failures in detail
 */
import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';
import * as fs from 'fs';

interface GoldEntity {
  text: string;
  type: 'PERSON' | 'PLACE' | 'ORG' | 'DATE' | 'HOUSE' | 'ITEM' | 'WORK' | 'EVENT';
}

interface GoldRelation {
  subj: string;
  pred: string;
  obj: string;
}

interface TestCase {
  id: string;
  text: string;
  gold: {
    entities: GoldEntity[];
    relations: GoldRelation[];
  };
}

function computePrecision(extracted: Set<string>, gold: Set<string>): number {
  if (extracted.size === 0) return gold.size === 0 ? 1 : 0;
  let correct = 0;
  for (const item of extracted) {
    if (gold.has(item)) correct++;
  }
  return correct / extracted.size;
}

function computeRecall(extracted: Set<string>, gold: Set<string>): number {
  if (gold.size === 0) return 1;
  let correct = 0;
  for (const item of gold) {
    if (extracted.has(item)) correct++;
  }
  return correct / gold.size;
}

async function analyzeLevel(
  level: string,
  testCases: TestCase[],
  thresholds: { entityP: number; entityR: number; relationP: number; relationR: number }
) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`ANALYZING ${level}`);
  console.log(`${'='.repeat(70)}\n`);

  const testPath = path.join(process.cwd(), `test-${level}.json`);
  const failures: any[] = [];

  for (const tc of testCases) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath);

    if (!graph) {
      failures.push({ id: tc.id, error: 'No graph extracted' });
      continue;
    }

    const goldEntities = new Set(tc.gold.entities.map(e => `${e.type}::${e.text.toLowerCase()}`));
    const goldRelations = new Set(tc.gold.relations.map(r => `${r.subj.toLowerCase()}::${r.pred}::${r.obj.toLowerCase()}`));

    const extractedEntities = new Set(graph.entities.map(e => `${e.type}::${e.canonical.toLowerCase()}`));
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

    if (
      entityP < thresholds.entityP ||
      entityR < thresholds.entityR ||
      relationP < thresholds.relationP ||
      relationR < thresholds.relationR
    ) {
      const missingEntities = Array.from(goldEntities).filter(e => !extractedEntities.has(e));
      const missingRelations = Array.from(goldRelations).filter(r => !extractedRelations.has(r));
      const extraEntities = Array.from(extractedEntities).filter(e => !goldEntities.has(e));
      const extraRelations = Array.from(extractedRelations).filter(r => !goldRelations.has(r));

      console.log(`\n❌ Test ${tc.id} FAILED:`);
      console.log(`   Text: "${tc.text}"`);
      console.log(`   Entity P/R: ${(entityP * 100).toFixed(1)}% / ${(entityR * 100).toFixed(1)}%`);
      console.log(`   Relation P/R: ${(relationP * 100).toFixed(1)}% / ${(relationR * 100).toFixed(1)}%`);

      if (missingEntities.length > 0) {
        console.log(`   ❌ Missing entities: ${missingEntities.join(', ')}`);
      }
      if (missingRelations.length > 0) {
        console.log(`   ❌ Missing relations: ${missingRelations.join(', ')}`);
      }
      if (extraEntities.length > 0) {
        console.log(`   ⚠️  Extra entities: ${extraEntities.join(', ')}`);
      }
      if (extraRelations.length > 0) {
        console.log(`   ⚠️  Extra relations: ${extraRelations.join(', ')}`);
      }

      failures.push({
        id: tc.id,
        text: tc.text,
        missingEntities,
        missingRelations,
        extraEntities,
        extraRelations,
        metrics: { entityP, entityR, relationP, relationR }
      });
    } else {
      console.log(`✓ Test ${tc.id} passed`);
    }
  }

  clearStorage(testPath);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${level} SUMMARY: ${failures.length}/${testCases.length} tests failed`);
  console.log(`${'='.repeat(70)}\n`);

  return failures;
}

async function main() {
  // Import test cases from the actual test files
  const level1Tests = require('./tests/ladder/level-1-simple.spec.ts');

  // For now, let's test a sample
  const sampleTests: TestCase[] = [
    {
      id: '1.1',
      text: 'Gandalf is a wizard.',
      gold: {
        entities: [
          { text: 'Gandalf', type: 'PERSON' },
          { text: 'wizard', type: 'PERSON' }
        ],
        relations: []
      }
    },
    {
      id: '1.2',
      text: 'Frodo lives in the Shire.',
      gold: {
        entities: [
          { text: 'Frodo', type: 'PERSON' },
          { text: 'Shire', type: 'PLACE' }
        ],
        relations: [
          { subj: 'Frodo', pred: 'lives_in', obj: 'Shire' }
        ]
      }
    },
    {
      id: '1.3',
      text: 'Aragorn married Arwen.',
      gold: {
        entities: [
          { text: 'Aragorn', type: 'PERSON' },
          { text: 'Arwen', type: 'PERSON' }
        ],
        relations: [
          { subj: 'Aragorn', pred: 'married_to', obj: 'Arwen' },
          { subj: 'Arwen', pred: 'married_to', obj: 'Aragorn' }
        ]
      }
    }
  ];

  await analyzeLevel('sample', sampleTests, {
    entityP: 0.90,
    entityR: 0.85,
    relationP: 0.90,
    relationR: 0.85
  });
}

main().catch(console.error);
