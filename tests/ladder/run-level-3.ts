/**
 * Level 3 Debug Runner with JSONL Instrumentation
 *
 * Usage:
 *   npx ts-node tests/ladder/run-level-3.ts --dump-failures
 *   npx ts-node tests/ladder/run-level-3.ts --top-failures 50
 *   npx ts-node tests/ladder/run-level-3.ts --dump-failures | jq .
 *
 * Outputs:
 *   - tmp/stage3-failures.jsonl (all failures in JSONL format)
 *   - stdout (optionally streamed with --dump-failures)
 */

import fs from 'fs';
import path from 'path';
import { extractFromSegments, DebugFailureRecord, DebugCallback } from '../../app/engine/pipeline/orchestrator';

// CLI argument parsing
const args = process.argv.slice(2);
const dumpFailures = args.includes('--dump-failures');
const failuresPath = 'tmp/stage3-failures.jsonl';
const topFailures = args.includes('--top-failures') ? parseInt(args[args.indexOf('--top-failures') + 1] || '0', 10) : 0;
const sortByImpact = !args.includes('--no-sort');

// Ensure output dir exists
const failuresDir = path.dirname(failuresPath);
if (!fs.existsSync(failuresDir)) fs.mkdirSync(failuresDir, { recursive: true });

// Test cases from level-3-complex.spec.ts
interface GoldEntity {
  text: string;
  type: string;
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
  {
    id: '3.2',
    text: `Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor.

Draco Malfoy, on the other hand, joined Slytherin. He became a rival to Harry.`,
    gold: {
      entities: [
        { text: 'Hermione Granger', type: 'PERSON' },
        { text: 'Gryffindor House', type: 'ORG' },
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Ron Weasley', type: 'PERSON' },
        { text: 'Draco Malfoy', type: 'PERSON' },
        { text: 'Slytherin', type: 'ORG' }
      ],
      relations: [
        { subj: 'Hermione Granger', pred: 'member_of', obj: 'Gryffindor House' },
        { subj: 'Harry Potter', pred: 'member_of', obj: 'Gryffindor House' },
        { subj: 'Ron Weasley', pred: 'member_of', obj: 'Gryffindor House' },
        { subj: 'Draco Malfoy', pred: 'member_of', obj: 'Slytherin' },
        { subj: 'Draco Malfoy', pred: 'rivals_with', obj: 'Harry Potter' },
        { subj: 'Harry Potter', pred: 'rivals_with', obj: 'Draco Malfoy' }
      ]
    }
  },
  {
    id: '3.3',
    text: `Dumbledore founded Hogwarts School of Witchcraft and Wizardry. The school had four houses: Gryffindor, Hufflepuff, Ravenclaw, and Slytherin.

Each house had a headmaster. Minerva McGonagall was the head of Gryffindor.`,
    gold: {
      entities: [
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Hogwarts School of Witchcraft and Wizardry', type: 'ORG' },
        { text: 'Gryffindor', type: 'ORG' },
        { text: 'Hufflepuff', type: 'ORG' },
        { text: 'Ravenclaw', type: 'ORG' },
        { text: 'Slytherin', type: 'ORG' },
        { text: 'Minerva McGonagall', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Dumbledore', pred: 'founded', obj: 'Hogwarts School of Witchcraft and Wizardry' },
        { subj: 'Gryffindor', pred: 'part_of', obj: 'Hogwarts School of Witchcraft and Wizardry' },
        { subj: 'Hufflepuff', pred: 'part_of', obj: 'Hogwarts School of Witchcraft and Wizardry' },
        { subj: 'Ravenclaw', pred: 'part_of', obj: 'Hogwarts School of Witchcraft and Wizardry' },
        { subj: 'Slytherin', pred: 'part_of', obj: 'Hogwarts School of Witchcraft and Wizardry' },
        { subj: 'Minerva McGonagall', pred: 'head_of', obj: 'Gryffindor' }
      ]
    }
  },
  {
    id: '3.4',
    text: `The Order of the Phoenix was a secret organization. Dumbledore led it. Members included Harry Potter, Sirius Black, and Remus Lupin.

They fought against Voldemort and his Death Eaters.`,
    gold: {
      entities: [
        { text: 'Order of the Phoenix', type: 'ORG' },
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Sirius Black', type: 'PERSON' },
        { text: 'Remus Lupin', type: 'PERSON' },
        { text: 'Voldemort', type: 'PERSON' },
        { text: 'Death Eaters', type: 'ORG' }
      ],
      relations: [
        { subj: 'Dumbledore', pred: 'leads', obj: 'Order of the Phoenix' },
        { subj: 'Harry Potter', pred: 'member_of', obj: 'Order of the Phoenix' },
        { subj: 'Sirius Black', pred: 'member_of', obj: 'Order of the Phoenix' },
        { subj: 'Remus Lupin', pred: 'member_of', obj: 'Order of the Phoenix' },
        { subj: 'Order of the Phoenix', pred: 'fights_against', obj: 'Death Eaters' },
        { subj: 'Death Eaters', pred: 'fights_against', obj: 'Order of the Phoenix' }
      ]
    }
  },
  {
    id: '3.5',
    text: `Sirius Black was Harry's godfather. He was imprisoned in Azkaban for twelve years. Upon his escape, he was pursued by Dementors.

Harry felt grateful to Sirius for his protection.`,
    gold: {
      entities: [
        { text: 'Sirius Black', type: 'PERSON' },
        { text: 'Harry', type: 'PERSON' },
        { text: 'Azkaban', type: 'PLACE' },
        { text: 'Dementors', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Sirius Black', pred: 'godfather_of', obj: 'Harry' },
        { subj: 'Sirius Black', pred: 'imprisoned_in', obj: 'Azkaban' },
        { subj: 'Dementors', pred: 'pursued', obj: 'Sirius Black' },
        { subj: 'Harry', pred: 'grateful_to', obj: 'Sirius Black' }
      ]
    }
  },
  {
    id: '3.6',
    text: `The Weasley family was large. Molly Weasley was the mother. Bill, Charlie, Percy, Fred, George, Ron, and Ginny were her children.

Ron was Harry's best friend, while Ginny became Harry's wife.`,
    gold: {
      entities: [
        { text: 'Weasley family', type: 'PERSON' },
        { text: 'Molly Weasley', type: 'PERSON' },
        { text: 'Bill', type: 'PERSON' },
        { text: 'Charlie', type: 'PERSON' },
        { text: 'Percy', type: 'PERSON' },
        { text: 'Fred', type: 'PERSON' },
        { text: 'George', type: 'PERSON' },
        { text: 'Ron', type: 'PERSON' },
        { text: 'Ginny', type: 'PERSON' },
        { text: 'Harry', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Molly Weasley', pred: 'mother_of', obj: 'Bill' },
        { subj: 'Molly Weasley', pred: 'mother_of', obj: 'Charlie' },
        { subj: 'Molly Weasley', pred: 'mother_of', obj: 'Percy' },
        { subj: 'Molly Weasley', pred: 'mother_of', obj: 'Fred' },
        { subj: 'Molly Weasley', pred: 'mother_of', obj: 'George' },
        { subj: 'Molly Weasley', pred: 'mother_of', obj: 'Ron' },
        { subj: 'Molly Weasley', pred: 'mother_of', obj: 'Ginny' },
        { subj: 'Ron', pred: 'friends_with', obj: 'Harry' },
        { subj: 'Harry', pred: 'married_to', obj: 'Ginny' }
      ]
    }
  },
  {
    id: '3.7',
    text: `Albus Dumbledore served as Headmaster of Hogwarts. Severus Snape taught Potions. He was also the head of Slytherin House.

Dumbledore trusted Snape, though others did not.`,
    gold: {
      entities: [
        { text: 'Albus Dumbledore', type: 'PERSON' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Severus Snape', type: 'PERSON' },
        { text: 'Potions', type: 'WORK' },
        { text: 'Slytherin House', type: 'ORG' }
      ],
      relations: [
        { subj: 'Albus Dumbledore', pred: 'headmaster_of', obj: 'Hogwarts' },
        { subj: 'Severus Snape', pred: 'teaches', obj: 'Potions' },
        { subj: 'Severus Snape', pred: 'head_of', obj: 'Slytherin House' },
        { subj: 'Albus Dumbledore', pred: 'trusts', obj: 'Severus Snape' }
      ]
    }
  },
  {
    id: '3.8',
    text: `Tom Riddle became Lord Voldemort through dark magic. He sought to gain immortality by creating Horcruxes.

Harry Potter ultimately defeated Voldemort.`,
    gold: {
      entities: [
        { text: 'Tom Riddle', type: 'PERSON' },
        { text: 'Voldemort', type: 'PERSON' },
        { text: 'Horcruxes', type: 'ITEM' },
        { text: 'Harry Potter', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Tom Riddle', pred: 'became', obj: 'Voldemort' },
        { subj: 'Voldemort', pred: 'created', obj: 'Horcruxes' },
        { subj: 'Harry Potter', pred: 'defeated', obj: 'Voldemort' }
      ]
    }
  },
  {
    id: '3.9',
    text: `The Chamber of Secrets was a hidden room within Hogwarts. Salazar Slytherin built it centuries ago.

In his second year, Harry discovered the Chamber. Tom Riddle revealed himself as the heir of Slytherin.`,
    gold: {
      entities: [
        { text: 'Chamber of Secrets', type: 'PLACE' },
        { text: 'Hogwarts', type: 'ORG' },
        { text: 'Salazar Slytherin', type: 'PERSON' },
        { text: 'Harry', type: 'PERSON' },
        { text: 'Tom Riddle', type: 'PERSON' },
        { text: 'Slytherin', type: 'PERSON' }
      ],
      relations: [
        { subj: 'Chamber of Secrets', pred: 'part_of', obj: 'Hogwarts' },
        { subj: 'Salazar Slytherin', pred: 'built', obj: 'Chamber of Secrets' },
        { subj: 'Harry', pred: 'discovered', obj: 'Chamber of Secrets' },
        { subj: 'Tom Riddle', pred: 'heir_of', obj: 'Slytherin' }
      ]
    }
  },
  {
    id: '3.10',
    text: `The Triwizard Tournament was held at Hogwarts School. Champions from three wizarding schools participated.

Harry Potter participated as the fourth champion, though he had not entered. Cedric Diggory from Hufflepuff was the official Hogwarts champion.`,
    gold: {
      entities: [
        { text: 'Triwizard Tournament', type: 'EVENT' },
        { text: 'Hogwarts School', type: 'ORG' },
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Cedric Diggory', type: 'PERSON' },
        { text: 'Hufflepuff', type: 'ORG' }
      ],
      relations: [
        { subj: 'Triwizard Tournament', pred: 'held_at', obj: 'Hogwarts School' },
        { subj: 'Harry Potter', pred: 'participated_in', obj: 'Triwizard Tournament' },
        { subj: 'Cedric Diggory', pred: 'champion_for', obj: 'Hufflepuff' },
        { subj: 'Cedric Diggory', pred: 'participated_in', obj: 'Triwizard Tournament' }
      ]
    }
  }
];

// Accumulator for failures
const failures: DebugFailureRecord[] = [];

// Debug callback to collect results
const debugCallback: DebugCallback = (rec: DebugFailureRecord) => {
  // Normalize signatures for comparison
  const normalizeRel = (r: any) => `${(r.relation || r.pred || '').toLowerCase()}::${(r.args?.arg1 || r.subj || '').toLowerCase().trim()}::${(r.args?.arg2 || r.obj || '').toLowerCase().trim()}`;

  // Find matching gold relations
  const goldSigs = new Set((rec.goldRelations || []).map(normalizeRel));
  const predSigs = new Set((rec.predicted || []).map(normalizeRel));

  // Compute false negatives and other failures
  const falseNegatives = Array.from(goldSigs).filter(g => !predSigs.has(g)).length;
  const wrongArgs = (rec.predicted || []).filter(p => !goldSigs.has(normalizeRel(p))).length;

  // Determine failure reason
  let failureReason = rec.failureReason || 'other';
  if (!rec.predicted || rec.predicted.length === 0) {
    failureReason = 'never_produced';
  } else if (falseNegatives > 0) {
    failureReason = 'never_produced';
  } else if (wrongArgs > 0) {
    failureReason = 'wrong_args';
  } else {
    const avgScore = rec.predicted.reduce((sum, p) => sum + p.score, 0) / rec.predicted.length;
    if (avgScore < 0.5) failureReason = 'low_confidence';
  }

  rec.failureReason = failureReason;
  failures.push(rec);

  // Stream to stdout if requested
  if (dumpFailures) {
    process.stdout.write(JSON.stringify(rec) + '\n');
  }
};

// Helper: normalize relation tuple signature
function normalizeSignature(rel: GoldRelation): string {
  return `${rel.pred.toLowerCase()}::${rel.subj.toLowerCase().trim()}::${rel.obj.toLowerCase().trim()}`;
}

// Main run function
async function main() {
  console.log(`Loading ${testCases.length} Level 3 test cases...`);

  let processed = 0;
  for (const tc of testCases) {
    try {
      console.log(`[${tc.id}] Processing...`);

      // Run extraction with debug callback
      const result = await extractFromSegments(
        `level3-${tc.id}`,
        tc.text,
        undefined,
        undefined,
        undefined,
        { debugCallback }
      );

      // After extraction, find the corresponding failure record and add gold relations
      const lastFailure = failures[failures.length - 1];
      if (lastFailure && lastFailure.testCaseId === `level3-${tc.id}`) {
        lastFailure.goldRelations = tc.gold.relations.map(r => ({
          relation: r.pred,
          args: { arg1: r.subj, arg2: r.obj }
        }));
      }

      processed++;
    } catch (err) {
      console.error(`  Error: ${(err as Error).message}`);
    }
  }

  console.log(`\nProcessed ${processed}/${testCases.length} test cases\n`);

  // Sort by impact
  let outputFailures = failures;
  if (sortByImpact) {
    outputFailures = sortFailuresByImpact(outputFailures);
  }

  if (topFailures > 0) {
    outputFailures = outputFailures.slice(0, topFailures);
  }

  // Write JSONL file
  const ws = fs.createWriteStream(failuresPath, { flags: 'w' });
  for (const rec of outputFailures) {
    ws.write(JSON.stringify(rec) + '\n');
  }
  ws.end();

  // Print summary
  console.log(`📊 Results Summary:`);
  console.log(`  Wrote ${outputFailures.length} records to ${failuresPath}`);

  const summary: Record<string, number> = {};
  for (const f of outputFailures) {
    const reason = f.failureReason || 'unknown';
    summary[reason] = (summary[reason] || 0) + 1;
  }
  console.log(`  Failure breakdown:`, summary);
  console.log(`\nTo analyze: cat ${failuresPath} | jq .\n`);
}

// Sort by impact: never_produced > low_confidence > wrong_args > other
function sortFailuresByImpact(arr: DebugFailureRecord[]): DebugFailureRecord[] {
  const rank = (reason?: string) => {
    switch (reason) {
      case 'never_produced': return 1;
      case 'low_confidence': return 2;
      case 'wrong_args': return 3;
      default: return 4;
    }
  };

  return arr.sort((a, b) => {
    const ra = rank(a.failureReason);
    const rb = rank(b.failureReason);
    if (ra !== rb) return ra - rb;
    // Tie-break by test case ID
    return (a.testCaseId || '').localeCompare(b.testCaseId || '');
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
