import { extractFromSegments } from './app/engine/extract/orchestrator';

interface RelationScenario {
  name: string;
  text: string;
  expected: { subj: string; pred: string; obj: string };
}

const scenarios: RelationScenario[] = [
  {
    name: 'Ruling relation',
    text: 'Aragorn ruled Gondor for many years.',
    expected: { subj: 'Aragorn', pred: 'rules', obj: 'Gondor' }
  },
  {
    name: 'Marriage relation',
    text: 'Aragorn married Arwen in Minas Tirith.',
    expected: { subj: 'Aragorn', pred: 'married_to', obj: 'Arwen' }
  },
  {
    name: 'Parent-child relation',
    text: 'Elrond is the father of Arwen.',
    expected: { subj: 'Elrond', pred: 'parent_of', obj: 'Arwen' }
  },
  {
    name: 'Location relation',
    text: 'Frodo lives in the Shire.',
    expected: { subj: 'Frodo', pred: 'lives_in', obj: 'Shire' }
  },
  {
    name: 'Travel relation',
    text: 'The hobbits traveled to Rivendell.',
    expected: { subj: 'hobbits', pred: 'traveled_to', obj: 'Rivendell' }
  }
];

async function testRelations() {
  let hadFailure = false;

  for (const scenario of scenarios) {
    console.log(`\n=== ${scenario.name} ===`);
    const result = await extractFromSegments(`relations-${scenario.name.replace(/\s+/g, '-')}`, scenario.text);

    const relation = result.relations.find(r => r.pred === scenario.expected.pred);
    if (!relation) {
      console.log(`  ❌ Relation not found: ${scenario.expected.pred}`);
      console.log(`     Available: ${result.relations.map(r => r.pred).join(', ') || '(none)'}`);
      hadFailure = true;
      continue;
    }

    const subjName = result.entities.find(e => e.id === relation.subj)?.canonical || '(unknown)';
    const objName = result.entities.find(e => e.id === relation.obj)?.canonical || '(unknown)';

    const subjMatch = subjName.toLowerCase().includes(scenario.expected.subj.toLowerCase());
    const objMatch = objName.toLowerCase().includes(scenario.expected.obj.toLowerCase());

    if (subjMatch && objMatch) {
      console.log(`  ✅ ${scenario.expected.pred}: ${subjName} → ${objName}`);
    } else {
      console.log(`  ❌ ${scenario.expected.pred}: expected ${scenario.expected.subj}/${scenario.expected.obj}, got ${subjName}/${objName}`);
      hadFailure = true;
    }

    console.log(`  Meaning records: ${result.meaningRecords.length}`);
  }

  if (hadFailure) {
    throw new Error('Relation extraction test failed');
  }
}

(async () => {
  try {
    await testRelations();
    console.log('\n🎉 Relation scenarios passed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\n❌ Relation test failed:', message);
    process.exit(1);
  }
})();
