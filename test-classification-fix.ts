/**
 * Test geographic classification fix with NEW entities not in registry
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testClassification() {
  console.log('=== TESTING GEOGRAPHIC CLASSIFICATION FIX ===\n');

  // Use NEW place names not in the registry
  const tests = [
    {
      name: "Fantasy cliffs",
      text: "The heroes descended into the Shadowcliffs.",
      expectedPlace: "Shadowcliffs"
    },
    {
      name: "Fantasy haven",
      text: "They sought refuge in Stormhaven.",
      expectedPlace: "Stormhaven"
    },
    {
      name: "Fantasy reaches",
      text: "The army marched through the Eastern Reaches.",
      expectedPlace: "Eastern Reaches"
    },
    {
      name: "Fantasy wastes",
      text: "Few survive crossing the Scorched Wastes.",
      expectedPlace: "Scorched Wastes"
    },
    {
      name: "Fantasy highlands",
      text: "The Dragonhighe Highlands are treacherous.",
      expectedPlace: "Dragonhighe Highlands"
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    console.log(`Text: "${test.text}"`);

    const { entities } = await extractFromSegments('test-classification', test.text);

    const place = entities.find(e => e.canonical.toLowerCase().includes(test.expectedPlace.toLowerCase()));

    if (place) {
      if (place.type === 'PLACE') {
        console.log(`  ✓ ${place.canonical} correctly classified as PLACE`);
        passed++;
      } else {
        console.log(`  ✗ ${place.canonical} incorrectly classified as ${place.type} (should be PLACE)`);
        failed++;
      }
    } else {
      console.log(`  ✗ ${test.expectedPlace} not extracted at all`);
      failed++;
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);

  if (failed === 0) {
    console.log(`\n✓ Geographic classification fix is working!`);
  } else {
    console.log(`\n✗ Geographic classification still needs work`);
  }
}

testClassification().catch(console.error);
