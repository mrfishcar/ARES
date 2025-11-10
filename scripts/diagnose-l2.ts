/**
 * Diagnostic script for Level 2 (Multi-Sentence) test failures
 *
 * Identifies:
 * - Missing relations (low recall)
 * - False positive relations (low precision)
 * - Pattern gaps
 */

import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';
import { writeFileSync } from 'fs';

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

const testCases: TestCase[] = [
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

async function diagnose() {
  const testPath = path.join(process.cwd(), 'test-ladder-2-debug.json');

  const results: any[] = [];
  const failures: any[] = [];

  console.log('🔍 LEVEL 2 DIAGNOSTIC REPORT\n');
  console.log('=' . repeat(80));

  for (const tc of testCases) {
    clearStorage(testPath);

    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath);

    if (!graph) {
      console.log(`❌ Test ${tc.id}: Failed to load graph`);
      continue;
    }

    // Build gold sets
    const goldEntities = new Set(tc.gold.entities.map(e => `${e.type}::${e.text.toLowerCase()}`));
    const goldRelations = new Set(tc.gold.relations.map(r => `${r.subj.toLowerCase()}::${r.pred}::${r.obj.toLowerCase()}`));

    // Build extracted sets
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

    // Compute metrics
    const entityP = computePrecision(extractedEntities, goldEntities);
    const entityR = computeRecall(extractedEntities, goldEntities);
    const relationP = computePrecision(extractedRelations, goldRelations);
    const relationR = computeRecall(extractedRelations, goldRelations);

    const missing = Array.from(goldRelations).filter(r => !extractedRelations.has(r));
    const extra = Array.from(extractedRelations).filter(r => !goldRelations.has(r));

    const result = {
      id: tc.id,
      text: tc.text,
      entityP: (entityP * 100).toFixed(1),
      entityR: (entityR * 100).toFixed(1),
      relationP: (relationP * 100).toFixed(1),
      relationR: (relationR * 100).toFixed(1),
      missing,
      extra,
      goldRelations: Array.from(goldRelations),
      extractedRelations: Array.from(extractedRelations)
    };

    results.push(result);

    // Check if failed
    const failed = relationP < 0.85 || relationR < 0.80;

    if (failed) {
      failures.push(result);
      console.log(`\n❌ Test ${tc.id} FAILED`);
    } else {
      console.log(`\n✅ Test ${tc.id} PASSED`);
    }

    console.log(`   Text: "${tc.text}"`);
    console.log(`   Relation P/R: ${result.relationP}% / ${result.relationR}%`);

    if (missing.length > 0) {
      console.log(`   Missing (${missing.length}): ${missing.join(', ')}`);
    }

    if (extra.length > 0) {
      console.log(`   Extra (${extra.length}): ${extra.join(', ')}`);
    }
  }

  // Aggregate metrics
  const avgRelationP = results.reduce((sum, r) => sum + parseFloat(r.relationP), 0) / results.length;
  const avgRelationR = results.reduce((sum, r) => sum + parseFloat(r.relationR), 0) / results.length;

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 AGGREGATE METRICS:');
  console.log(`   Average Relation Precision: ${avgRelationP.toFixed(1)}% (target: ≥85%)`);
  console.log(`   Average Relation Recall: ${avgRelationR.toFixed(1)}% (target: ≥80%)`);
  console.log(`   Gap to target: ${(85 - avgRelationP).toFixed(1)}%`);

  console.log(`\n🔴 FAILURES: ${failures.length}/${testCases.length}`);

  // Pattern analysis
  console.log('\n' + '='.repeat(80));
  console.log('\n🔬 PATTERN ANALYSIS:');

  const missingPatterns: Record<string, number> = {};
  const extraPatterns: Record<string, number> = {};

  failures.forEach(f => {
    f.missing.forEach((m: string) => {
      const pred = m.split('::')[1];
      missingPatterns[pred] = (missingPatterns[pred] || 0) + 1;
    });

    f.extra.forEach((e: string) => {
      const pred = e.split('::')[1];
      extraPatterns[pred] = (extraPatterns[pred] || 0) + 1;
    });
  });

  console.log('\nMissing Relations (by predicate):');
  Object.entries(missingPatterns)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pred, count]) => {
      console.log(`   ${pred}: ${count} instances`);
    });

  console.log('\nExtra Relations (by predicate):');
  Object.entries(extraPatterns)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pred, count]) => {
      console.log(`   ${pred}: ${count} instances`);
    });

  // Write detailed results to file
  writeFileSync(
    'tmp/l2-diagnostic.json',
    JSON.stringify({ results, failures, missingPatterns, extraPatterns }, null, 2),
    'utf-8'
  );

  console.log('\n📄 Detailed results written to: tmp/l2-diagnostic.json');

  clearStorage(testPath);
}

diagnose().catch(console.error);
