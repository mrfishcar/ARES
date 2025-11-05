/**
 * Test extraction on "Barty Beauregard and the Fabulous Fraud"
 * User's own fantasy/mystery fiction (~4,000 words)
 */

import * as fs from 'fs';
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testBarty() {
  console.log('BARTY BEAUREGARD EXTRACTION TEST');
  console.log('='.repeat(80));

  const text = fs.readFileSync('/tmp/barty-beauregard-excerpt.txt', 'utf-8');
  const words = text.split(/\s+/).length;

  console.log(`Text length: ${words.toLocaleString()} words`);
  console.log('='.repeat(80));

  const startTime = Date.now();

  const { entities, relations } = await extractFromSegments('barty', text);

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  console.log(`\nProcessing time: ${duration.toFixed(1)}s`);

  // Group entities by type
  const entitiesByType = new Map<string, typeof entities>();
  for (const entity of entities) {
    if (!entitiesByType.has(entity.type)) {
      entitiesByType.set(entity.type, []);
    }
    entitiesByType.get(entity.type)!.push(entity);
  }

  console.log(`\nEntities: ${entities.length}`);
  console.log('');
  for (const [type, ents] of Array.from(entitiesByType.entries()).sort()) {
    console.log(`${type} (${ents.length}):`);
    const names = ents.map(e => e.canonical).sort();
    for (let i = 0; i < Math.min(20, names.length); i++) {
      console.log(`  - ${names[i]}`);
    }
    if (names.length > 20) {
      console.log(`  ... and ${names.length - 20} more`);
    }
    console.log('');
  }

  // Group relations by predicate
  const relationsByPred = new Map<string, typeof relations>();
  for (const rel of relations) {
    if (!relationsByPred.has(rel.pred)) {
      relationsByPred.set(rel.pred, []);
    }
    relationsByPred.get(rel.pred)!.push(rel);
  }

  console.log('='.repeat(80));
  console.log(`Relations: ${relations.length}`);
  console.log('='.repeat(80));
  console.log('');

  for (const [pred, rels] of Array.from(relationsByPred.entries()).sort()) {
    console.log(`${pred} (${rels.length}):`);
    for (let i = 0; i < Math.min(10, rels.length); i++) {
      const rel = rels[i];
      const subj = entities.find(e => e.id === rel.subj)?.canonical || 'unknown';
      const obj = entities.find(e => e.id === rel.obj)?.canonical || 'unknown';
      console.log(`  ${subj} → ${obj}`);
    }
    if (rels.length > 10) {
      console.log(`  ... and ${rels.length - 10} more`);
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('STATISTICS');
  console.log('='.repeat(80));
  console.log(`Words: ${words.toLocaleString()}}`);
  console.log(`Entities: ${entities.length}`);
  console.log(`Relations: ${relations.length}`);
  console.log(`Entity types: ${entitiesByType.size}`);
  console.log(`Relation types: ${relationsByPred.size}`);
  console.log(`Entities per 100 words: ${(entities.length / words * 100).toFixed(1)}`);
  console.log(`Relations per 100 words: ${(relations.length / words * 100).toFixed(1)}`);
  console.log(`Processing speed: ${Math.round(words / duration)} words/sec`);
  console.log(`Entity/Relation ratio: ${(relations.length / entities.length).toFixed(2)}`);
}

testBarty()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
