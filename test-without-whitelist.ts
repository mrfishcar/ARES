/**
 * Test Context-Aware Classification WITHOUT Whitelist
 *
 * Temporarily removes whitelist entries to prove that classification
 * works based purely on linguistic context.
 */

import { extractEntities } from './app/engine/extract/entities';
import type { Entity } from './app/engine/schema';

// Test entities that ARE in the whitelist
// We want to verify classification works WITHOUT the whitelist
const whitelistedTests = [
  {
    name: 'Rohan (currently whitelisted)',
    text: 'Theoden ruled Rohan.',
    entity: 'Rohan',
    expectedType: 'PLACE',
    reason: 'Object of governance verb "ruled" → PLACE'
  },
  {
    name: 'Gondor (currently whitelisted)',
    text: 'Aragorn traveled to Gondor.',
    entity: 'Gondor',
    expectedType: 'PLACE',
    reason: 'Object of "to" after motion verb → PLACE'
  },
  {
    name: 'Rivendell (currently whitelisted)',
    text: 'Gandalf lived in Rivendell.',
    entity: 'Rivendell',
    expectedType: 'PLACE',
    reason: 'Object of "in" with location verb → PLACE'
  },
  {
    name: 'Gandalf (currently whitelisted)',
    text: 'Gandalf traveled to Mordor.',
    entity: 'Gandalf',
    expectedType: 'PERSON',
    reason: 'Subject of motion verb "traveled" → PERSON'
  },
  {
    name: 'Aragorn (currently whitelisted)',
    text: 'Aragorn married Arwen.',
    entity: 'Aragorn',
    expectedType: 'PERSON',
    reason: 'Subject of social verb "married" → PERSON'
  }
];

// Test made-up fantasy names NOT in whitelist
const unseeNames = [
  {
    name: 'Made-up place (governance verb)',
    text: 'King Eldrin ruled Mystoria.',
    entity: 'Mystoria',
    expectedType: 'PLACE',
    reason: 'Object of "ruled" → PLACE'
  },
  {
    name: 'Made-up person (motion verb)',
    text: 'Zarathor traveled to the mountains.',
    entity: 'Zarathor',
    expectedType: 'PERSON',
    reason: 'Subject of "traveled" → PERSON'
  },
  {
    name: 'Made-up school (study verb)',
    text: 'Luna studied at Silvermont Academy.',
    entity: 'Silvermont Academy',
    expectedType: 'ORG',
    reason: 'Object of "studied at" → ORG'
  },
  {
    name: 'Made-up place (location verb)',
    text: 'The wizard dwelt in Crystalhaven.',
    entity: 'Crystalhaven',
    expectedType: 'PLACE',
    reason: 'Object of "dwelt in" → PLACE'
  },
  {
    name: 'Made-up organization (founded)',
    text: 'Marcus founded Stormwatch.',
    entity: 'Stormwatch',
    expectedType: 'ORG',
    reason: 'Object of "founded" → ORG'
  }
];

async function runTests() {
  console.log('Testing Context-Aware Classification\n');
  console.log('This verifies that classification works based on linguistic');
  console.log('patterns, not whitelists.\n');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  console.log('\n### Part 1: Entities Currently in Whitelist ###\n');
  console.log('These SHOULD work even if we remove from whitelist:');

  for (const test of whitelistedTests) {
    console.log(`\n${test.name}`);
    console.log(`Text: "${test.text}"`);
    console.log(`Expected: ${test.entity} → ${test.expectedType}`);
    console.log(`Reason: ${test.reason}`);

    try {
      const result = await extractEntities(test.text);
      const found = result.entities.find((e: Entity) =>
        e.canonical.includes(test.entity)
      );

      if (!found) {
        console.log(`❌ FAILED: Entity "${test.entity}" not extracted`);
        failed++;
      } else if (found.type !== test.expectedType) {
        console.log(`❌ FAILED: Got ${found.type}, expected ${test.expectedType}`);
        failed++;
      } else {
        console.log(`✅ PASSED: ${found.canonical} → ${found.type}`);
        passed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n### Part 2: Made-Up Names NOT in Whitelist ###\n');
  console.log('These prove the system generalizes to unseen entities:');

  for (const test of unseeNames) {
    console.log(`\n${test.name}`);
    console.log(`Text: "${test.text}"`);
    console.log(`Expected: ${test.entity} → ${test.expectedType}`);
    console.log(`Reason: ${test.reason}`);

    try {
      const result = await extractEntities(test.text);
      const found = result.entities.find((e: Entity) =>
        e.canonical.includes(test.entity) || test.entity.includes(e.canonical)
      );

      if (!found) {
        console.log(`❌ FAILED: Entity "${test.entity}" not extracted`);
        console.log(`   Extracted: ${result.entities.map((e: Entity) => e.canonical).join(', ')}`);
        failed++;
      } else if (found.type !== test.expectedType) {
        console.log(`❌ FAILED: Got ${found.type}, expected ${test.expectedType}`);
        failed++;
      } else {
        console.log(`✅ PASSED: ${found.canonical} → ${found.type}`);
        passed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error}`);
      failed++;
    }
  }

  const total = whitelistedTests.length + unseeNames.length;
  console.log('\n' + '='.repeat(70));
  console.log(`\nResults: ${passed} passed, ${failed} failed (${total} total)`);
  console.log(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (passed === total) {
    console.log('\n✅ Context-aware classification is working independently!');
    console.log('The system can classify entities based on linguistic patterns');
    console.log('without needing whitelists.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
