/**
 * Run Level 2 and show detailed results with precision/recall failures
 */

import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import * as path from 'path';

// Same test cases from level-2-multisentence.spec.ts
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
  },
  {
    id: '2.4',
    text: 'Aragorn married Arwen. He loved her deeply.',
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
  },
  {
    id: '2.5',
    text: 'Ginny studied at Hogwarts. She married Harry.',
    gold: {
      entities: [
        { text: 'Ginny', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Harry', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Ginny', pred: 'studies_at', obj: 'Hogwarts' },
        { subj: 'Ginny', pred: 'married_to', obj: 'Harry' },
        { subj: 'Harry', pred: 'married_to', obj: 'Ginny' }
      ]
    }
  },
  {
    id: '2.6',
    text: 'Gandalf traveled to Rivendell. Elrond lived there. He welcomed Gandalf.',
    gold: {
      entities: [
        { text: 'Gandalf', type: 'PERSON' },
        { text: 'Rivendell', type: 'PLACE' },
        { text: 'Elrond', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Gandalf', pred: 'traveled_to', obj: 'Rivendell' },
        { subj: 'Elrond', pred: 'lives_in', obj: 'Rivendell' }
      ]
    }
  },
  {
    id: '2.7',
    text: 'Harry and Ron studied at Hogwarts.',
    gold: {
      entities: [
        { text: 'Harry', type: 'PERSON' },
        { text: 'Ron', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' }
      ],
      relations: [
        { subj: 'Harry', pred: 'studies_at', obj: 'Hogwarts' },
        { subj: 'Ron', pred: 'studies_at', obj: 'Hogwarts' }
      ]
    }
  },
  {
    id: '2.8',
    text: 'Frodo and Sam traveled to Mordor.',
    gold: {
      entities: [
        { text: 'Frodo', type: 'PERSON' },
        { text: 'Sam', type: 'PERSON' },
        { text: 'Mordor', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Frodo', pred: 'traveled_to', obj: 'Mordor' },
        { subj: 'Sam', pred: 'traveled_to', obj: 'Mordor' }
      ]
    }
  },
  {
    id: '2.9',
    text: 'Aragorn became king of Gondor. The king ruled wisely.',
    gold: {
      entities: [
        { text: 'Aragorn', type: 'PERSON' },
        { text: 'Gondor', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Aragorn', pred: 'rules', obj: 'Gondor' }
      ]
    }
  },
  {
    id: '2.10',
    text: 'Dumbledore is a wizard. The wizard teaches at Hogwarts.',
    gold: {
      entities: [
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' }
      ],
      relations: [
        { subj: 'Dumbledore', pred: 'teaches_at', obj: 'Hogwarts' }
      ]
    }
  },
  {
    id: '2.11',
    text: 'Boromir is the son of Denethor. He was a brave warrior.',
    gold: {
      entities: [
        { text: 'Boromir', type: 'PERSON' },
        { text: 'Denethor', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Boromir', pred: 'child_of', obj: 'Denethor' },
        { subj: 'Denethor', pred: 'parent_of', obj: 'Boromir' }
      ]
    }
  },
  {
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
  },
  {
    id: '2.13',
    text: 'Legolas was an elf. He was friends with Gimli. They traveled together.',
    gold: {
      entities: [
        { text: 'Legolas', type: 'PERSON' },
        { text: 'Gimli', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Legolas', pred: 'friends_with', obj: 'Gimli' },
        { subj: 'Gimli', pred: 'friends_with', obj: 'Legolas' }
      ]
    }
  },
  {
    id: '2.14',
    text: 'Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan.',
    gold: {
      entities: [
        { text: 'Theoden', type: 'PERSON' },
        { text: 'Rohan', type: 'PLACE' },
        { text: 'Eowyn', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Theoden', pred: 'rules', obj: 'Rohan' },
        { subj: 'Eowyn', pred: 'lives_in', obj: 'Rohan' }
      ]
    }
  },
  {
    id: '2.15',
    text: 'Elrond dwelt in Rivendell. The elf lord welcomed travelers. He was wise and ancient.',
    gold: {
      entities: [
        { text: 'Elrond', type: 'PERSON' },
        { text: 'Rivendell', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Elrond', pred: 'lives_in', obj: 'Rivendell' }
      ]
    }
  },
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

async function runLevel2() {
  const testPath = path.join(process.cwd(), 'test-ladder-2-debug.json');

  console.log('\n🎯 LEVEL 2: Multi-Sentence Narratives\n');

  const results: Array<{ id: string; relationP: number; relationR: number }> = [];

  for (const tc of testCases) {
    clearStorage(testPath);

    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath)!;

    // Build gold sets
    const goldRelations = new Set(tc.gold.relations.map(r =>
      `${r.subj.toLowerCase()}::${r.pred}::${r.obj.toLowerCase()}`
    ));

    // Build extracted sets
    const extractedRelations = new Set(
      graph.relations.map(r => {
        const subj = graph.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '';
        const obj = graph.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '';
        return `${subj}::${r.pred}::${obj}`;
      })
    );

    const relationP = computePrecision(extractedRelations, goldRelations);
    const relationR = computeRecall(extractedRelations, goldRelations);

    results.push({ id: tc.id, relationP, relationR });

    // Show test case
    console.log(`Test ${tc.id}: "${tc.text}"`);
    console.log(`  Relation P/R: ${(relationP * 100).toFixed(1)}% / ${(relationR * 100).toFixed(1)}%`);
    console.log(`  Gold relations: ${Array.from(goldRelations).join(', ')}`);
    console.log(`  Extracted: ${Array.from(extractedRelations).join(', ')}`);

    // Show false positives (precision issues)
    const falsePositives = Array.from(extractedRelations).filter(e => !goldRelations.has(e));
    if (falsePositives.length > 0) {
      console.log(`  ❌ FALSE POSITIVES: ${falsePositives.join(', ')}`);
    }

    // Show false negatives (recall issues)
    const falseNegatives = Array.from(goldRelations).filter(g => !extractedRelations.has(g));
    if (falseNegatives.length > 0) {
      console.log(`  ❌ FALSE NEGATIVES: ${falseNegatives.join(', ')}`);
    }

    console.log();
  }

  // Aggregate metrics
  const avgRelationP = results.reduce((sum, r) => sum + r.relationP, 0) / results.length;
  const avgRelationR = results.reduce((sum, r) => sum + r.relationR, 0) / results.length;

  console.log('\n📊 LEVEL 2 AGGREGATE RESULTS:');
  console.log(`  Relation Precision: ${(avgRelationP * 100).toFixed(1)}% (target: ≥85.0%)`);
  console.log(`  Relation Recall: ${(avgRelationR * 100).toFixed(1)}% (target: ≥80.0%)`);
  console.log(`  Gap to target: ${((0.85 - avgRelationP) * 100).toFixed(1)}%\n`);

  clearStorage(testPath);
}

runLevel2().catch(console.error);
