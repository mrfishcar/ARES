/**
 * Quick Fuzzy Matching Test
 * Tests fuzzy search on existing HERT data (no extraction needed)
 */

import { getHERTQuery } from './app/api/hert-query';
import type { EntityType } from './app/engine/schema';

async function testFuzzyQuick() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Quick Fuzzy Matching Test (Existing Data)             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const queryAPI = getHERTQuery();

  // Get global stats
  const stats = queryAPI.getGlobalStats();
  console.log('📊 Current System Data:');
  console.log(`   Total entities: ${stats.total_entities}`);
  console.log(`   Total HERTs: ${stats.total_herts}`);
  console.log(`   Total documents: ${stats.total_documents}\n`);

  if (stats.total_entities === 0) {
    console.log('⚠️  No entities in system. Run extraction first.\n');
    return;
  }

  // === Test 1: Fuzzy Search Examples ===
  console.log('═══ Test 1: Fuzzy Search Examples ===\n');

  const searchTerms = [
    'Sarah',
    'James',
    'Morrison',
    'Chen',
    'Washington',
    'Professor',
    'University',
    'Google',
    'Apple',
    'Jordan'
  ];

  for (const term of searchTerms) {
    const results = queryAPI.findEntityByName(term, { fuzzy: true });

    if (results.length > 0) {
      console.log(`✅ "${term}" → ${results.length} results`);
      results.slice(0, 3).forEach(r => {
        console.log(`   - ${r.canonical} (EID ${r.eid}, ${r.mention_count} mentions)`);
      });
      if (results.length > 3) {
        console.log(`   ... and ${results.length - 3} more`);
      }
    } else {
      console.log(`   "${term}" → No results`);
    }
    console.log('');
  }

  // === Test 2: Type Filtering ===
  console.log('═══ Test 2: Entity Type Distribution ===\n');

  const types: EntityType[] = ['PERSON', 'ORG', 'PLACE', 'DATE', 'ITEM', 'EVENT'];

  for (const type of types) {
    const entities = queryAPI.findEntitiesByType(type);
    if (entities.length > 0) {
      console.log(`${type}: ${entities.length} entities`);
      entities.slice(0, 5).forEach(e => {
        console.log(`   - ${e.canonical} (${e.mention_count} mentions)`);
      });
      if (entities.length > 5) {
        console.log(`   ... and ${entities.length - 5} more`);
      }
      console.log('');
    }
  }

  // === Test 3: Partial Name Matching ===
  console.log('═══ Test 3: Partial Name Matching Quality ===\n');

  const partialTests = [
    { query: 'son', desc: 'ends with "son"' },
    { query: 'Dr', desc: 'title "Dr"' },
    { query: 'Mr', desc: 'title "Mr"' },
    { query: 'University', desc: 'contains "University"' },
    { query: 'the', desc: 'contains "the"' }
  ];

  for (const test of partialTests) {
    const results = queryAPI.findEntityByName(test.query, { fuzzy: true });
    console.log(`"${test.query}" (${test.desc}): ${results.length} results`);
    results.slice(0, 3).forEach(r => {
      console.log(`   - ${r.canonical}`);
    });
    if (results.length > 3) {
      console.log(`   ... and ${results.length - 3} more`);
    }
    console.log('');
  }

  // === Test 4: Cross-Document Entities ===
  console.log('═══ Test 4: Cross-Document Entity Tracking ===\n');

  const allPeople = queryAPI.findEntitiesByType('PERSON');
  const multiDocPeople = allPeople.filter(e => e.document_count > 1);

  if (multiDocPeople.length > 0) {
    console.log(`✅ Found ${multiDocPeople.length} entities appearing in multiple documents:\n`);
    multiDocPeople.slice(0, 10).forEach(e => {
      console.log(`   ${e.canonical}: ${e.mention_count} mentions across ${e.document_count} documents`);
    });
  } else {
    console.log('   No entities found in multiple documents (normal for single-document tests)\n');
  }

  // === Summary ===
  console.log('═══ Summary ===\n');

  console.log('✅ Fuzzy Matching Capabilities Tested:');
  console.log('   1. Substring matching (partial names)');
  console.log('   2. Type filtering (PERSON, ORG, PLACE, etc.)');
  console.log('   3. Cross-document tracking');
  console.log('   4. Multiple result handling\n');

  const totalSearched = searchTerms.length;
  const foundCount = searchTerms.filter(term =>
    queryAPI.findEntityByName(term, { fuzzy: true }).length > 0
  ).length;
  const successRate = (foundCount / totalSearched * 100).toFixed(1);

  console.log(`📊 Search success rate: ${successRate}% (${foundCount}/${totalSearched} terms found)\n`);

  if (parseFloat(successRate) >= 50) {
    console.log('🎉 Fuzzy matching is working!\n');
  } else {
    console.log('⚠️  Low success rate - may need more data in system\n');
  }
}

testFuzzyQuick().catch(console.error);
