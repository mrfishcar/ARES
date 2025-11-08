/**
 * Test title word inclusion with brand new names
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testTitles() {
  // Completely new names not in registry
  const text = `
    Prince Zachary founded the Silver Order.
    Princess Isabella married Prince Zachary.
    General Thompson defeated the Dark Legion.
    Queen Victoria rules the Eastern Realm.
    Wizard Malachi mentored young Victoria.
  `;

  console.log('Testing title word inclusion:\n');

  const { entities, relations } = await extractFromSegments('test-titles', text);

  console.log('=== ENTITIES ===');
  const people = entities.filter(e => e.type === 'PERSON');
  console.log('PERSON entities:');
  for (const e of people) {
    console.log(`  - ${e.canonical}`);
  }

  console.log('\nAll entities:');
  for (const e of entities) {
    console.log(`  - ${e.canonical} (${e.type})`);
  }

  console.log('\n=== RELATIONS ===');
  for (const rel of relations) {
    const subj = entities.find(e => e.id === rel.subj);
    const obj = entities.find(e => e.id === rel.obj);
    console.log(`  ${subj?.canonical} --[${rel.pred}]--> ${obj?.canonical}`);
  }

  console.log(`\nTotal: ${entities.length} entities, ${relations.length} relations`);

  // Check if titles are included
  const hasFullTitles = people.some(e =>
    e.canonical.toLowerCase().includes('prince') ||
    e.canonical.toLowerCase().includes('princess') ||
    e.canonical.toLowerCase().includes('queen') ||
    e.canonical.toLowerCase().includes('general') ||
    e.canonical.toLowerCase().includes('wizard')
  );

  if (hasFullTitles) {
    console.log('✓ SUCCESS: Titles are being included in entity names');
  } else {
    console.log('✗ FAILED: Titles are still missing from entity names');
  }
}

testTitles().catch(console.error);
