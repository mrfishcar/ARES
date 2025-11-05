/**
 * Test Ladder - Level 1: Simple Sentences
 *
 * Tests basic extraction on clear, unambiguous sentences.
 * Goal: Prove core patterns work before adding complexity.
 *
 * Target: P≥0.90, R≥0.85, F1≥0.87
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
  qualifiers?: {
    time?: string;
    place?: string;
  };
}

interface TestCase {
  id: string;
  text: string;
  gold: {
    entities: GoldEntity[];
    relations: GoldRelation[];
  };
}

// Level 1 Test Suite: 20 simple sentences
const testCases: TestCase[] = [
  // Family relations
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
  },

  // Travel/location
  {
    id: '1.4',
    text: 'Gandalf traveled to Rivendell.',
    gold: {
      entities: [
        { text: 'Gandalf', type: 'PERSON' },
        { text: 'Rivendell', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Gandalf', pred: 'traveled_to', obj: 'Rivendell' }
      ]
    }
  },
  {
    id: '1.5',
    text: 'Bilbo lived in the Shire.',
    gold: {
      entities: [
        { text: 'Bilbo', type: 'PERSON' },
        { text: 'Shire', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Bilbo', pred: 'lives_in', obj: 'Shire' }
      ]
    }
  },
  {
    id: '1.6',
    text: 'Hermione went to Hogwarts.',
    gold: {
      entities: [
        { text: 'Hermione', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' }
      ],
      relations: [
        { subj: 'Hermione', pred: 'traveled_to', obj: 'Hogwarts' }
      ]
    }
  },

  // Organizational relations
  {
    id: '1.7',
    text: 'Dumbledore teaches at Hogwarts.',
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
    id: '1.8',
    text: 'Ron studies at Hogwarts.',
    gold: {
      entities: [
        { text: 'Ron', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' }
      ],
      relations: [
        { subj: 'Ron', pred: 'studies_at', obj: 'Hogwarts' }
      ]
    }
  },

  // Leadership/governance
  {
    id: '1.9',
    text: 'Aragorn became king of Gondor.',
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
    id: '1.10',
    text: 'Theoden ruled Rohan.',
    gold: {
      entities: [
        { text: 'Theoden', type: 'PERSON' },
        { text: 'Rohan', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Theoden', pred: 'rules', obj: 'Rohan' }
      ]
    }
  },

  // Social relations
  {
    id: '1.11',
    text: 'Legolas was friends with Gimli.',
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
    id: '1.12',
    text: 'Frodo fought against Gollum.',
    gold: {
      entities: [
        { text: 'Frodo', type: 'PERSON' },
        { text: 'Gollum', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Frodo', pred: 'enemy_of', obj: 'Gollum' },
        { subj: 'Gollum', pred: 'enemy_of', obj: 'Frodo' }
      ]
    }
  },

  // Temporal qualifiers
  {
    id: '1.13',
    text: 'Aragorn married Arwen in 3019.',
    gold: {
      entities: [
        { text: 'Aragorn', type: 'PERSON' },
        { text: 'Arwen', type: 'PERSON' },
        { text: '3019', type: 'DATE' }
      ],
      relations: [
        { subj: 'Aragorn', pred: 'married_to', obj: 'Arwen', qualifiers: { time: '3019' } },
        { subj: 'Arwen', pred: 'married_to', obj: 'Aragorn', qualifiers: { time: '3019' } }
      ]
    }
  },
  {
    id: '1.14',
    text: 'Gandalf traveled to Minas Tirith in 3019.',
    gold: {
      entities: [
        { text: 'Gandalf', type: 'PERSON' },
        { text: 'Minas Tirith', type: 'PLACE' },
        { text: '3019', type: 'DATE' }
      ],
      relations: [
        { subj: 'Gandalf', pred: 'traveled_to', obj: 'Minas Tirith', qualifiers: { time: '3019' } }
      ]
    }
  },

  // Multi-word entities
  {
    id: '1.15',
    text: 'Harry Potter attended Hogwarts School.',
    gold: {
      entities: [
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Hogwarts School', type: 'ORG' }
      ],
      relations: [
        { subj: 'Harry Potter', pred: 'attended', obj: 'Hogwarts School' }
      ]
    }
  },
  {
    id: '1.16',
    text: 'Frodo Baggins lived in Bag End.',
    gold: {
      entities: [
        { text: 'Frodo Baggins', type: 'PERSON' },
        { text: 'Bag End', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Frodo Baggins', pred: 'lives_in', obj: 'Bag End' }
      ]
    }
  },

  // Additional coverage
  {
    id: '1.17',
    text: 'Sam traveled to Mordor.',
    gold: {
      entities: [
        { text: 'Sam', type: 'PERSON' },
        { text: 'Mordor', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Sam', pred: 'traveled_to', obj: 'Mordor' }
      ]
    }
  },
  {
    id: '1.18',
    text: 'Boromir is the son of Denethor.',
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
    id: '1.19',
    text: 'Eowyn fought in the Battle of Pelennor Fields.',
    gold: {
      entities: [
        { text: 'Eowyn', type: 'PERSON' },
        { text: 'Battle of Pelennor Fields', type: 'EVENT' }
      ],
      relations: [
        { subj: 'Eowyn', pred: 'fought_in', obj: 'Battle of Pelennor Fields' }
      ]
    }
  },
  {
    id: '1.20',
    text: 'Elrond dwelt in Rivendell.',
    gold: {
      entities: [
        { text: 'Elrond', type: 'PERSON' },
        { text: 'Rivendell', type: 'PLACE' }
      ],
      relations: [
        { subj: 'Elrond', pred: 'lives_in', obj: 'Rivendell' }
      ]
    }
  }
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

describe('Test Ladder - Level 1: Simple Sentences', () => {
  const testPath = path.join(process.cwd(), 'test-ladder-1.json');

  it('should pass all 20 simple sentence tests', async () => {
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

      // Build gold sets
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
      if (entityP < 0.90 || entityR < 0.85 || relationP < 0.90 || relationR < 0.85) {
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

    console.log('\n📊 LEVEL 1 RESULTS:');
    console.log(`\nEntities:`);
    console.log(`  Precision: ${(avgEntityP * 100).toFixed(1)}% (target: ≥90%)`);
    console.log(`  Recall: ${(avgEntityR * 100).toFixed(1)}% (target: ≥85%)`);
    console.log(`  F1: ${(entityF1 * 100).toFixed(1)}% (target: ≥87%)`);

    console.log(`\nRelations:`);
    console.log(`  Precision: ${(avgRelationP * 100).toFixed(1)}% (target: ≥90%)`);
    console.log(`  Recall: ${(avgRelationR * 100).toFixed(1)}% (target: ≥85%)`);
    console.log(`  F1: ${(relationF1 * 100).toFixed(1)}% (target: ≥87%)`);

    // Assert thresholds
    expect(avgEntityP).toBeGreaterThanOrEqual(0.90);
    expect(avgEntityR).toBeGreaterThanOrEqual(0.85);
    expect(entityF1).toBeGreaterThanOrEqual(0.87);

    expect(avgRelationP).toBeGreaterThanOrEqual(0.90);
    expect(avgRelationR).toBeGreaterThanOrEqual(0.85);
    expect(relationF1).toBeGreaterThanOrEqual(0.87);

    console.log('\n🎉 LEVEL 1 PASSED! Unlock Level 2.\n');

    // Cleanup
    clearStorage(testPath);
  });
});
