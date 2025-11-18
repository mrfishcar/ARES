/**
 * Meaning Layer Integration Test
 *
 * Demonstrates the new meaning layer extracting clean intermediate representations
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { expectMeaning } from './app/engine/meaning-test-utils';
import type { MeaningRecord } from './app/engine/schema';

async function testMeaningLayer() {
  console.log('\n=== Meaning Layer Integration Test ===\n');

  const testText = "Frederick ruled Gondor wisely. Aragorn traveled to Rivendell.";
  const docId = "test-meaning-layer";

  console.log(`Input: "${testText}"\n`);

  // Extract with meaning layer enabled
  const result = await extractFromSegments(docId, testText);

  console.log(`✅ Extracted:`);
  console.log(`   - ${result.entities.length} entities`);
  console.log(`   - ${result.relations.length} relations`);
  console.log(`   - ${result.meaningRecords.length} meaning records\n`);

  // Show entities
  console.log('Entities:');
  result.entities.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.canonical} (${e.type})`);
  });

  // Show meaning records (clean representation)
  console.log('\nMeaning Records:');
  result.meaningRecords.forEach((m, i) => {
    const subj = result.entities.find(e => e.id === m.subjectId);
    const obj = m.objectId ? result.entities.find(e => e.id === m.objectId) : null;

    console.log(`  ${i + 1}. ${subj?.canonical || m.subjectId} → ${m.relation} → ${obj?.canonical || m.objectId || '(none)'}`);

    if (m.qualifiers) {
      if (m.qualifiers.time) console.log(`      time: ${m.qualifiers.time}`);
      if (m.qualifiers.place) console.log(`      place: ${m.qualifiers.place}`);
      if (m.qualifiers.manner) console.log(`      manner: ${m.qualifiers.manner}`);
    }
  });

  // Test expectations
  console.log('\n=== Testing Expectations ===\n');

  try {
    // Test: Should have entities
    expectMeaning(result.meaningRecords).toHaveLength(2);
    console.log('✅ Correct number of meaning records');

    // Test: Frederick rules Gondor
    expectMeaning(result.meaningRecords).toContain({
      subj: result.entities.find(e => e.canonical === 'Frederick')?.id,
      rel: 'rules'
    });
    console.log('✅ Found: Frederick → rules');

    // Test: Aragorn traveled_to Rivendell
    expectMeaning(result.meaningRecords).toContain({
      subj: result.entities.find(e => e.canonical === 'Aragorn')?.id,
      rel: 'traveled_to'
    });
    console.log('✅ Found: Aragorn → traveled_to');

    console.log('\n✅ All tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', (error as Error).message);
    process.exit(1);
  }
}

// Run test
testMeaningLayer().catch((error: unknown) => {
  console.error('Test error:', error);
  process.exit(1);
});
