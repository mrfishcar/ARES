#!/usr/bin/env tsx
/**
 * Quick test to verify new patterns are working
 */

import { extractEntities } from './app/engine/extract/entities';
import { extractRelations } from './app/engine/extract/relations';

const testCases = [
  // Creation patterns
  { text: 'Leonardo da Vinci painted the Mona Lisa.', expected: 'painted' },
  { text: 'Shakespeare wrote Hamlet.', expected: 'authored' },
  { text: 'Mozart composed The Magic Flute.', expected: 'composed' },

  // Location patterns
  { text: 'Paris is located in France.', expected: 'located_in' },
  { text: 'The Eiffel Tower stands in Paris.', expected: 'located_in' },

  // Ownership patterns
  { text: 'Rockefeller owns Standard Oil Company.', expected: 'owns' },
  { text: 'Musk owns Tesla and SpaceX.', expected: 'owns' },

  // Communication patterns
  { text: 'Lincoln wrote a letter to Grant.', expected: 'wrote_to' },
  { text: 'Einstein told Bohr about the theory.', expected: 'told' },

  // Power patterns
  { text: 'Napoleon ruled France.', expected: 'ruled' },
  { text: 'Caesar commanded the Roman legions.', expected: 'commanded' },
];

async function runTests() {
  console.log('🧪 Testing new patterns...\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`📝 "${testCase.text}"`);

    try {
      const { entities, spans } = await extractEntities(testCase.text);
      const relations = await extractRelations(testCase.text, { entities, spans }, 'test');

      if (relations && relations.length > 0) {
        console.log(`   ✓ Found ${relations.length} relation(s):`);
        relations.forEach(rel => {
          console.log(`      ${rel.subj} --[${rel.pred}]--> ${rel.obj}`);
        });
        passed++;
      } else {
        console.log(`   ✗ No relations found (expected: ${testCase.expected})`);
        if (entities.length > 0) {
          console.log(`      Entities found: ${entities.map(e => e.canonical).join(', ')}`);
        } else {
          console.log(`      No entities found`);
        }
        failed++;
      }
    } catch (error: any) {
      console.log(`   ✗ Error: ${error.message}`);
      failed++;
    }

    console.log('');
  }

  console.log(`\n📊 Results: ${passed}/${testCases.length} passed, ${failed} failed`);

  if (passed > 0) {
    console.log('✅ SUCCESS! New patterns are working.');
  } else {
    console.log('❌ FAILURE! No patterns matched. Debug needed.');
  }
}

runTests().catch(console.error);
