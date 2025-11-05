/**
 * Quick smoke test for relation extraction (Phase 2)
 */

import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';
import type { Predicate } from '../app/engine/schema';

const TESTS = [
  {
    name: 'LotR',
    text: 'Aragorn, son of Arathorn, married Arwen in 3019. Gandalf the Grey traveled to Minas Tirith.',
    expected: [
      { pred: 'parent_of', subj: 'Arathorn', obj: 'Aragorn' },
      { pred: 'child_of', subj: 'Aragorn', obj: 'Arathorn' },
      { pred: 'married_to', subj: 'Aragorn', obj: 'Arwen' },
      { pred: 'married_to', subj: 'Arwen', obj: 'Aragorn' },
      { pred: 'traveled_to', subj: 'Gandalf', obj: 'Minas Tirith' }
    ]
  },
  {
    name: 'Harry Potter',
    text: 'Harry Potter studies at Hogwarts. Professor McGonagall teaches at Hogwarts.',
    expected: [
      { pred: 'studies_at', subj: 'Harry Potter', obj: 'Hogwarts' },
      { pred: 'teaches_at', subj: 'McGonagall', obj: 'Hogwarts' }
    ]
  },
  {
    name: 'Bible',
    text: 'Abram begat Isaac. Isaac begat Jacob. Jacob dwelt in Hebron.',
    expected: [
      { pred: 'parent_of', subj: 'Abram', obj: 'Isaac' },
      { pred: 'child_of', subj: 'Isaac', obj: 'Abram' },
      { pred: 'parent_of', subj: 'Isaac', obj: 'Jacob' },
      { pred: 'child_of', subj: 'Jacob', obj: 'Isaac' },
      { pred: 'lives_in', subj: 'Jacob', obj: 'Hebron' }
    ]
  }
];

async function main() {
  console.log('🔍 ARES Smoke Test - Relation Extraction (Phase 2)\n');

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    console.log(`\n📖 Testing: ${test.name}`);
    console.log(`   Text: "${test.text.slice(0, 60)}..."`);

    try {
      const { entities, spans } = await extractEntities(test.text);
      const relations = await extractRelations(test.text, { entities, spans }, 'test');

      console.log(`   ✅ Extracted ${relations.length} relations`);

      // Display extracted relations
      const relStrings = relations.map(r => {
        const subj = entities.find(e => e.id === r.subj);
        const obj = entities.find(e => e.id === r.obj);
        return `${r.pred}(${subj?.canonical} → ${obj?.canonical})`;
      });
      console.log(`   Relations: ${relStrings.join(', ')}`);

      let testPassed = true;
      for (const exp of test.expected) {
        const found = relations.some(r => {
          if (r.pred !== exp.pred) return false;
          const subj = entities.find(e => e.id === r.subj);
          const obj = entities.find(e => e.id === r.obj);

          // Partial match for subject/object names
          const subjMatch = subj?.canonical.includes(exp.subj) || exp.subj.includes(subj?.canonical || '');
          const objMatch = obj?.canonical.includes(exp.obj) || exp.obj.includes(obj?.canonical || '');

          return subjMatch && objMatch;
        });

        if (!found) {
          console.log(`   ❌ Missing: ${exp.pred}(${exp.subj} → ${exp.obj})`);
          testPassed = false;
        }
      }

      if (testPassed) {
        console.log(`   ✅ All expected relations found`);
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
    console.log('🎉 All smoke tests passed! Relation extraction is working.');
  } else {
    console.log('⚠️  Some tests failed. Check parser service and relation extraction logic.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
