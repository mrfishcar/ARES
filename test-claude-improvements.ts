/**
 * Test script to verify Claude's improvements
 * Tests: Canonical name selection, alias extraction, coreference
 */

import { mergeEntitiesAcrossDocs } from './app/engine/merge.js';
import { extractEntities } from './app/engine/extract/orchestrator.js';
import type { Entity } from './app/engine/schema.js';

console.log('='.repeat(80));
console.log('TESTING CLAUDE\'S IMPROVEMENTS');
console.log('='.repeat(80));
console.log();

// ============================================================================
// TEST 1: Canonical Name Selection - Proper Names vs Descriptive Titles
// ============================================================================
console.log('TEST 1: Canonical Name Selection');
console.log('-'.repeat(80));

const test1Entities: Entity[] = [
  {
    id: 'e1',
    type: 'PERSON',
    canonical: 'Aragorn',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  },
  {
    id: 'e2',
    type: 'PERSON',
    canonical: 'the king',
    aliases: ['the king of Gondor'],
    created_at: new Date().toISOString(),
    centrality: 1.0
  },
  {
    id: 'e3',
    type: 'PERSON',
    canonical: 'Aragorn son of Arathorn',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  }
];

const test1Result = mergeEntitiesAcrossDocs(test1Entities);
const test1Canonical = test1Result.globals[0]?.canonical;

console.log(`Input entities:`);
console.log(`  - "Aragorn" (proper name)`);
console.log(`  - "the king" (descriptive title)`);
console.log(`  - "Aragorn son of Arathorn" (full proper name)`);
console.log();
console.log(`Merged canonical: "${test1Canonical}"`);
console.log(`Expected: "Aragorn" or "Aragorn son of Arathorn" (prefer proper names)`);
console.log();

const test1Pass = test1Canonical && !test1Canonical.toLowerCase().includes('king');
console.log(`Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'} - ${test1Pass ? 'Proper name preferred over descriptive title' : 'Descriptive title incorrectly chosen'}`);
console.log();

// ============================================================================
// TEST 2: Verb Filtering - Reject Names with Verbs
// ============================================================================
console.log('TEST 2: Verb Filtering');
console.log('-'.repeat(80));

const test2Entities: Entity[] = [
  {
    id: 'e1',
    type: 'PERSON',
    canonical: 'Gandalf',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  },
  {
    id: 'e2',
    type: 'PERSON',
    canonical: 'the wizard',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  },
  {
    id: 'e3',
    type: 'PERSON',
    canonical: 'he teaches',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  }
];

const test2Result = mergeEntitiesAcrossDocs(test2Entities);
const test2Canonical = test2Result.globals[0]?.canonical;

console.log(`Input entities:`);
console.log(`  - "Gandalf" (proper name)`);
console.log(`  - "the wizard" (descriptive title)`);
console.log(`  - "he teaches" (contains verb - should be rejected)`);
console.log();
console.log(`Merged canonical: "${test2Canonical}"`);
console.log(`Expected: "Gandalf" (proper name, no verbs)`);
console.log();

const test2Pass = test2Canonical === 'Gandalf';
console.log(`Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'} - ${test2Pass ? 'Verb-containing names filtered correctly' : 'Verb filtering failed'}`);
console.log();

// ============================================================================
// TEST 3: Pronoun Rejection
// ============================================================================
console.log('TEST 3: Pronoun Rejection');
console.log('-'.repeat(80));

const test3Entities: Entity[] = [
  {
    id: 'e1',
    type: 'PERSON',
    canonical: 'Harry Potter',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  },
  {
    id: 'e2',
    type: 'PERSON',
    canonical: 'he',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  },
  {
    id: 'e3',
    type: 'PERSON',
    canonical: 'him',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  }
];

const test3Result = mergeEntitiesAcrossDocs(test3Entities);
const test3Canonical = test3Result.globals[0]?.canonical;

console.log(`Input entities:`);
console.log(`  - "Harry Potter" (proper name)`);
console.log(`  - "he" (pronoun - should be rejected)`);
console.log(`  - "him" (pronoun - should be rejected)`);
console.log();
console.log(`Merged canonical: "${test3Canonical}"`);
console.log(`Expected: "Harry Potter" (pronouns rejected)`);
console.log();

const test3Pass = test3Canonical === 'Harry Potter';
console.log(`Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'} - ${test3Pass ? 'Pronouns correctly rejected' : 'Pronoun rejection failed'}`);
console.log();

