/**
 * Test script for recency-based surname resolution
 *
 * Scenario: When "Potter" appears alone, resolve to most recently mentioned Potter
 * - "Harry Potter arrived. Lily Potter followed. Potter spoke first."
 *   → "Potter" should resolve to "Lily Potter" (most recent)
 */

import { extractFromSegments } from '../app/engine/pipeline/orchestrator';
import { eidRegistry } from '../app/engine/eid-registry';

const testCases = [
  {
    id: 'surname-1',
    name: 'Recency-based surname resolution',
    text: `Harry Potter arrived at the platform. Lily Potter followed close behind.

    Potter spoke first to the conductor.`,
    expectedResolution: {
      bareSurname: 'Potter',
      shouldResolveTo: 'Lily Potter'  // Most recently mentioned Potter
    }
  },
  {
    id: 'surname-2',
    name: 'Single entity with surname',
    text: `Mr. Dursley was a director of a firm called Grunnings.

    Dursley had no patience for imagination.`,
    expectedResolution: {
      bareSurname: 'Dursley',
      shouldResolveTo: 'Mr. Dursley'  // Only one Dursley
    }
  },
  {
    id: 'surname-3',
    name: 'Recency changes mid-document',
    text: `James Potter was a talented wizard. Lily Potter was equally skilled.

    Potter dueled expertly in the tournament.

    Later, James returned. Potter smiled at his friends.`,
    expectedResolutions: [
      { position: 'first Potter', shouldResolveTo: 'Lily Potter' },
      { position: 'second Potter', shouldResolveTo: 'James' }  // James mentioned again
    ]
  }
];

async function main() {
  console.log('='.repeat(60));
  console.log('SURNAME RESOLUTION TEST');
  console.log('='.repeat(60));

  for (const test of testCases) {
    console.log(`\nTest: ${test.name}`);
    console.log(`Text: ${test.text.substring(0, 80)}...`);

    eidRegistry.clear();
    const result = await extractFromSegments(test.id, test.text);

    console.log(`\nEntities found:`);
    for (const e of result.entities) {
      console.log(`  - ${e.type}::${e.canonical} (aliases: ${e.aliases?.join(', ') || 'none'})`);
    }

    // Check if bare surname was resolved correctly
    if (test.expectedResolution) {
      const { bareSurname, shouldResolveTo } = test.expectedResolution;
      const resolvedEntity = result.entities.find(e =>
        e.canonical.toLowerCase().includes(shouldResolveTo.toLowerCase())
      );

      if (resolvedEntity) {
        // Check if the bare surname is an alias or if it was merged
        const hasBareSurnameAlias = resolvedEntity.aliases?.includes(bareSurname) ||
          resolvedEntity.aliases?.some((a: string) => a.toLowerCase() === bareSurname.toLowerCase());

        console.log(`\n✓ Expected "${bareSurname}" → "${shouldResolveTo}"`);
        console.log(`  Entity found: ${resolvedEntity.canonical}`);
        console.log(`  Has bare surname alias: ${hasBareSurnameAlias}`);
      } else {
        console.log(`\n✗ Expected resolution to "${shouldResolveTo}" not found`);
      }
    }
  }
}

main().catch(console.error);
