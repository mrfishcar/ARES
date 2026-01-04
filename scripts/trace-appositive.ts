/**
 * Trace where "Andrew Beauregard" disappears in the pipeline
 *
 * Expected: "his father, Andrew Beauregard" should extract PERSON: Andrew Beauregard
 */

import { extractEntities } from '../app/engine/extract/entities';

const TEST_TEXT = `He had not spoken face to face with his father, Andrew Beauregard, for thirty-two days.`;

async function main() {
  console.log('='.repeat(60));
  console.log('APPOSITIVE TRACE TEST');
  console.log('='.repeat(60));
  console.log('\nInput text:');
  console.log(`"${TEST_TEXT}"\n`);

  // Step 1: Check if the appositive pattern matches
  console.log('--- STEP 1: Pattern Matching ---');
  const appositivePattern = /\b(?:his|her|their)\s+(?:father|mother|brother|sister|son|daughter|uncle|aunt|cousin|grandfather|grandmother|husband|wife),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let match;
  while ((match = appositivePattern.exec(TEST_TEXT)) !== null) {
    console.log(`✅ Pattern matched: "${match[0]}"`);
    console.log(`   Captured name: "${match[1]}"`);
  }

  // Step 2: Run extractEntities (the core extraction)
  console.log('\n--- STEP 2: Core Entity Extraction (extractEntities) ---');
  const result = await extractEntities(TEST_TEXT);

  console.log(`\nRaw entities from extractEntities (${result.entities.length}):`);
  for (const e of result.entities) {
    console.log(`  - "${e.canonical}" (${e.type}) [id=${e.id.slice(0,8)}...]`);
    if (e.aliases?.length) {
      console.log(`    aliases: [${e.aliases.join(', ')}]`);
    }
  }

  console.log(`\nRaw spans from extractEntities (${result.spans.length}):`);
  for (const s of result.spans) {
    const text = TEST_TEXT.slice(s.start, s.end);
    console.log(`  - [${s.start},${s.end}] "${text}" → entity ${s.entity_id.slice(0,8)}...`);
  }

  // Step 3: Check if "Andrew Beauregard" is in the results
  console.log('\n--- STEP 3: Check for Expected Entity ---');
  const hasAndrewBeauregard = result.entities.some(e =>
    e.canonical.toLowerCase().includes('andrew beauregard') ||
    e.canonical.toLowerCase() === 'andrew beauregard'
  );
  const hasAndrew = result.entities.some(e =>
    e.canonical.toLowerCase() === 'andrew'
  );
  const hasBeauregard = result.entities.some(e =>
    e.canonical.toLowerCase() === 'beauregard'
  );

  console.log(`  "Andrew Beauregard" found: ${hasAndrewBeauregard ? '✅ YES' : '❌ NO'}`);
  console.log(`  "Andrew" found separately: ${hasAndrew ? '⚠️ YES (split!)' : 'NO'}`);
  console.log(`  "Beauregard" found separately: ${hasBeauregard ? '⚠️ YES (split!)' : 'NO'}`);

  // Step 4: Check meta information
  console.log('\n--- STEP 4: Extraction Meta ---');
  if (result.meta) {
    console.log(`  classifierRejected: ${result.meta.classifierRejected}`);
    console.log(`  contextOnlyMentions: ${result.meta.contextOnlyMentions}`);
    console.log(`  durableMentions: ${result.meta.durableMentions}`);
    console.log(`  rejectedMentions: ${result.meta.rejectedMentions}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSIS:');
  if (!hasAndrewBeauregard && (hasAndrew || hasBeauregard)) {
    console.log('⚠️  Name is being split into parts by spaCy NER');
    console.log('   The appositive pattern should merge these back');
  } else if (!hasAndrewBeauregard && !hasAndrew && !hasBeauregard) {
    console.log('❌ spaCy is not recognizing any part of the name');
    console.log('   Need pattern-based extraction to catch it');
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
