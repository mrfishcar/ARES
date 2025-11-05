/**
 * Sense Disambiguation Test - Phase 4
 *
 * Tests SP (Sense Path) assignment for entities with identical names
 * but different meanings (homonyms).
 *
 * Examples:
 * - "Apple" (company) vs "Apple" (fruit)
 * - "Jordan" (person) vs "Jordan" (country)
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { getEIDRegistry } from './app/engine/eid-registry';
import { getAliasRegistry } from './app/engine/alias-registry';
import { getSenseRegistry } from './app/engine/sense-disambiguator';
import { DEFAULT_LLM_CONFIG } from './app/engine/llm-config';

// Test documents with ambiguous entity names

const DOC1_APPLE_COMPANY = `
Apple Inc. announced its latest iPhone today. The tech giant based in Cupertino
revealed new features for iOS. Apple's CEO Tim Cook presented at the event.
The company Apple continues to dominate the smartphone market.
`;

const DOC2_APPLE_FRUIT = `
I bought an apple from the farmers market. The apple was fresh and crisp.
My grandmother makes the best apple pie using fresh apples. An apple a day
keeps the doctor away, as the saying goes.
`;

const DOC3_JORDAN_PERSON = `
Michael Jordan played basketball for the Chicago Bulls. Jordan was known as
the greatest basketball player of all time. Jordan won six NBA championships
during his career. Michael Jordan inspired millions of young athletes.
`;

const DOC4_JORDAN_COUNTRY = `
Jordan is a country in the Middle East. The capital of Jordan is Amman.
Jordan has rich historical sites including Petra. Tourism is important to Jordan's
economy. Jordan shares borders with Israel, Syria, and Saudi Arabia.
`;

async function testSenseDisambiguation() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Phase 4: Sense Disambiguation Test                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\\n');

  // Initialize registries
  const eidRegistry = getEIDRegistry('./data/test-sense-eid.json');
  const aliasRegistry = getAliasRegistry('./data/test-sense-alias.json');
  const senseRegistry = getSenseRegistry();

  // Clear for clean test
  aliasRegistry.clear();
  senseRegistry.clear();

  // === Test 1: Apple (Company vs Fruit) ===
  console.log('═══ Test 1: "Apple" Disambiguation (ORG vs ITEM) ===\\n');

  // Extract Apple the company
  const result1 = await extractFromSegments(
    'apple-company.txt',
    DOC1_APPLE_COMPANY,
    undefined,
    DEFAULT_LLM_CONFIG
  );

  const appleCompany = result1.entities.find(e =>
    e.canonical.toLowerCase() === 'apple' && e.type === 'ORG'
  );

  if (appleCompany) {
    console.log(`✅ Apple (company):`);
    console.log(`   EID: ${appleCompany.eid}`);
    console.log(`   Type: ${appleCompany.type}`);
    console.log(`   SP: ${JSON.stringify(appleCompany.sp || 'not set')}`);
    console.log(`   AID: ${appleCompany.aid}\\n`);
  } else {
    console.log(`⚠️  Apple (company) not extracted\\n`);
  }

  // Extract Apple the fruit
  const result2 = await extractFromSegments(
    'apple-fruit.txt',
    DOC2_APPLE_FRUIT,
    result1.profiles,  // Pass profiles from first doc
    DEFAULT_LLM_CONFIG
  );

  const appleFruit = result2.entities.find(e =>
    e.canonical.toLowerCase() === 'apple' && e.type === 'ITEM'
  );

  if (appleFruit) {
    console.log(`✅ Apple (fruit):`);
    console.log(`   EID: ${appleFruit.eid}`);
    console.log(`   Type: ${appleFruit.type}`);
    console.log(`   SP: ${JSON.stringify(appleFruit.sp || 'not set')}`);
    console.log(`   AID: ${appleFruit.aid}\\n`);
  } else {
    console.log(`⚠️  Apple (fruit) not extracted\\n`);
  }

  // Check if disambiguation worked
  if (appleCompany && appleFruit) {
    if (appleCompany.eid !== appleFruit.eid) {
      console.log(`✅ SUCCESS: Different EIDs assigned (${appleCompany.eid} vs ${appleFruit.eid})`);
    } else {
      console.log(`⚠️  Same EID used - disambiguation may not have triggered`);
    }

    if (appleCompany.sp && appleFruit.sp && JSON.stringify(appleCompany.sp) !== JSON.stringify(appleFruit.sp)) {
      console.log(`✅ SUCCESS: Different SPs assigned (${JSON.stringify(appleCompany.sp)} vs ${JSON.stringify(appleFruit.sp)})\\n`);
    } else {
      console.log(`⚠️  Same SP or SP not set\\n`);
    }
  }

  // === Test 2: Jordan (Person vs Country) ===
  console.log('═══ Test 2: "Jordan" Disambiguation (PERSON vs PLACE) ===\\n');

  // Extract Jordan the person
  const result3 = await extractFromSegments(
    'jordan-person.txt',
    DOC3_JORDAN_PERSON,
    result2.profiles,
    DEFAULT_LLM_CONFIG
  );

  const jordanPerson = result3.entities.find(e =>
    (e.canonical.toLowerCase().includes('jordan') && e.type === 'PERSON') ||
    (e.canonical.toLowerCase() === 'michael jordan' && e.type === 'PERSON')
  );

  if (jordanPerson) {
    console.log(`✅ Jordan (person):`);
    console.log(`   Canonical: ${jordanPerson.canonical}`);
    console.log(`   EID: ${jordanPerson.eid}`);
    console.log(`   Type: ${jordanPerson.type}`);
    console.log(`   SP: ${JSON.stringify(jordanPerson.sp || 'not set')}`);
    console.log(`   AID: ${jordanPerson.aid}\\n`);
  } else {
    console.log(`⚠️  Jordan (person) not extracted\\n`);
  }

  // Extract Jordan the country
  const result4 = await extractFromSegments(
    'jordan-country.txt',
    DOC4_JORDAN_COUNTRY,
    result3.profiles,
    DEFAULT_LLM_CONFIG
  );

  const jordanCountry = result4.entities.find(e =>
    e.canonical.toLowerCase() === 'jordan' && e.type === 'PLACE'
  );

  if (jordanCountry) {
    console.log(`✅ Jordan (country):`);
    console.log(`   Canonical: ${jordanCountry.canonical}`);
    console.log(`   EID: ${jordanCountry.eid}`);
    console.log(`   Type: ${jordanCountry.type}`);
    console.log(`   SP: ${JSON.stringify(jordanCountry.sp || 'not set')}`);
    console.log(`   AID: ${jordanCountry.aid}\\n`);
  } else {
    console.log(`⚠️  Jordan (country) not extracted\\n`);
  }

  // Check if disambiguation worked
  if (jordanPerson && jordanCountry) {
    if (jordanPerson.eid !== jordanCountry.eid) {
      console.log(`✅ SUCCESS: Different EIDs assigned (${jordanPerson.eid} vs ${jordanCountry.eid})`);
    } else {
      console.log(`⚠️  Same EID used - disambiguation may not have triggered`);
    }

    if (jordanPerson.sp && jordanCountry.sp && JSON.stringify(jordanPerson.sp) !== JSON.stringify(jordanCountry.sp)) {
      console.log(`✅ SUCCESS: Different SPs assigned (${JSON.stringify(jordanPerson.sp)} vs ${JSON.stringify(jordanCountry.sp)})\\n`);
    } else {
      console.log(`⚠️  Same SP or SP not set\\n`);
    }
  }

  // === Registry Statistics ===
  console.log('═══ Sense Registry Statistics ===\\n');

  const stats = senseRegistry.getStats();
  console.log(`Total names tracked: ${stats.total_names}`);
  console.log(`Ambiguous names (multiple senses): ${stats.ambiguous_names}`);
  console.log(`Total senses: ${stats.total_senses}`);
  console.log(`Avg senses per name: ${stats.avg_senses_per_name.toFixed(2)}\\n`);

  // Show all senses for "Apple"
  console.log('Senses for "Apple":');
  const appleSenses = senseRegistry.getSenses('Apple');
  appleSenses.forEach((sense, i) => {
    const canonical = eidRegistry.getCanonical(sense.eid);
    console.log(`  ${i + 1}. EID ${sense.eid} (${canonical || 'unknown'}), Type: ${sense.type}, SP: ${JSON.stringify(sense.sp)}`);
  });

  // Show all senses for "Jordan"
  console.log('\\nSenses for "Jordan":');
  const jordanSenses = senseRegistry.getSenses('Jordan');
  jordanSenses.forEach((sense, i) => {
    const canonical = eidRegistry.getCanonical(sense.eid);
    console.log(`  ${i + 1}. EID ${sense.eid} (${canonical || 'unknown'}), Type: ${sense.type}, SP: ${JSON.stringify(sense.sp)}`);
  });

  console.log('\\n═══ Test Complete ===\\n');

  if (stats.ambiguous_names >= 1) {
    console.log('🎉 Sense disambiguation is working! Multiple meanings detected and distinguished.\\n');
  } else {
    console.log('⚠️  No ambiguous names detected. SP assignment may need adjustment.\\n');
  }

  // Cleanup
  eidRegistry.save();
  aliasRegistry.save();
}

testSenseDisambiguation().catch(console.error);
