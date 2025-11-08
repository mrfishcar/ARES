/**
 * Test extraction on completely new text (not in registry)
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testFresh() {
  // Brand new text that's definitely not in registry
  const text = `
    Princess Aria founded the Royal Academy.
    Prince Marcus married Princess Aria.
    General Viktor defeated the Shadow Army.
    Queen Elena rules the Northern Kingdom.
    Wizard Aldric mentored young Elena.
  `;

  console.log('Testing fresh extraction (new text not in registry):\n');

  const { entities, relations } = await extractFromSegments('test-fresh', text);

  console.log('=== ENTITIES ===');
  for (const e of entities.slice(0, 15)) {
    console.log(`  ${e.canonical} (${e.type})`);
  }
  console.log(`  ... (${entities.length} total)`);

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

  console.log(`\nTotal: ${entities.length} entities, ${relations.length} relations`);

  // Expected: 8-10 entities, 5 relations
  const expectedRelations = 5;
  if (relations.length >= expectedRelations) {
    console.log(`✓ SUCCESS: ${relations.length}/${expectedRelations} relations extracted`);
  } else {
    console.log(`✗ FAILED: Only ${relations.length}/${expectedRelations} relations extracted`);
  }
}

testFresh().catch(console.error);
