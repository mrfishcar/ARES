/**
 * Quick test of enhanced relation extraction
 */

import fs from 'fs';
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function testEnhancedExtraction() {
  const text = fs.readFileSync('./corpus/fantasy-chapter-01.txt', 'utf-8');

  console.log('Testing enhanced extraction on fantasy-chapter-01.txt');
  console.log('Word count:', text.split(/\s+/).length);
  console.log('');

  const startTime = Date.now();
  const { entities, relations } = await extractFromSegments('test', text);
  const timeMs = Date.now() - startTime;

  console.log(`\n=== RESULTS ===`);
  console.log(`Processing time: ${timeMs}ms`);
  console.log(`Entities extracted: ${entities.length}`);
  console.log(`Relations extracted: ${relations.length}`);
  console.log('');

  // Count relations by predicate
  const relByPred: Record<string, number> = {};
  for (const rel of relations) {
    relByPred[rel.pred] = (relByPred[rel.pred] || 0) + 1;
  }

  console.log('Relations by predicate:');
  const sorted = Object.entries(relByPred).sort((a, b) => b[1] - a[1]);
  for (const [pred, count] of sorted) {
    console.log(`  ${pred}: ${count}`);
  }

  console.log('\n=== BASELINE COMPARISON ===');
  console.log('Baseline: 2 relations (enemy_of only)');
  console.log(`Enhanced: ${relations.length} relations`);
  console.log(`Improvement: ${relations.length - 2} additional relations (+${Math.round((relations.length - 2) / 2 * 100)}%)`);

  // Show a few sample relations
  console.log('\n=== SAMPLE RELATIONS ===');
  const samples = relations.slice(0, 10);
  for (const rel of samples) {
    const subj = entities.find(e => e.id === rel.subj);
    const obj = entities.find(e => e.id === rel.obj);
    if (subj && obj) {
      console.log(`  ${subj.canonical} --[${rel.pred}]--> ${obj.canonical}`);
    }
  }
}

testEnhancedExtraction().catch(console.error);
