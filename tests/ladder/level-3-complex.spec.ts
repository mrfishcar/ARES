/**
 * Test Ladder - Level 3: Complex Multi-Paragraph Narratives
 *
 * Tests advanced extraction on Harry Potter-style complex scenarios:
 * - Multi-paragraph narratives with complex coreference chains
 * - Family relationships (Weasley family, Potter family)
 * - Organizational memberships (Houses, groups)
 * - Temporal sequences and events
 * - Long-distance pronoun resolution
 *
 * Goal: Prove system can handle book-length narrative complexity
 *
 * Target: P≥0.80, R≥0.75, F1≥0.77
 */

import { describe, it, expect } from 'vitest';
import { appendDoc, loadGraph, clearStorage } from '../../app/storage/storage';
import * as path from 'path';

// Gold standard
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

// Level 3 Test Suite: Complex narratives
const testCases: TestCase[] = [
  // Complex family narrative with multiple generations
  {
    id: '3.1',
    text: `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

    Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`,
    gold: {
      entities: [
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'James', type: 'PERSON' },
        { text: 'Lily Potter', type: 'PERSON' },
        { text: 'Dursleys', type: 'PERSON' },
        { text: 'Privet Drive', type: 'PLACE' },
        { text: 'Ron Weasley', type: 'PERSON' },
        { text: 'Arthur', type: 'PERSON' },
        { text: 'Ministry of Magic', type: 'ORG' }
      ],
      relations: [
        { subj: 'Harry Potter', pred: 'child_of', obj: 'James' },
        { subj: 'James', pred: 'parent_of', obj: 'Harry Potter' },
        { subj: 'Harry Potter', pred: 'child_of', obj: 'Lily Potter' },
        { subj: 'Lily Potter', pred: 'parent_of', obj: 'Harry Potter' },
        { subj: 'Harry Potter', pred: 'lives_in', obj: 'Privet Drive' },
        { subj: 'Harry Potter', pred: 'friends_with', obj: 'Ron Weasley' },
        { subj: 'Ron Weasley', pred: 'friends_with', obj: 'Harry Potter' },
        { subj: 'Ron Weasley', pred: 'child_of', obj: 'Arthur' },
        { subj: 'Arthur', pred: 'parent_of', obj: 'Ron Weasley' }
      ]
    }
  },

  // Organizational membership with multiple entities
  {
    id: '3.2',
    text: `Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor.

    Draco Malfoy, on the other hand, joined Slytherin. He became a rival to Harry.`,
    gold: {
      entities: [
        { text: 'Hermione Granger', type: 'PERSON' },
        { text: 'Gryffindor', type: 'ORG' },
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Ron Weasley', type: 'PERSON' },
        { text: 'Draco Malfoy', type: 'PERSON' },
        { text: 'Slytherin', type: 'ORG' }
      ],
      relations: [
        { subj: 'Hermione Granger', pred: 'member_of', obj: 'Gryffindor' },
        { subj: 'Harry Potter', pred: 'member_of', obj: 'Gryffindor' },
        { subj: 'Ron Weasley', pred: 'member_of', obj: 'Gryffindor' },
        { subj: 'Draco Malfoy', pred: 'member_of', obj: 'Slytherin' },
        { subj: 'Draco Malfoy', pred: 'enemy_of', obj: 'Harry Potter' },
        { subj: 'Harry Potter', pred: 'enemy_of', obj: 'Draco Malfoy' }
      ]
    }
  },

  // Complex coreference with title references
  {
    id: '3.3',
    text: `Albus Dumbledore was the headmaster of Hogwarts. The wise wizard had a phoenix named Fawkes.

    He trusted Severus Snape completely. The headmaster believed Snape was loyal to the Order.`,
    gold: {
      entities: [
        { text: 'Albus Dumbledore', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Fawkes', type: 'PERSON' },
        { text: 'Severus Snape', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Albus Dumbledore', pred: 'leads', obj: 'Hogwarts' }
      ]
    }
  },

  // Event sequence with temporal progression
  {
    id: '3.4',
    text: `In 1991, Harry Potter started at Hogwarts School. He quickly became friends with Ron and Hermione.

    During his first year, Harry faced Voldemort in the chamber. The young wizard survived the encounter.`,
    gold: {
      entities: [
        { text: '1991', type: 'DATE' },
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Hogwarts School', type: 'ORG' },
        { text: 'Ron', type: 'PERSON' },
        { text: 'Hermione', type: 'PERSON' },
        { text: 'Voldemort', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Harry Potter', pred: 'studies_at', obj: 'Hogwarts School' },
        { subj: 'Harry Potter', pred: 'friends_with', obj: 'Ron' },
        { subj: 'Ron', pred: 'friends_with', obj: 'Harry Potter' },
        { subj: 'Harry Potter', pred: 'friends_with', obj: 'Hermione' },
        { subj: 'Hermione', pred: 'friends_with', obj: 'Harry Potter' },
        { subj: 'Harry Potter', pred: 'enemy_of', obj: 'Voldemort' },
        { subj: 'Voldemort', pred: 'enemy_of', obj: 'Harry Potter' }
      ]
    }
  },

  // Multi-entity interaction with possessives
  {
    id: '3.5',
    text: `The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George.

    Bill Weasley, the eldest son, worked for Gringotts Bank.`,
    gold: {
      entities: [
        { text: 'Burrow', type: 'PLACE' },
        { text: 'Molly Weasley', type: 'PERSON' },
        { text: 'Arthur', type: 'PERSON' },
        { text: 'Ron', type: 'PERSON' },
        { text: 'Ginny', type: 'PERSON' },
        { text: 'Fred', type: 'PERSON' },
        { text: 'George', type: 'PERSON' },
        { text: 'Bill Weasley', type: 'PERSON' },
        { text: 'Gringotts Bank', type: 'ORG' }
      ],
      relations: [
        { subj: 'Molly Weasley', pred: 'lives_in', obj: 'Burrow' },
        { subj: 'Arthur', pred: 'lives_in', obj: 'Burrow' },
        { subj: 'Molly Weasley', pred: 'married_to', obj: 'Arthur' },
        { subj: 'Arthur', pred: 'married_to', obj: 'Molly Weasley' },
        { subj: 'Ron', pred: 'child_of', obj: 'Molly Weasley' },
        { subj: 'Ron', pred: 'child_of', obj: 'Arthur' },
        { subj: 'Ginny', pred: 'child_of', obj: 'Molly Weasley' },
        { subj: 'Ginny', pred: 'child_of', obj: 'Arthur' }
      ]
    }
  },

  // Long-distance coreference with multiple referents
  {
    id: '3.6',
    text: `Luna Lovegood was a unique student at Hogwarts. She was sorted into Ravenclaw House.

    The eccentric girl became close friends with Ginny Weasley. Luna believed in many unusual creatures.

    Her father published The Quibbler, a magazine about mysterious phenomena.`,
    gold: {
      entities: [
        { text: 'Luna Lovegood', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Ravenclaw', type: 'ORG' },
        { text: 'Ginny Weasley', type: 'PERSON' },
        { text: 'Quibbler', type: 'WORK' }
      ],
      relations: [
        { subj: 'Luna Lovegood', pred: 'studies_at', obj: 'Hogwarts' },
        { subj: 'Luna Lovegood', pred: 'member_of', obj: 'Ravenclaw' },
        { subj: 'Luna Lovegood', pred: 'friends_with', obj: 'Ginny Weasley' },
        { subj: 'Ginny Weasley', pred: 'friends_with', obj: 'Luna Lovegood' }
      ]
    }
  },

  // Coordination with complex subject
  {
    id: '3.7',
    text: `Harry, Ron, and Hermione formed a powerful trio. They fought together against the Death Eaters.

    The three friends traveled to many dangerous places during their quest.`,
    gold: {
      entities: [
        { text: 'Harry', type: 'PERSON' },
        { text: 'Ron', type: 'PERSON' },
        { text: 'Hermione', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Harry', pred: 'friends_with', obj: 'Ron' },
        { subj: 'Ron', pred: 'friends_with', obj: 'Harry' },
        { subj: 'Harry', pred: 'friends_with', obj: 'Hermione' },
        { subj: 'Hermione', pred: 'friends_with', obj: 'Harry' },
        { subj: 'Ron', pred: 'friends_with', obj: 'Hermione' },
        { subj: 'Hermione', pred: 'friends_with', obj: 'Ron' }
      ]
    }
  },

  // Marriage and family formation
  {
    id: '3.8',
    text: `After the war, Harry Potter married Ginny Weasley. They had three children together.

    Ron Weasley married Hermione Granger. The couple had two children.`,
    gold: {
      entities: [
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Ginny Weasley', type: 'PERSON' },
        { text: 'Ron Weasley', type: 'PERSON' },
        { text: 'Hermione Granger', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Harry Potter', pred: 'married_to', obj: 'Ginny Weasley' },
        { subj: 'Ginny Weasley', pred: 'married_to', obj: 'Harry Potter' },
        { subj: 'Ron Weasley', pred: 'married_to', obj: 'Hermione Granger' },
        { subj: 'Hermione Granger', pred: 'married_to', obj: 'Ron Weasley' }
      ]
    }
  },

  // Teaching relationships
  {
    id: '3.9',
    text: `Professor McGonagall taught Transfiguration at Hogwarts. She was also the head of Gryffindor House.

    Professor Snape taught Potions. The stern professor later became headmaster.`,
    gold: {
      entities: [
        { text: 'Professor McGonagall', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Gryffindor', type: 'ORG' },
        { text: 'Professor Snape', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Professor McGonagall', pred: 'teaches_at', obj: 'Hogwarts' },
        { subj: 'Professor McGonagall', pred: 'leads', obj: 'Gryffindor' },
        { subj: 'Professor Snape', pred: 'teaches_at', obj: 'Hogwarts' },
        { subj: 'Professor Snape', pred: 'leads', obj: 'Hogwarts' }
      ]
    }
  },

  // Complex multi-entity narrative with locations
  {
    id: '3.10',
    text: `Hogwarts School was located in Scotland. Students traveled there via the Hogwarts Express from Platform 9¾.

    The castle had four houses: Gryffindor, Slytherin, Hufflepuff, and Ravenclaw. Each house had its own common room.`,
    gold: {
      entities: [
        { text: 'Hogwarts School', type: 'ORG' },
        { text: 'Scotland', type: 'PLACE' },
        { text: 'Hogwarts Express', type: 'ITEM' },
        { text: 'Gryffindor', type: 'ORG' },
        { text: 'Slytherin', type: 'ORG' },
        { text: 'Hufflepuff', type: 'ORG' },
        { text: 'Ravenclaw', type: 'ORG' }
      ],
      relations: [
        { subj: 'Gryffindor', pred: 'part_of', obj: 'Hogwarts School' },
        { subj: 'Slytherin', pred: 'part_of', obj: 'Hogwarts School' },
        { subj: 'Hufflepuff', pred: 'part_of', obj: 'Hogwarts School' },
        { subj: 'Ravenclaw', pred: 'part_of', obj: 'Hogwarts School' }
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

describe('Test Ladder - Level 3: Complex Multi-Paragraph Narratives', () => {
  const testPath = path.join(process.cwd(), 'test-ladder-3.json');

  it('should pass complex Harry Potter narrative tests', async () => {
    const caseDetails: Array<{
      id: string;
      extracted: string[];
      gold: string[];
    }> = [];

    const results: Array<{
      id: string;
      entityPrecision: number;
      entityRecall: number;
      relationPrecision: number;
      relationRecall: number;
    }> = [];

    for (const tc of testCases) {
      clearStorage(testPath);

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

      caseDetails.push({
        id: tc.id,
        extracted: Array.from(extractedEntities),
        gold: Array.from(goldEntities)
      });

      // Log failures
      if (entityP < 0.80 || entityR < 0.75 || relationP < 0.80 || relationR < 0.75) {
        console.log(`\n❌ Test ${tc.id} failed:`);
        console.log(`   Entity P/R: ${(entityP * 100).toFixed(1)}% / ${(entityR * 100).toFixed(1)}%`);
        console.log(`   Relation P/R: ${(relationP * 100).toFixed(1)}% / ${(relationR * 100).toFixed(1)}%`);
        console.log(`   Gold entities: ${Array.from(goldEntities).slice(0, 5).join(', ')}...`);
        console.log(`   Extracted entities: ${Array.from(extractedEntities).slice(0, 5).join(', ')}...`);
        console.log(`   Missing relations: ${Array.from(goldRelations).filter(r => !extractedRelations.has(r)).slice(0, 3).join(', ')}`);
      }
    }

    // Aggregate metrics
    const avgEntityP = results.reduce((sum, r) => sum + r.entityPrecision, 0) / results.length;
    const avgEntityR = results.reduce((sum, r) => sum + r.entityRecall, 0) / results.length;
    const avgRelationP = results.reduce((sum, r) => sum + r.relationPrecision, 0) / results.length;
    const avgRelationR = results.reduce((sum, r) => sum + r.relationRecall, 0) / results.length;

    const entityF1 = computeF1(avgEntityP, avgEntityR);
    const relationF1 = computeF1(avgRelationP, avgRelationR);

    if (process.env.L3_DEBUG === '1') {
      const { writeFileSync } = await import('fs');
      const detail = caseDetails.map(detail => {
        const goldSet = new Set(detail.gold);
        const extractedSet = new Set(detail.extracted);
        return {
          id: detail.id,
          gold: detail.gold,
          extracted: detail.extracted,
          missing: detail.gold.filter(g => !extractedSet.has(g)),
          extra: detail.extracted.filter(e => !goldSet.has(e))
        };
      });
      writeFileSync(
        'tmp/l3-spec-debug.json',
        JSON.stringify({ results, detail }, null, 2),
        'utf-8'
      );
    }

    console.log('\n📊 LEVEL 3 RESULTS:');
    console.log(`\nEntities:`);
    console.log(`  Precision: ${(avgEntityP * 100).toFixed(1)}% (target: ≥80%)`);
    console.log(`  Recall: ${(avgEntityR * 100).toFixed(1)}% (target: ≥75%)`);
    console.log(`  F1: ${(entityF1 * 100).toFixed(1)}% (target: ≥77%)`);

    console.log(`\nRelations:`);
    console.log(`  Precision: ${(avgRelationP * 100).toFixed(1)}% (target: ≥80%)`);
    console.log(`  Recall: ${(avgRelationR * 100).toFixed(1)}% (target: ≥75%)`);
    console.log(`  F1: ${(relationF1 * 100).toFixed(1)}% (target: ≥77%)`);

    // Assert thresholds
    expect(avgEntityP).toBeGreaterThanOrEqual(0.80);
    expect(avgEntityR).toBeGreaterThanOrEqual(0.75);
    expect(entityF1).toBeGreaterThanOrEqual(0.77);

    expect(avgRelationP).toBeGreaterThanOrEqual(0.80);
    expect(avgRelationR).toBeGreaterThanOrEqual(0.75);
    expect(relationF1).toBeGreaterThanOrEqual(0.77);

    console.log('\n🎉 LEVEL 3 PASSED! System ready for production.\n');

    clearStorage(testPath);
  });
});
