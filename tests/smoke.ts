/**
 * Quick smoke test for entity extraction
 */

import { extractEntities } from '../app/engine/extract/entities';

const TESTS = [
  {
    name: 'LotR',
    text: 'Aragorn, son of Arathorn, married Arwen in 3019. Gandalf the Grey traveled to Minas Tirith.',
    expected: {
      PERSON: ['Aragorn', 'Arathorn', 'Arwen', 'Gandalf'],
      PLACE: ['Minas Tirith'],
      DATE: ['3019']
    }
  },
  {
    name: 'Harry Potter',
    text: 'Harry Potter studies at Hogwarts. Professor McGonagall teaches at Hogwarts.',
    expected: {
      PERSON: ['Harry Potter', 'McGonagall'],
      ORG: ['Hogwarts']
    }
  },
  {
    name: 'Bible',
    text: 'Abram begat Isaac. Isaac begat Jacob. Jacob dwelt in Hebron.',
    expected: {
      PERSON: ['Abram', 'Isaac', 'Jacob'],
      PLACE: ['Hebron']
    }
  }
];

async function main() {
  console.log('🔍 ARES Smoke Test - Entity Extraction\n');
  
  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    console.log(`\n📖 Testing: ${test.name}`);
    console.log(`   Text: "${test.text.slice(0, 60)}..."`);
    
    try {
      const { entities, spans } = await extractEntities(test.text);
      
      console.log(`   ✅ Extracted ${entities.length} entities, ${spans.length} spans`);
      
      const byType = entities.reduce((acc, e) => {
        if (!acc[e.type]) acc[e.type] = [];
        acc[e.type].push(e.canonical);
        return acc;
      }, {} as Record<string, string[]>);
      
      for (const [type, names] of Object.entries(byType)) {
        console.log(`   ${type}: ${names.join(', ')}`);
      }
      
      let testPassed = true;
      for (const [expectedType, expectedNames] of Object.entries(test.expected)) {
        const actualNames = byType[expectedType] || [];
        for (const name of expectedNames) {
          const found = actualNames.some(a => 
            a.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(a.toLowerCase())
          );
          if (!found) {
            console.log(`   ❌ Missing ${expectedType}: ${name}`);
            testPassed = false;
          }
        }
      }
      
      if (testPassed) {
        console.log(`   ✅ All expected entities found`);
        passed++;
      } else {
        failed++;
      }
      
    } catch (err) {
      console.log(`   ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed}/${TESTS.length} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All smoke tests passed! Entity extraction is working.');
  } else {
    console.log('⚠️  Some tests failed. Check parser service and entity extraction logic.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
