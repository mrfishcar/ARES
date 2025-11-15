/**
 * Quick verification script for pronoun handling fix
 * Run with: npx ts-node tests/verify-pronoun-fix.ts
 */

import { extractFromSegments } from '../app/engine/extract/orchestrator';
import { mergeEntitiesAcrossDocs } from '../app/engine/merge';
import { isPronoun } from '../app/engine/pronoun-utils';

async function verifyPronounFix() {
  console.log('🔍 Verifying pronoun handling fix...\n');

  // Test 1: Pronouns should NOT be in entity.aliases
  console.log('Test 1: Pronouns should NOT be in entity.aliases');
  const text1 = 'Frederick walked to the house. He knocked on the door. He entered the house.';
  const result1 = await extractFromSegments('test1', text1);

  const frederick = result1.entities.find(e =>
    e.canonical.toLowerCase().includes('frederick')
  );

  if (!frederick) {
    console.log('❌ FAIL: Frederick entity not found');
    return false;
  }

  const pronounsInAliases = frederick.aliases.filter(alias => isPronoun(alias));

  if (pronounsInAliases.length > 0) {
    console.log(`❌ FAIL: Found pronouns in aliases: ${pronounsInAliases.join(', ')}`);
    console.log(`   Frederick.aliases: ${frederick.aliases.join(', ')}`);
    return false;
  }

  console.log(`✅ PASS: No pronouns in Frederick's aliases`);
  console.log(`   Frederick.aliases: ${frederick.aliases.join(', ') || '(empty)'}\n`);

  // Test 2: Cross-document merge should NOT merge different male entities
  console.log('Test 2: Cross-document merge should NOT merge different male entities');
  const doc1 = 'Frederick walked. He knocked.';
  const doc2 = 'Saul appeared. He spoke.';

  const resultA = await extractFromSegments('doc1', doc1);
  const resultB = await extractFromSegments('doc2', doc2);

  // Verify no pronouns in either entity's aliases
  const frederickA = resultA.entities.find(e => e.canonical.toLowerCase().includes('frederick'));
  const saulB = resultB.entities.find(e => e.canonical.toLowerCase().includes('saul'));

  if (!frederickA || !saulB) {
    console.log(`❌ FAIL: Entities not found (Frederick: ${!!frederickA}, Saul: ${!!saulB})`);
    return false;
  }

  const fredPronouns = frederickA.aliases.filter(isPronoun);
  const saulPronouns = saulB.aliases.filter(isPronoun);

  if (fredPronouns.length > 0 || saulPronouns.length > 0) {
    console.log(`❌ FAIL: Found pronouns before merge`);
    console.log(`   Frederick: ${fredPronouns.join(', ')}`);
    console.log(`   Saul: ${saulPronouns.join(', ')}`);
    return false;
  }

  // Merge entities
  const allEntities = [...resultA.entities, ...resultB.entities];
  const mergeResult = mergeEntitiesAcrossDocs(allEntities);

  const personClusters = mergeResult.globals.filter(e => e.type === 'PERSON');

  console.log(`   Before merge: ${allEntities.filter(e => e.type === 'PERSON').length} PERSON entities`);
  console.log(`   After merge: ${personClusters.length} PERSON clusters`);

  // Frederick and Saul should remain separate (at least 2 PERSON entities)
  if (personClusters.length < 2) {
    console.log(`❌ FAIL: Entities merged incorrectly (expected ≥2, got ${personClusters.length})`);
    console.log(`   Merged entities: ${personClusters.map(e => e.canonical).join(', ')}`);
    return false;
  }

  // Verify they're actually different entities
  const frederickCluster = personClusters.find(e =>
    e.canonical.toLowerCase().includes('frederick') ||
    e.aliases.some(a => a.toLowerCase().includes('frederick'))
  );

  const saulCluster = personClusters.find(e =>
    e.canonical.toLowerCase().includes('saul') ||
    e.aliases.some(a => a.toLowerCase().includes('saul'))
  );

  if (!frederickCluster || !saulCluster) {
    console.log(`❌ FAIL: Could not find both entities in merge result`);
    return false;
  }

  if (frederickCluster.id === saulCluster.id) {
    console.log(`❌ FAIL: Frederick and Saul merged into same entity!`);
    return false;
  }

  console.log(`✅ PASS: Frederick and Saul remain separate entities`);
  console.log(`   Frederick cluster: ${frederickCluster.canonical}`);
  console.log(`   Saul cluster: ${saulCluster.canonical}\n`);

  // Test 3: Same entity across documents should still merge correctly
  console.log('Test 3: Same entity should still merge correctly across documents');
  const docX = 'Frederick walked to the house.';
  const docY = 'Frederick entered the building.';

  const resultX = await extractFromSegments('docX', docX);
  const resultY = await extractFromSegments('docY', docY);

  const allEntities2 = [...resultX.entities, ...resultY.entities];
  const mergeResult2 = mergeEntitiesAcrossDocs(allEntities2);

  const frederickClusters = mergeResult2.globals.filter(e =>
    e.canonical.toLowerCase().includes('frederick') ||
    e.aliases.some(a => a.toLowerCase().includes('frederick'))
  );

  if (frederickClusters.length !== 1) {
    console.log(`❌ FAIL: Frederick not merged correctly (expected 1 cluster, got ${frederickClusters.length})`);
    return false;
  }

  console.log(`✅ PASS: Frederick correctly merged into single entity\n`);

  return true;
}

// Run verification
verifyPronounFix()
  .then(success => {
    if (success) {
      console.log('🎉 All pronoun handling tests passed!');
      console.log('✅ Pronouns are no longer stored in entity.aliases');
      console.log('✅ Cross-document merge works without pronoun-based false positives\n');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Error running tests:', err);
    process.exit(1);
  });
