/**
 * Comprehensive test on fantasy chapter with fresh registries
 */

import * as fs from 'fs';
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testComprehensive() {
  console.log('=== COMPREHENSIVE FANTASY EXTRACTION TEST ===\n');

  // Clear registries for fresh test
  console.log('Backing up and clearing registries...');
  fs.copyFileSync('data/eid-registry.json', 'data/eid-registry.backup.json');
  fs.copyFileSync('data/alias-registry.json', 'data/alias-registry.backup.json');
  fs.writeFileSync('data/eid-registry.json', '[]');
  fs.writeFileSync('data/alias-registry.json', '[]');

  // Load test corpus
  const text = fs.readFileSync('corpus/fantasy-chapter-01.txt', 'utf-8');
  const wordCount = text.split(/\s+/).length;

  console.log(`Text: ${text.length} chars, ~${wordCount} words`);
  console.log('');

  // Extract
  console.log('Running extraction with improved pipeline...');
  const start = Date.now();
  const { entities, relations } = await extractFromSegments('fantasy-test', text);
  const elapsed = Date.now() - start;

  console.log('\n=== RESULTS ===');
  console.log(`Processing time: ${elapsed}ms (${(elapsed/1000).toFixed(1)}s)`);
  console.log(`Entities: ${entities.length} (${(entities.length * 1000 / wordCount).toFixed(1)} per 1k words)`);
  console.log(`Relations: ${relations.length} (${(relations.length * 1000 / wordCount).toFixed(1)} per 1k words)`);

  // Group by type
  const byType = new Map<string, number>();
  for (const e of entities) {
    byType.set(e.type, (byType.get(e.type) || 0) + 1);
  }

  console.log('\n=== ENTITIES BY TYPE ===');
  for (const [type, count] of Array.from(byType.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count} (${(count / entities.length * 100).toFixed(1)}%)`);
  }

  // Group relations by predicate
  const byPred = new Map<string, number>();
  for (const r of relations) {
    byPred.set(r.pred, (byPred.get(r.pred) || 0) + 1);
  }

  console.log('\n=== RELATIONS BY PREDICATE ===');
  if (relations.length === 0) {
    console.log('  (none extracted)');
  } else {
    for (const [pred, count] of Array.from(byPred.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${pred}: ${count}`);
    }
  }

  // Sample entities
  console.log('\n=== SAMPLE ENTITIES (first 15) ===');
  for (const e of entities.slice(0, 15)) {
    console.log(`  - ${e.canonical} (${e.type})`);
  }

  // Sample relations
  console.log('\n=== SAMPLE RELATIONS (first 10) ===');
  if (relations.length === 0) {
    console.log('  (none extracted - THIS IS THE PROBLEM!)');
  } else {
    for (const r of relations.slice(0, 10)) {
      const subj = entities.find(e => e.id === r.subj);
      const obj = entities.find(e => e.id === r.obj);
      console.log(`  ${subj?.canonical} --[${r.pred}]--> ${obj?.canonical}`);
    }
  }

  // Expected minimum for success
  const minEntities = Math.floor(wordCount / 100); // ~1% of words should be entities
  const minRelations = Math.floor(entities.length * 0.1); // ~10% of entities should have relations

  console.log('\n=== ASSESSMENT ===');
  console.log(`Entity extraction: ${entities.length >= minEntities ? '✓' : '✗'} (need ${minEntities}+, got ${entities.length})`);
  console.log(`Relation extraction: ${relations.length >= minRelations ? '✓' : '✗'} (need ${minRelations}+, got ${relations.length})`);

  if (relations.length < minRelations) {
    console.log('\n⚠️  RELATION EXTRACTION STILL NEEDS WORK');
    console.log('Possible causes:');
    console.log('  - Patterns not matching narrative text');
    console.log('  - Entity types misclassified');
    console.log('  - Type guard rejection');
  }

  // Restore registries
  console.log('\nRestoring registries...');
  fs.copyFileSync('data/eid-registry.backup.json', 'data/eid-registry.json');
  fs.copyFileSync('data/alias-registry.backup.json', 'data/alias-registry.json');
  fs.unlinkSync('data/eid-registry.backup.json');
  fs.unlinkSync('data/alias-registry.backup.json');

  console.log('Done!');
}

testComprehensive().catch(console.error);
