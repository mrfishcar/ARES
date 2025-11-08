/**
 * Test Context-Aware Entity Classification
 *
 * Verifies that entities are classified correctly using linguistic context
 * without relying on whitelists.
 */

import { extractEntities } from './app/engine/extract/entities';
import type { Entity } from './app/engine/schema';

const tests = [
  {
    name: 'Theoden ruled Rohan',
    text: 'Theoden ruled Rohan.',
    expectedEntities: [
      { canonical: 'Theoden', type: 'PERSON' },
      { canonical: 'Rohan', type: 'PLACE' }  // Should be PLACE (object of "ruled")
    ]
  },
  {
    name: 'Hermione went to Hogwarts',
    text: 'Hermione went to Hogwarts.',
    expectedEntities: [
      { canonical: 'Hermione', type: 'PERSON' },
      { canonical: 'Hogwarts', type: 'ORG' }  // Should be ORG (school context)
    ]
  },
  {
    name: 'Dumbledore teaches at Hogwarts',
    text: 'Dumbledore teaches at Hogwarts.',
    expectedEntities: [
      { canonical: 'Dumbledore', type: 'PERSON' },
      { canonical: 'Hogwarts', type: 'ORG' }  // Should be ORG ("teaches at" pattern)
    ]
  },
  {
    name: 'Harry studied at Hogwarts School',
    text: 'Harry studied at Hogwarts School.',
    expectedEntities: [
      { canonical: 'Harry', type: 'PERSON' },
      { canonical: 'Hogwarts School', type: 'ORG' }  // Should be ORG ("studied at")
    ]
  },
  {
    name: 'Aragorn traveled to Gondor',
    text: 'Aragorn traveled to Gondor.',
    expectedEntities: [
      { canonical: 'Aragorn', type: 'PERSON' },
      { canonical: 'Gondor', type: 'PLACE' }  // Should be PLACE (travel destination)
    ]
  },
  {
    name: 'Gandalf lived in Rivendell',
    text: 'Gandalf lived in Rivendell.',
    expectedEntities: [
      { canonical: 'Gandalf', type: 'PERSON' },
      { canonical: 'Rivendell', type: 'PLACE' }  // Should be PLACE ("lived in")
    ]
  },
  {
    name: 'Steve Jobs founded Apple',
    text: 'Steve Jobs founded Apple.',
    expectedEntities: [
      { canonical: 'Steve Jobs', type: 'PERSON' },
      { canonical: 'Apple', type: 'ORG' }  // Should be ORG ("founded")
    ]
  },
  {
    name: 'Sarah married John',
    text: 'Sarah married John.',
    expectedEntities: [
      { canonical: 'Sarah', type: 'PERSON' },
      { canonical: 'John', type: 'PERSON' }  // Should be PERSON ("married")
    ]
  }
];

async function runTests() {
  console.log('Testing Context-Aware Entity Classification\n');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\nTest: ${test.name}`);
    console.log(`Text: "${test.text}"`);

    try {
      const result = await extractEntities(test.text);

      console.log(`\nExtracted Entities:`);
      for (const entity of result.entities) {
        console.log(`  - ${entity.canonical} (${entity.type})`);
      }

      // Verify expected entities
      let testPassed = true;
      for (const expected of test.expectedEntities) {
        const found = result.entities.find((e: Entity) =>
          e.canonical === expected.canonical || e.canonical.includes(expected.canonical)
        );

        if (!found) {
          console.log(`  ❌ MISSING: ${expected.canonical} (${expected.type})`);
          testPassed = false;
        } else if (found.type !== expected.type) {
          console.log(`  ❌ WRONG TYPE: ${found.canonical} is ${found.type}, expected ${expected.type}`);
          testPassed = false;
        } else {
          console.log(`  ✓ ${found.canonical} (${found.type})`);
        }
      }

      if (testPassed) {
        console.log(`✅ PASSED`);
        passed++;
      } else {
        console.log(`❌ FAILED`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error}`);
      failed++;
    }

    console.log('-'.repeat(60));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed (${tests.length} total)`);
  console.log(`Success rate: ${((passed / tests.length) * 100).toFixed(1)}%`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