// ============================================================================
// TEST 4: Full ARES Pipeline - Canonical Names in Extraction
// ============================================================================
async function test4() {
  console.log('TEST 4: Full ARES Pipeline - Canonical Name Quality');
  console.log('-'.repeat(80));

  const test4Text = `Aragorn, the king of Gondor, married Arwen. The king ruled wisely for many years. Gandalf the wizard visited him often.`;

  console.log(`Input text:`);
  console.log(`"${test4Text}"`);
  console.log();
  console.log('Extracting entities...');

  try {
    const test4Result = await extractEntities(test4Text);

  console.log(`\nExtracted entities (${test4Result.entities.length}):`);
  for (const entity of test4Result.entities) {
    console.log(`  - ${entity.type}: "${entity.canonical}"`);
    if (entity.aliases.length > 0) {
      console.log(`    Aliases: ${entity.aliases.map(a => `"${a}"`).join(', ')}`);
    }
  }

  // Check for proper canonical names
  const personEntities = test4Result.entities.filter(e => e.type === 'PERSON');
  const hasProperNames = personEntities.every(e => {
    const canonical = e.canonical.toLowerCase();
    return !canonical.includes('ruled') &&
           !canonical.includes('teaches') &&
           !(canonical === 'he' || canonical === 'him' || canonical === 'she');
  });

    console.log();
    console.log(`Result: ${hasProperNames ? '✅ PASS' : '❌ FAIL'} - ${hasProperNames ? 'All canonical names are proper (no verbs/pronouns)' : 'Some canonical names contain verbs or are pronouns'}`);

  } catch (error) {
    console.log(`❌ FAIL - Extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  console.log();
}

// ============================================================================
// TEST 5: Alias Extraction - Pattern Detection
// ============================================================================
async function test5() {
  console.log('TEST 5: Alias Extraction - Pattern Detection');
  console.log('-'.repeat(80));

  const test5Text = `James Wilson, called Jim by his friends, is a doctor. Jim works at the hospital.`;

  console.log(`Input text:`);
  console.log(`"${test5Text}"`);
  console.log();
  console.log('Extracting entities with alias patterns...');

  try {
    const test5Result = await extractEntities(test5Text);

  const jamesEntity = test5Result.entities.find(e =>
    e.canonical.toLowerCase().includes('james') ||
    e.canonical.toLowerCase().includes('jim')
  );

    if (jamesEntity) {
      console.log(`\nFound entity: "${jamesEntity.canonical}"`);
      console.log(`Aliases: ${jamesEntity.aliases.length > 0 ? jamesEntity.aliases.map(a => `"${a}"`).join(', ') : 'None'}`);
      console.log();

      const hasJimAlias = jamesEntity.aliases.some(a => a.toLowerCase().includes('jim')) ||
                          jamesEntity.canonical.toLowerCase().includes('jim');
      const hasJamesAlias = jamesEntity.aliases.some(a => a.toLowerCase().includes('james')) ||
                            jamesEntity.canonical.toLowerCase().includes('james');

      const test5Pass = hasJimAlias && hasJamesAlias;
      console.log(`Result: ${test5Pass ? '✅ PASS' : '❌ FAIL'} - ${test5Pass ? 'Alias pattern "called" detected and merged' : 'Alias pattern not detected'}`);
    } else {
      console.log(`\n❌ FAIL - No entity found for James/Jim`);
    }

  } catch (error) {
    console.log(`❌ FAIL - Extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  console.log();
}

// ============================================================================
// TEST 6: Merge Confidence Tracking
// ============================================================================
console.log('TEST 6: Merge Confidence Tracking');
console.log('-'.repeat(80));

const test6Entities: Entity[] = [
  {
    id: 'e1',
    type: 'PERSON',
    canonical: 'David',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  },
  {
    id: 'e2',
    type: 'PERSON',
    canonical: 'King David',
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1.0
  }
];

const test6Result = mergeEntitiesAcrossDocs(test6Entities);

console.log(`Input entities: "David", "King David"`);
console.log(`Merged into: ${test6Result.globals.length} cluster(s)`);
console.log();
console.log(`Merge statistics:`);
console.log(`  Total entities: ${test6Result.stats.total_entities}`);
console.log(`  Merged clusters: ${test6Result.stats.merged_clusters}`);
console.log(`  Avg confidence: ${(test6Result.stats.avg_confidence * 100).toFixed(1)}%`);
console.log(`  Low confidence (<70%): ${test6Result.stats.low_confidence_count}`);
console.log();

const test6Pass = test6Result.decisions.length > 0 &&
                  test6Result.decisions.every(d => d.confidence !== undefined);
console.log(`Result: ${test6Pass ? '✅ PASS' : '❌ FAIL'} - ${test6Pass ? 'Confidence tracking working' : 'Confidence tracking missing'}`);
console.log();

// ============================================================================
// MAIN - Run all tests
// ============================================================================
async function main() {
  // Run async tests
  await test4();
  await test5();

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log('Claude\'s claimed improvements:');
  console.log('  1. ✓ Prefer proper names over descriptive titles');
  console.log('  2. ✓ Filter out verbs from canonical names');
  console.log('  3. ✓ Reject pronouns as canonical names');
  console.log('  4. ✓ Pattern-based alias extraction');
  console.log('  5. ✓ Coreference resolution integration');
  console.log('  6. ✓ Merge confidence tracking');
  console.log();
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
