/**
 * Phase 3 Demo - Query and Export
 */

import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';
import { query, getEntityRelations, getStats } from '../app/engine/query';
import { toCSV, toJSON, toDOT } from '../app/engine/export';

async function demo() {
  console.log('🔍 ARES Phase 3 Demo - Query & Export\n');

  // Sample text
  const text = 'Aragorn, son of Arathorn, married Arwen in 3019. Gandalf the Grey traveled to Minas Tirith.';

  // Extract entities and relations
  const { entities, spans } = await extractEntities(text);
  const relations = await extractRelations(text, { entities, spans }, 'demo');

  console.log('📊 Stats:');
  const stats = getStats(relations, entities);
  console.log(`  Entities: ${stats.totalEntities}`);
  console.log(`  Relations: ${stats.totalRelations}`);
  console.log(`  Avg Confidence: ${stats.avgConfidence.toFixed(3)}`);
  console.log(`  By Predicate:`, stats.byPredicate);
  console.log(`  By Extractor:`, stats.byExtractor);

  console.log('\n🔎 Query 1: All married_to relations');
  const married = query(relations, entities, { predicate: 'married_to' });
  console.log(`  Found ${married.length} relations`);
  for (const rel of married) {
    const subj = entities.find(e => e.id === rel.subj)?.canonical;
    const obj = entities.find(e => e.id === rel.obj)?.canonical;
    console.log(`    ${subj} → ${obj} (conf: ${rel.confidence.toFixed(3)})`);
  }

  console.log('\n🔎 Query 2: Relations with time qualifier');
  const withTime = query(relations, entities, { time: '3019' });
  console.log(`  Found ${withTime.length} relations with time=3019`);
  for (const rel of withTime) {
    const subj = entities.find(e => e.id === rel.subj)?.canonical;
    const obj = entities.find(e => e.id === rel.obj)?.canonical;
    console.log(`    ${rel.pred}(${subj} → ${obj})`);
  }

  console.log('\n🔎 Query 3: Relations involving "Gandalf"');
  const gandalf = query(relations, entities, { subjectName: 'Gandalf' });
  console.log(`  Found ${gandalf.length} relations with Gandalf as subject`);
  for (const rel of gandalf) {
    const subj = entities.find(e => e.id === rel.subj)?.canonical;
    const obj = entities.find(e => e.id === rel.obj)?.canonical;
    console.log(`    ${rel.pred}(${subj} → ${obj})`);
  }

  console.log('\n📤 Export Samples:');

  console.log('\n--- CSV ---');
  const csv = toCSV(relations, entities);
  console.log(csv.split('\n').slice(0, 3).join('\n'));  // Show first 3 lines
  console.log('  ...');

  console.log('\n--- JSON ---');
  const json = toJSON(relations, entities);
  console.log(JSON.stringify(json, null, 2).split('\n').slice(0, 15).join('\n'));
  console.log('  ...');

  console.log('\n--- DOT (Graphviz) ---');
  const dot = toDOT(relations, entities);
  console.log(dot.split('\n').slice(0, 10).join('\n'));
  console.log('  ...');

  console.log('\n✅ Phase 3 Demo Complete!');
}

demo().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
