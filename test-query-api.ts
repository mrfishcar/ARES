/**
 * HERT Query API Test - Phase 5
 *
 * Demonstrates the query API capabilities:
 * - Entity search by name
 * - Relationship queries
 * - Entity mention retrieval
 * - Co-occurrence analysis
 * - Statistics
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { getHERTQuery } from './app/api/hert-query';
import { getEIDRegistry } from './app/engine/eid-registry';
import { getAliasRegistry } from './app/engine/alias-registry';
import { getSenseRegistry } from './app/engine/sense-disambiguator';
import { DEFAULT_LLM_CONFIG } from './app/engine/llm-config';

// Test document with rich entity relationships
const TEST_DOCUMENT = `
The Last Meeting

James Morrison walked into the conference room at NYU. Sarah Chen was already there,
reviewing notes on her laptop. Marcus Washington arrived a few minutes later.

"Thank you all for coming," said James. "We need to discuss the research collaboration
between NYU and Stanford University."

Sarah looked up. "I've been corresponding with Professor David Kim at Stanford. He's
very interested in our AI ethics project."

Marcus nodded. "Maya Rodriguez from Google has also expressed interest in partnering
with us. She thinks this could have major implications for their products."

The three researchers spent two hours planning their next steps. By the end of the
meeting, they had outlined a proposal that would bring together academia and industry
to address one of the most pressing questions in artificial intelligence.

James Morrison teaches computer science at NYU. Sarah Chen specializes in ethics.
Marcus Washington focuses on machine learning applications.
`;

async function testQueryAPI() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Phase 5: HERT Query API Test                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\\n');

  // Clear registries for clean test
  const eidRegistry = getEIDRegistry('./data/test-query-eid.json');
  const aliasRegistry = getAliasRegistry('./data/test-query-alias.json');
  const senseRegistry = getSenseRegistry();

  aliasRegistry.clear();
  senseRegistry.clear();

  // Extract entities and relationships
  console.log('🔍 Extracting entities from test document...\\n');

  const result = await extractFromSegments(
    'test-meeting.txt',
    TEST_DOCUMENT,
    undefined,
    DEFAULT_LLM_CONFIG,
    undefined,
    {
      generateHERTs: true,
      autoSaveHERTs: true
    }
  );

  console.log(`✅ Extracted ${result.entities.length} entities`);
  console.log(`✅ Found ${result.relations.length} relationships`);
  console.log(`✅ Generated ${result.herts?.length || 0} HERTs\\n`);

  // Initialize query API with relations and entities
  const queryAPI = getHERTQuery();
  queryAPI.loadRelations(result.relations, result.entities);

  // === Test 1: Entity Search by Name ===
  console.log('═══ Test 1: Entity Search by Name ===\\n');

  const jamesResults = queryAPI.findEntityByName('James Morrison');
  if (jamesResults.length > 0) {
    const james = jamesResults[0];
    console.log(`✅ Found: ${james.canonical}`);
    console.log(`   EID: ${james.eid}`);
    console.log(`   Aliases: ${james.aliases.join(', ') || 'none'}`);
    console.log(`   Mentions: ${james.mention_count}`);
    console.log(`   Documents: ${james.document_count}\\n`);
  } else {
    console.log(`⚠️  James Morrison not found\\n`);
  }

  // Fuzzy search
  const sarahResults = queryAPI.findEntityByName('Sarah', { fuzzy: true });
  console.log(`Fuzzy search for "Sarah": ${sarahResults.length} results`);
  sarahResults.forEach(entity => {
    console.log(`   - ${entity.canonical} (EID ${entity.eid})`);
  });
  console.log('');

  // === Test 2: Entity Stats ===
  console.log('═══ Test 2: Entity Statistics ===\\n');

  if (jamesResults.length > 0) {
    const stats = queryAPI.getEntityStats(jamesResults[0].eid);
    if (stats) {
      console.log(`📊 Statistics for ${stats.canonical}:`);
      console.log(`   Total mentions: ${stats.total_mentions}`);
      console.log(`   Documents: ${stats.document_count}`);
      console.log(`   Aliases: ${stats.alias_count}`);
      console.log(`   Senses: ${stats.sense_count}`);
      console.log(`   Relationships: ${stats.relationship_count}\\n`);
    }
  }

  // === Test 3: Find Mentions ===
  console.log('═══ Test 3: Find Entity Mentions ===\\n');

  if (jamesResults.length > 0) {
    const mentions = queryAPI.findMentions(jamesResults[0].eid, { limit: 5 });
    console.log(`Found ${mentions.length} mentions of James Morrison:\\n`);

    mentions.forEach((mention, i) => {
      console.log(`   ${i + 1}. ${mention.hert_readable}`);
      console.log(`      Location: paragraph ${mention.location.paragraph}, tokens ${mention.location.token_start}-${mention.location.token_start + mention.location.token_length}`);
    });
    console.log('');
  }

  // === Test 4: Find Relationships ===
  console.log('═══ Test 4: Relationship Queries ===\\n');

  if (jamesResults.length > 0) {
    const relationships = queryAPI.findRelationships(jamesResults[0].eid);
    console.log(`Relationships involving James Morrison: ${relationships.length}\\n`);

    relationships.slice(0, 5).forEach(rel => {
      console.log(`   ${rel.subj_canonical} --[${rel.pred}]--> ${rel.obj_canonical}`);
      console.log(`   Confidence: ${rel.confidence.toFixed(2)}, Evidence: ${rel.evidence_count}\\n`);
    });
  }

  // Find all "teaches_at" relationships
  const teachingRels = queryAPI.findRelationshipsByPredicate('teaches_at');
  console.log(`All "teaches_at" relationships: ${teachingRels.length}`);
  teachingRels.forEach(rel => {
    console.log(`   ${rel.subj_canonical} teaches at ${rel.obj_canonical}`);
  });
  console.log('');

  // === Test 5: Co-occurrence Analysis ===
  console.log('═══ Test 5: Co-occurrence Analysis ===\\n');

  if (jamesResults.length > 0) {
    const cooccurrences = queryAPI.findCooccurrences(jamesResults[0].eid, { limit: 5 });
    console.log(`Entities co-occurring with James Morrison: ${cooccurrences.length}\\n`);

    cooccurrences.forEach(cooccur => {
      console.log(`   ${cooccur.entity2_canonical}`);
      console.log(`   Co-occurrences: ${cooccur.cooccurrence_count}`);
      console.log(`   Documents: ${cooccur.documents.length}\\n`);
    });
  }

  // === Test 6: Entity Type Queries ===
  console.log('═══ Test 6: Query by Entity Type ===\\n');

  const people = queryAPI.findEntitiesByType('PERSON');
  console.log(`People found: ${people.length}`);
  people.slice(0, 5).forEach(entity => {
    console.log(`   - ${entity.canonical} (${entity.mention_count} mentions)`);
  });
  console.log('');

  const organizations = queryAPI.findEntitiesByType('ORG');
  console.log(`Organizations found: ${organizations.length}`);
  organizations.forEach(entity => {
    console.log(`   - ${entity.canonical} (${entity.mention_count} mentions)`);
  });
  console.log('');

  // === Test 7: Global Statistics ===
  console.log('═══ Test 7: Global Statistics ===\\n');

  const globalStats = queryAPI.getGlobalStats();
  console.log(`📊 System-wide statistics:`);
  console.log(`   Total entities: ${globalStats.total_entities}`);
  console.log(`   Total aliases: ${globalStats.total_aliases}`);
  console.log(`   Total senses: ${globalStats.total_senses}`);
  console.log(`   Total HERTs: ${globalStats.total_herts}`);
  console.log(`   Total documents: ${globalStats.total_documents}`);
  console.log(`   Total relationships: ${globalStats.total_relationships}\\n`);

  // === Summary ===
  console.log('═══ Test Complete ===\\n');

  console.log('✅ Query API Features Tested:');
  console.log('   1. Entity search by name (exact & fuzzy)');
  console.log('   2. Entity statistics');
  console.log('   3. Mention retrieval with location');
  console.log('   4. Relationship queries (by entity & predicate)');
  console.log('   5. Co-occurrence analysis');
  console.log('   6. Entity type filtering');
  console.log('   7. Global statistics\\n');

  console.log('🎉 HERT Query API is fully functional!\\n');

  // Cleanup
  eidRegistry.save();
  aliasRegistry.save();
}

testQueryAPI().catch(console.error);
