/**
 * Test Ladder - Level 2: Multi-Sentence Narratives
 *
 * Tests entity/relation extraction across multiple sentences with:
 * - Pronoun resolution (he/she/they)
 * - Title back-links ("the wizard")
 * - Coordination ("X and Y")
 *
 * Goal: Prove coreference resolution works end-to-end with storage
 *
 * Target: P≥0.85, R≥0.80, F1≥0.82
 */

import { describe, it, expect } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import * as path from 'path';

// Gold standard: hand-labeled correct extractions
interface GoldEntity {
  text: string;
  type: 'PERSON' | 'PLACE' | 'ORG' | 'DATE' | 'HOUSE' | 'ITEM' | 'WORK' | 'EVENT';
}

interface GoldRelation {
  subj: string;    // canonical name
  pred: string;    // predicate
  obj: string;     // canonical name
}

interface TestCase {
  id: string;
  text: string;
  gold: {
    entities: GoldEntity[];
    relations: GoldRelation[];
  };
}

// Level 2 Test Suite: 15 multi-sentence narratives
const testCases: TestCase[] = [
  // Pronoun resolution - basic
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

  // Gender-aware pronoun resolution
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

  // Multi-entity pronoun resolution
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

  // Coordination (X and Y)
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

  // Title back-links
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

  // Family relations with pronouns
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

  // Three-sentence narratives
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

  // Complex coreference chain
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

// Scoring functions
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

function computeF1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

describe('Test Ladder - Level 2: Multi-Sentence Narratives', () => {
  const testPath = path.join(process.cwd(), 'test-ladder-2.json');

  it('should pass all 15 multi-sentence narrative tests', async () => {
    const results: Array<{
      id: string;
      entityPrecision: number;
      entityRecall: number;
      relationPrecision: number;
      relationRecall: number;
    }> = [];

    for (const tc of testCases) {
      clearStorage(testPath);

      // Extract
      await appendDoc(tc.id, tc.text, testPath);
      const graph = loadGraph(testPath);

      expect(graph).not.toBeNull();

      // Build gold sets (entities: type::name, relations: subj::pred::obj)
      const goldEntities = new Set(tc.gold.entities.map(e => `${e.type}::${e.text.toLowerCase()}`));
      const goldRelations = new Set(tc.gold.relations.map(r => `${r.subj.toLowerCase()}::${r.pred}::${r.obj.toLowerCase()}`));

      // Build extracted sets
      const extractedEntities = new Set(
        graph!.entities.map(e => `${e.type}::${e.canonical.toLowerCase()}`)
      );

      const extractedRelations = new Set(
        graph!.relations.map(r => {
          const subj = graph!.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '';
          const obj = graph!.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '';
          return `${subj}::${r.pred}::${obj}`;
        })
      );

      // Compute metrics
      const entityP = computePrecision(extractedEntities, goldEntities);
      const entityR = computeRecall(extractedEntities, goldEntities);
      const relationP = computePrecision(extractedRelations, goldRelations);
      const relationR = computeRecall(extractedRelations, goldRelations);

      results.push({
        id: tc.id,
        entityPrecision: entityP,
        entityRecall: entityR,
        relationPrecision: relationP,
        relationRecall: relationR
      });

      // Log failures
      if (entityP < 0.85 || entityR < 0.80 || relationP < 0.85 || relationR < 0.80) {
        console.log(`\n❌ Test ${tc.id} failed:`);
        console.log(`   Text: "${tc.text}"`);
        console.log(`   Entity P/R: ${(entityP * 100).toFixed(1)}% / ${(entityR * 100).toFixed(1)}%`);
        console.log(`   Relation P/R: ${(relationP * 100).toFixed(1)}% / ${(relationR * 100).toFixed(1)}%`);
        console.log(`   Gold entities: ${Array.from(goldEntities).join(', ')}`);
        console.log(`   Extracted entities: ${Array.from(extractedEntities).join(', ')}`);
        console.log(`   Gold relations: ${Array.from(goldRelations).join(', ')}`);
        console.log(`   Extracted relations: ${Array.from(extractedRelations).join(', ')}`);
      }
    }

    // Aggregate metrics
    const avgEntityP = results.reduce((sum, r) => sum + r.entityPrecision, 0) / results.length;
    const avgEntityR = results.reduce((sum, r) => sum + r.entityRecall, 0) / results.length;
    const avgRelationP = results.reduce((sum, r) => sum + r.relationPrecision, 0) / results.length;
    const avgRelationR = results.reduce((sum, r) => sum + r.relationRecall, 0) / results.length;

    const entityF1 = computeF1(avgEntityP, avgEntityR);
    const relationF1 = computeF1(avgRelationP, avgRelationR);

    console.log('\n📊 LEVEL 2 RESULTS:');
    console.log(`\nEntities:`);
    console.log(`  Precision: ${(avgEntityP * 100).toFixed(1)}% (target: ≥85%)`);
    console.log(`  Recall: ${(avgEntityR * 100).toFixed(1)}% (target: ≥80%)`);
    console.log(`  F1: ${(entityF1 * 100).toFixed(1)}% (target: ≥82%)`);

    console.log(`\nRelations:`);
    console.log(`  Precision: ${(avgRelationP * 100).toFixed(1)}% (target: ≥85%)`);
    console.log(`  Recall: ${(avgRelationR * 100).toFixed(1)}% (target: ≥80%)`);
    console.log(`  F1: ${(relationF1 * 100).toFixed(1)}% (target: ≥82%)`);

    // Assert thresholds
    expect(avgEntityP).toBeGreaterThanOrEqual(0.85);
    expect(avgEntityR).toBeGreaterThanOrEqual(0.80);
    expect(entityF1).toBeGreaterThanOrEqual(0.82);

    expect(avgRelationP).toBeGreaterThanOrEqual(0.85);
    expect(avgRelationR).toBeGreaterThanOrEqual(0.80);
    expect(relationF1).toBeGreaterThanOrEqual(0.82);

    console.log('\n🎉 LEVEL 2 PASSED! Unlock Level 3.\n');

    // Cleanup
    clearStorage(testPath);
  });
});
