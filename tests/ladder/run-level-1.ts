/**
 * Run Level 1 and show detailed results
 */

import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import * as path from 'path';

// Same test cases from level-1-simple.spec.ts
const testCases = [
  {
    id: '1.1',
    text: 'Aragorn, son of Arathorn, married Arwen.',
    gold: {
      entities: [
        { text: 'Aragorn', type: 'PERSON' },
        { text: 'Arathorn', type: 'PERSON' },
        { text: 'Arwen', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Aragorn', pred: 'child_of', obj: 'Arathorn' },
        { subj: 'Arathorn', pred: 'parent_of', obj: 'Aragorn' },
        { subj: 'Aragorn', pred: 'married_to', obj: 'Arwen' },
        { subj: 'Arwen', pred: 'married_to', obj: 'Aragorn' }
      ]
    }
  },
  {
    id: '1.2',
    text: 'Frodo is the son of Drogo.',
    gold: {
      entities: [
        { text: 'Frodo', type: 'PERSON' },
        { text: 'Drogo', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Frodo', pred: 'child_of', obj: 'Drogo' },
        { subj: 'Drogo', pred: 'parent_of', obj: 'Frodo' }
      ]
    }
  },
  {
    id: '1.3',
    text: 'Harry married Ginny.',
    gold: {
      entities: [
        { text: 'Harry', type: 'PERSON' },
        { text: 'Ginny', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Harry', pred: 'married_to', obj: 'Ginny' },
        { subj: 'Ginny', pred: 'married_to', obj: 'Harry' }
      ]
    }
  }
];

async function runLevel1() {
  const testPath = path.join(process.cwd(), 'test-ladder-1.json');

  console.log('\n🎯 LEVEL 1: Simple Sentences\n');
  console.log('Running first 3 test cases...\n');

  for (const tc of testCases) {
    clearStorage(testPath);

    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;

    console.log(`Test ${tc.id}: "${tc.text}"`);
    console.log(`  Gold entities (${tc.gold.entities.length}): ${tc.gold.entities.map(e => e.text).join(', ')}`);
    console.log(`  Extracted (${graph.entities.length}): ${graph.entities.map(e => e.canonical).join(', ')}`);
    console.log(`  Gold relations (${tc.gold.relations.length}): ${tc.gold.relations.map(r => `${r.subj}-${r.pred}->${r.obj}`).join(', ')}`);
    console.log(`  Extracted (${graph.relations.length}): ${graph.relations.map(r => {
      const subj = graph.entities.find(e => e.id === r.subj)?.canonical || '?';
      const obj = graph.entities.find(e => e.id === r.obj)?.canonical || '?';
      return `${subj}-${r.pred}->${obj}`;
    }).join(', ')}`);
    console.log();
  }

  clearStorage(testPath);
}

runLevel1().catch(console.error);
