/**
 * Minimal test case for relation extraction debugging
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testMinimal() {
  // Test sentence that should extract "Theron mentored Lyssa"
  const text = "Master Theron Brightforge mentored Lyssa Moonwhisper.";

  console.log('Testing sentence:', text);
  console.log('Expected: Theron mentored Lyssa\n');

  const { entities, relations } = await extractFromSegments('test', text);

  console.log('\n=== ENTITIES ===');
  for (const e of entities) {
    console.log(`  ${e.canonical} (${e.type})`);
  }

  console.log('\n=== RELATIONS ===');
  if (relations.length === 0) {
    console.log('  (none extracted)');
  } else {
    for (const rel of relations) {
      const subj = entities.find(e => e.id === rel.subj);
      const obj = entities.find(e => e.id === rel.obj);
      console.log(`  ${subj?.canonical} --[${rel.pred}]--> ${obj?.canonical}`);
    }
  }

  console.log(`\nTotal: ${relations.length} relation(s) extracted`);
  if (relations.length === 0) {
    console.log('❌ FAILED: Expected 1 relation (mentored)');
  } else {
    console.log('✓ SUCCESS: Relation extracted!');
  }
}

testMinimal().catch(console.error);
