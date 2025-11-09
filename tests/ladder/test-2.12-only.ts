/**
 * Test only case 2.12 to verify pronoun resolution fix
 */

import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import * as path from 'path';

async function test212() {
  const testPath = path.join(process.cwd(), 'test-2.12-debug.json');

  const tc = {
    id: '2.12',
    text: 'Aragorn, son of Arathorn, traveled to Gondor. He became king there.',
    gold: {
      entities: [
        { text: 'Aragorn', type: 'PERSON' },
        { text: 'Arathorn', type: 'PERSON' },
        { text: 'Gondor', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Aragorn', pred: 'child_of', obj: 'Arathorn' },
        { subj: 'Arathorn', pred: 'parent_of', obj: 'Aragorn' },
        { subj: 'Aragorn', pred: 'traveled_to', obj: 'Gondor' },
        { subj: 'Aragorn', pred: 'rules', obj: 'Gondor' }
      ]
    }
  };

  clearStorage(testPath);

  await appendDoc(tc.id, tc.text, testPath);
  const graph = loadGraph(testPath)!;

  console.log(`\nTest ${tc.id}: "${tc.text}"\n`);

  // Show extracted relations
  const extractedRelations = graph.relations.map(r => {
    const subj = graph.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '';
    const obj = graph.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '';
    return `${subj}::${r.pred}::${obj}`;
  });

  console.log('Gold relations:');
  tc.gold.relations.forEach(r => console.log(`  - ${r.subj}::${r.pred}::${r.obj}`));

  console.log('\nExtracted relations:');
  extractedRelations.forEach(r => console.log(`  - ${r}`));

  // Check for the false positive
  const hasFalsePositive = extractedRelations.includes('arathorn::traveled_to::gondor');
  const hasCorrectRelation = extractedRelations.includes('aragorn::traveled_to::gondor');

  console.log('\nResults:');
  console.log(`  False positive (arathorn::traveled_to::gondor): ${hasFalsePositive ? '❌ STILL PRESENT' : '✅ FIXED'}`);
  console.log(`  Correct relation (aragorn::traveled_to::gondor): ${hasCorrectRelation ? '✅ PRESENT' : '❌ MISSING'}`);

  clearStorage(testPath);
}

test212().catch(console.error);
