/**
 * Test Fuzzy Matching & Historical Variants
 *
 * Tests the system's ability to handle:
 * 1. Fuzzy matching (partial names, typos)
 * 2. Older English variants (archaic spellings)
 * 3. Historical name variations
 * 4. Titles and honorifics
 * 5. Victorian/Biblical era names
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { getHERTQuery } from './app/api/hert-query';
import { getEIDRegistry } from './app/engine/eid-registry';
import { getAliasRegistry } from './app/engine/alias-registry';
import { DEFAULT_LLM_CONFIG } from './app/engine/llm-config';

// Test documents with historical and archaic English
const VICTORIAN_TEXT = `
Mr. Sherlock Holmes sat in his armchair at Baker Street. Dr. Watson entered the room.
"Good morning, Holmes," said Watson cheerfully. "What case occupies your mind today?"
Holmes replied, "My dear Watson, I have received a letter from Inspector Lestrade of Scotland Yard.
A most curious affair involving the theft of the Crown Jewels. The thief, one Jonathan Small,
was seen near Westminster Abbey last night."
`;

const ARCHAIC_TEXT = `
Aragorn son of Arathorn journeyed to Rivendell. There he met Gandalf the Grey, who spake unto him
of great tidings. "The Ring of Power must be destroyed," quoth Gandalf. "Thou art the rightful
heir to the throne of Gondor." Aragorn replied, "I shall not forsake this quest, though it cost me
my life." Elrond Half-elven held counsel with them both.
`;

const BIBLICAL_TEXT = `
In those days, Jesus of Nazareth came to the Jordan River where John the Baptist was preaching.
And John said unto the people, "Behold the Lamb of God!" Jesus was baptised in the waters of Jordan.
After this, Jesus went into the wilderness for forty days. The disciples followed him, including
Peter, James, and John. Mary Magdalene also travelled with them.
`;

const MIXED_VARIANTS_TEXT = `
Professor James Moriarty was Holmes's greatest adversary. The professor taught mathematics at
Oxford before turning to crime. Holmes and Watson pursued Moriarty to Switzerland. At Reichenbach Falls,
the two men faced each other. Dr. Watson feared for Holmes's life. Sherlock Holmes and James Moriarty
fell together into the abyss.
`;

async function testFuzzyAndVariants() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Fuzzy Matching & Historical Variants Test             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Initialize registries
  const eidRegistry = getEIDRegistry('./data/test-fuzzy-eid.json');
  const aliasRegistry = getAliasRegistry('./data/test-fuzzy-alias.json');

  aliasRegistry.clear();

  const queryAPI = getHERTQuery();

  // === Test 1: Victorian Names & Titles ===
  console.log('═══ Test 1: Victorian Names & Titles ===\n');

  const result1 = await extractFromSegments(
    'victorian.txt',
    VICTORIAN_TEXT,
    undefined,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: true, autoSaveHERTs: true }
  );

  console.log(`✅ Extracted ${result1.entities.length} entities from Victorian text\n`);

  queryAPI.loadRelations(result1.relations, result1.entities);

  // Test exact match
  console.log('Exact matches:');
  const holmesExact = queryAPI.findEntityByName('Sherlock Holmes');
  console.log(`  "Sherlock Holmes": ${holmesExact.length} results`);
  holmesExact.forEach(e => {
    console.log(`    - ${e.canonical} (EID ${e.eid}, ${e.mention_count} mentions)`);
    if (e.aliases.length > 0) {
      console.log(`      Aliases: ${e.aliases.join(', ')}`);
    }
  });

  // Test fuzzy match - partial name
  console.log('\nFuzzy searches (partial names):');
  const holmesFuzzy = queryAPI.findEntityByName('Holmes', { fuzzy: true });
  console.log(`  "Holmes": ${holmesFuzzy.length} results`);
  holmesFuzzy.slice(0, 5).forEach(e => {
    console.log(`    - ${e.canonical} (EID ${e.eid}, ${e.mention_count} mentions)`);
  });

  const watsonFuzzy = queryAPI.findEntityByName('Watson', { fuzzy: true });
  console.log(`\n  "Watson": ${watsonFuzzy.length} results`);
  watsonFuzzy.slice(0, 5).forEach(e => {
    console.log(`    - ${e.canonical} (EID ${e.eid}, ${e.mention_count} mentions)`);
  });

  // Test title variations
  console.log('\nTitle variations:');
  const mrHolmes = queryAPI.findEntityByName('Mr. Sherlock Holmes', { fuzzy: true });
  console.log(`  "Mr. Sherlock Holmes": ${mrHolmes.length} results`);
  const drWatson = queryAPI.findEntityByName('Dr. Watson', { fuzzy: true });
  console.log(`  "Dr. Watson": ${drWatson.length} results`);

  console.log('');

  // === Test 2: Archaic English (LotR Style) ===
  console.log('═══ Test 2: Archaic English Names ===\n');

  const result2 = await extractFromSegments(
    'archaic.txt',
    ARCHAIC_TEXT,
    result1.profiles,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: true, autoSaveHERTs: true }
  );

  console.log(`✅ Extracted ${result2.entities.length} entities from archaic text\n`);

  queryAPI.loadRelations(result2.relations, result2.entities);

  // Test patronymic names
  console.log('Patronymic names:');
  const aragorn = queryAPI.findEntityByName('Aragorn', { fuzzy: true });
  console.log(`  "Aragorn": ${aragorn.length} results`);
  aragorn.forEach(e => {
    console.log(`    - ${e.canonical} (EID ${e.eid})`);
    if (e.aliases.length > 0) {
      console.log(`      Aliases: ${e.aliases.join(', ')}`);
    }
  });

  // Test epithet names
  console.log('\nEpithet names:');
  const gandalf = queryAPI.findEntityByName('Gandalf', { fuzzy: true });
  console.log(`  "Gandalf": ${gandalf.length} results`);
  gandalf.forEach(e => {
    console.log(`    - ${e.canonical} (EID ${e.eid})`);
    if (e.aliases.length > 0) {
      console.log(`      Aliases: ${e.aliases.join(', ')}`);
    }
  });

  const elrond = queryAPI.findEntityByName('Elrond', { fuzzy: true });
  console.log(`\n  "Elrond": ${elrond.length} results`);
  elrond.forEach(e => {
    console.log(`    - ${e.canonical} (EID ${e.eid})`);
  });

  console.log('');

  // === Test 3: Biblical Names ===
  console.log('═══ Test 3: Biblical/Historical Names ===\n');

  const result3 = await extractFromSegments(
    'biblical.txt',
    BIBLICAL_TEXT,
    result2.profiles,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: true, autoSaveHERTs: true }
  );

  console.log(`✅ Extracted ${result3.entities.length} entities from biblical text\n`);

  queryAPI.loadRelations(result3.relations, result3.entities);

  // Test biblical name forms
  console.log('Biblical name forms:');
  const jesus = queryAPI.findEntityByName('Jesus', { fuzzy: true });
  console.log(`  "Jesus": ${jesus.length} results`);
  jesus.forEach(e => {
    console.log(`    - ${e.canonical} (EID ${e.eid})`);
    if (e.aliases.length > 0) {
      console.log(`      Aliases: ${e.aliases.join(', ')}`);
    }
  });

  const john = queryAPI.findEntityByName('John', { fuzzy: true });
  console.log(`\n  "John": ${john.length} results (may include multiple Johns)`);
  john.slice(0, 5).forEach(e => {
    console.log(`    - ${e.canonical} (EID ${e.eid}, Type: ${e.type || 'unknown'})`);
    const senses = e.senses.length > 1 ? ` [${e.senses.length} senses]` : '';
    console.log(`      ${senses}`);
  });

  console.log('');

  // === Test 4: Name Variants & Aliases ===
  console.log('═══ Test 4: Multiple Name Forms (Aliases) ===\n');

  const result4 = await extractFromSegments(
    'variants.txt',
    MIXED_VARIANTS_TEXT,
    result3.profiles,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: true, autoSaveHERTs: true }
  );

  console.log(`✅ Extracted ${result4.entities.length} entities\n`);

  queryAPI.loadRelations(result4.relations, result4.entities);

  // Check if system recognized multiple forms of same person
  console.log('Testing alias recognition (should be same entity):');

  const searches = [
    'Holmes',
    'Sherlock Holmes',
    'Moriarty',
    'James Moriarty',
    'Professor Moriarty'
  ];

  for (const searchTerm of searches) {
    const results = queryAPI.findEntityByName(searchTerm, { fuzzy: true });
    console.log(`\n  "${searchTerm}": ${results.length} results`);
    results.slice(0, 3).forEach(e => {
      console.log(`    - ${e.canonical} (EID ${e.eid})`);
      if (e.aliases.length > 0) {
        console.log(`      Aliases: ${e.aliases.join(', ')}`);
      }
    });
  }

  console.log('');

  // === Test 5: Fuzzy Matching Quality ===
  console.log('═══ Test 5: Fuzzy Matching Quality ===\n');

  const fuzzyTests = [
    { query: 'Aragorn', expected: 'Aragorn' },
    { query: 'Gandalf', expected: 'Gandalf' },
    { query: 'Holmes', expected: 'Holmes' },
    { query: 'Watson', expected: 'Watson' },
    { query: 'Jesus', expected: 'Jesus' },
    { query: 'Elrond', expected: 'Elrond' }
  ];

  let fuzzySuccessCount = 0;
  const fuzzyTotal = fuzzyTests.length;

  for (const test of fuzzyTests) {
    const results = queryAPI.findEntityByName(test.query, { fuzzy: true });
    const found = results.some(r => r.canonical.toLowerCase().includes(test.expected.toLowerCase()));

    if (found) {
      console.log(`  ✅ "${test.query}" → Found "${test.expected}"`);
      fuzzySuccessCount++;
    } else {
      console.log(`  ❌ "${test.query}" → Expected "${test.expected}", got ${results.length} results`);
      if (results.length > 0) {
        console.log(`     Results: ${results.slice(0, 3).map(r => r.canonical).join(', ')}`);
      }
    }
  }

  const fuzzySuccessPercent = (fuzzySuccessCount / fuzzyTotal * 100);
  const fuzzySuccessRate = fuzzySuccessPercent.toFixed(1);
  console.log(`\n  Fuzzy matching success rate: ${fuzzySuccessRate}% (${fuzzySuccessCount}/${fuzzyTotal})`);

  console.log('');

  // === Test 6: Cross-Document Entity Tracking ===
  console.log('═══ Test 6: Cross-Document Entity Tracking ===\n');

  // Holmes appears in multiple documents - check if tracked as same entity
  const allHolmes = queryAPI.findEntityByName('Holmes', { fuzzy: true });
  const holmesWithMultipleDocs = allHolmes.filter(e => e.document_count > 1);

  console.log(`Entities appearing in multiple documents:`);
  if (holmesWithMultipleDocs.length > 0) {
    holmesWithMultipleDocs.forEach(e => {
      console.log(`  ✅ ${e.canonical}: ${e.mention_count} mentions across ${e.document_count} documents`);
    });
  } else {
    console.log(`  (No entities found in multiple test documents)`);
  }

  console.log('');

  // === Summary ===
  console.log('═══ Test Summary ===\n');

  const globalStats = queryAPI.getGlobalStats();

  console.log('📊 Final Statistics:');
  console.log(`  Total entities: ${globalStats.total_entities}`);
  console.log(`  Total aliases: ${globalStats.total_aliases}`);
  console.log(`  Total senses: ${globalStats.total_senses}`);
  console.log(`  Total HERTs: ${globalStats.total_herts}`);
  console.log(`  Total documents: ${globalStats.total_documents}`);
  console.log(`  Total relationships: ${globalStats.total_relationships}\n`);

  console.log('✅ Features Tested:');
  console.log('  1. Victorian-era names and titles (Mr., Dr.)');
  console.log('  2. Archaic English patronymics (Aragorn son of Arathorn)');
  console.log('  3. Fantasy epithets (Gandalf the Grey, Elrond Half-elven)');
  console.log('  4. Biblical historical names (Jesus of Nazareth, John the Baptist)');
  console.log('  5. Fuzzy partial name matching');
  console.log('  6. Alias recognition (multiple forms of same entity)');
  console.log('  7. Cross-document entity tracking\n');

  if (fuzzySuccessPercent >= 80) {
    console.log(`🎉 Fuzzy matching is working well (${fuzzySuccessRate}% success rate)!\n`);
  } else {
    console.log(`⚠️  Fuzzy matching needs improvement (${fuzzySuccessRate}% success rate)\n`);
  }

  // Cleanup
  eidRegistry.save();
  aliasRegistry.save();
}

testFuzzyAndVariants().catch(console.error);
