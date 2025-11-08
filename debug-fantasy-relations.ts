/**
 * Debug why fantasy chapter relations aren't extracting
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';

async function debugRelations() {
  console.log('=== DEBUGGING FANTASY RELATION EXTRACTION ===\n');

  // Test specific sentences that SHOULD have relations
  const tests = [
    {
      name: "Mentoring relation",
      text: "Master Theron Brightforge mentored Lyssa Moonwhisper in the arcane arts."
    },
    {
      name: "Location relation",
      text: "Elara Moonwhisper stood at the edge of Crystal Cliffs."
    },
    {
      name: "Ruling relation",
      text: "King Aldric ruled from Silverhaven."
    },
    {
      name: "Enemy relation",
      text: "Lord Malachar was the enemy of King Aldric."
    },
    {
      name: "Battle relation",
      text: "The Battle of Starfall Ridge occurred in the Obsidian Mountains."
    }
  ];

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    console.log(`Text: "${test.text}"`);

    const { entities, relations } = await extractFromSegments('debug-test', test.text);

    console.log(`Entities (${entities.length}):`);
    for (const e of entities) {
      console.log(`  - ${e.canonical} (${e.type})`);
    }

    console.log(`Relations (${relations.length}):`);
    if (relations.length === 0) {
      console.log(`  ✗ NONE EXTRACTED`);
    } else {
      for (const r of relations) {
        const subj = entities.find(e => e.id === r.subj);
        const obj = entities.find(e => e.id === r.obj);
        console.log(`  ✓ ${subj?.canonical} --[${r.pred}]--> ${obj?.canonical}`);
      }
    }
  }

  console.log('\n=== ANALYSIS ===');
  console.log('If relations are extracted from these simple sentences,');
  console.log('but not from the full chapter, the issue is likely:');
  console.log('  1. Entity span detection in longer text');
  console.log('  2. Entity type misclassification');
  console.log('  3. Coreference/pronoun handling');
}

debugRelations().catch(console.error);
