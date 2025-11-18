import { extractFromSegments } from './app/engine/extract/orchestrator';

type EntityExpectation = { name: string; type: string };
type EntityScenario = { text: string; expected: EntityExpectation[] };

const scenarios: EntityScenario[] = [
  {
    text: 'Professor McGonagall teaches at Hogwarts.',
    expected: [
      { name: 'McGonagall', type: 'PERSON' },
      { name: 'Hogwarts', type: 'PLACE' }
    ]
  },
  {
    text: 'King Aragorn ruled Gondor from Minas Tirith.',
    expected: [
      { name: 'Aragorn', type: 'PERSON' },
      { name: 'Gondor', type: 'PLACE' },
      { name: 'Minas Tirith', type: 'PLACE' }
    ]
  },
  {
    text: 'The Fellowship journeyed to Mordor.',
    expected: [
      { name: 'Fellowship', type: 'ORG' },
      { name: 'Mordor', type: 'PLACE' }
    ]
  }
];

async function testEntityTypes() {
  let hadFailure = false;

  for (const scenario of scenarios) {
    console.log(`\nText: "${scenario.text}"`);
    const result = await extractFromSegments('entity-type-test', scenario.text);

    for (const exp of scenario.expected) {
      const entity = result.entities.find(e => e.canonical.includes(exp.name));
      if (!entity) {
        console.log(`  ❌ ${exp.name}: not found`);
        hadFailure = true;
        continue;
      }

      if (entity.type === exp.type) {
        console.log(`  ✅ ${exp.name}: ${entity.type}`);
      } else {
        console.log(`  ❌ ${exp.name}: expected ${exp.type}, got ${entity.type}`);
        hadFailure = true;
      }
    }
  }

  if (hadFailure) {
    throw new Error('Entity type test failed');
  }
}

(async () => {
  try {
    await testEntityTypes();
    console.log('\n🎉 Entity type scenarios passed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\n❌ Entity type test failed:', message);
    process.exit(1);
  }
})();
