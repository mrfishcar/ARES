/**
 * Test: Adaptive Entity Profiling
 *
 * Demonstrates how the system gets smarter with more data:
 * 1. Document 1: Introduces "Gandalf the Grey, a powerful wizard"
 * 2. Document 2: References "the wizard" - should resolve to Gandalf
 * 3. Document 3: References "the grey wizard" - should also resolve to Gandalf
 *
 * Expected: Each document improves Gandalf's profile, making subsequent resolution easier
 */

import { appendDoc, loadGraph, createEmptyGraph, saveGraph } from './app/storage/storage';
import * as fs from 'fs';

const TEST_GRAPH_PATH = './test-adaptive-graph.json';

async function testAdaptiveLearning() {
  console.log('='.repeat(80));
  console.log('ADAPTIVE LEARNING TEST');
  console.log('='.repeat(80));
  console.log();

  // Clean up any existing test graph
  if (fs.existsSync(TEST_GRAPH_PATH)) {
    fs.unlinkSync(TEST_GRAPH_PATH);
  }

  // Create empty graph
  const emptyGraph = createEmptyGraph();
  saveGraph(emptyGraph, TEST_GRAPH_PATH);

  // Document 1: Introduce Gandalf with rich description
  console.log('Document 1: Introducing Gandalf');
  console.log('-'.repeat(80));
  const doc1 = `
Gandalf the Grey, a powerful wizard, traveled to Rivendell in 3018.
Gandalf was a member of the Istari and wielded great magical power.
  `.trim();

  const result1 = await appendDoc('doc1', doc1, TEST_GRAPH_PATH);
  console.log(`✓ Entities: ${result1.entities.length}`);
  console.log(`✓ Relations: ${result1.relations.length}`);
  console.log();

  // Load graph and inspect Gandalf's profile
  let graph = loadGraph(TEST_GRAPH_PATH);
  if (graph) {
    console.log('Gandalf Profile after Document 1:');
    const gandalfEntity = graph.entities.find(e => e.canonical.toLowerCase().includes('gandalf'));
    if (gandalfEntity) {
      const profile = graph.profiles.get(gandalfEntity.id);
      if (profile) {
        console.log(`  - Descriptors: ${Array.from(profile.descriptors).join(', ')}`);
        console.log(`  - Roles: ${Array.from(profile.roles).join(', ')}`);
        console.log(`  - Titles: ${Array.from(profile.titles).join(', ')}`);
        console.log(`  - Mention count: ${profile.mention_count}`);
        console.log(`  - Confidence: ${profile.confidence_score.toFixed(2)}`);
      }
    }
  }
  console.log();

  // Document 2: Reference "the wizard" without name
  console.log('Document 2: Using descriptor "the wizard"');
  console.log('-'.repeat(80));
  const doc2 = `
The wizard arrived at Rivendell and met with Elrond.
The wizard spoke of great danger in the East.
  `.trim();

  const result2 = await appendDoc('doc2', doc2, TEST_GRAPH_PATH);
  console.log(`✓ Entities: ${result2.entities.length}`);
  console.log(`✓ Relations: ${result2.relations.length}`);
  console.log();

  // Check if "the wizard" was resolved to Gandalf
  graph = loadGraph(TEST_GRAPH_PATH);
  if (graph) {
    console.log('Gandalf Profile after Document 2:');
    const gandalfEntity = graph.entities.find(e => e.canonical.toLowerCase().includes('gandalf'));
    if (gandalfEntity) {
      const profile = graph.profiles.get(gandalfEntity.id);
      if (profile) {
        console.log(`  - Mention count: ${profile.mention_count} (should be higher if "wizard" resolved)`);
        console.log(`  - Confidence: ${profile.confidence_score.toFixed(2)}`);
        console.log(`  - Last seen: ${profile.last_seen}`);
      }
    }

    // Check relations to see if "the wizard" created relations with Gandalf
    const gandalfRelations = graph.relations.filter(r =>
      r.subj === gandalfEntity?.id || r.obj === gandalfEntity?.id
    );
    console.log(`  - Total relations involving Gandalf: ${gandalfRelations.length}`);
  }
  console.log();

  // Document 3: Reference "the grey wizard"
  console.log('Document 3: Using descriptor "the grey wizard"');
  console.log('-'.repeat(80));
  const doc3 = `
The grey wizard returned to the Shire after many years.
The old wizard warned Frodo of the danger.
  `.trim();

  const result3 = await appendDoc('doc3', doc3, TEST_GRAPH_PATH);
  console.log(`✓ Entities: ${result3.entities.length}`);
  console.log(`✓ Relations: ${result3.relations.length}`);
  console.log();

  // Final profile check
  graph = loadGraph(TEST_GRAPH_PATH);
  if (graph) {
    console.log('Final Gandalf Profile after Document 3:');
    const gandalfEntity = graph.entities.find(e => e.canonical.toLowerCase().includes('gandalf'));
    if (gandalfEntity) {
      const profile = graph.profiles.get(gandalfEntity.id);
      if (profile) {
        console.log(`  - Descriptors: ${Array.from(profile.descriptors).join(', ')}`);
        console.log(`  - Roles: ${Array.from(profile.roles).join(', ')}`);
        console.log(`  - Titles: ${Array.from(profile.titles).join(', ')}`);
        console.log(`  - Mention count: ${profile.mention_count}`);
        console.log(`  - Confidence: ${profile.confidence_score.toFixed(2)}`);
        console.log(`  - Attributes:`);
        for (const [key, values] of profile.attributes) {
          console.log(`    * ${key}: ${Array.from(values).join(', ')}`);
        }
      }
    }

    console.log();
    console.log('All entities in graph:');
    graph.entities.forEach(e => {
      console.log(`  - ${e.canonical} (${e.type})`);
    });
  }

  console.log();
  console.log('='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log(`Graph saved to: ${TEST_GRAPH_PATH}`);
  console.log('Inspect the profiles section to see accumulated knowledge!');
}

// Run test
testAdaptiveLearning().catch(console.error);
