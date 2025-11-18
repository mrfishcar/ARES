import { extractFromSegments } from './app/engine/extract/orchestrator';

type PronounScenario = {
  name: string;
  text: string;
  expectations: {
    entities: string[];
    noPronouns: string[];
    separateEntities?: boolean;
  };
};

const scenarios: PronounScenario[] = [
  {
    name: 'Basic pronoun reference',
    text: 'Frederick walked. He knocked on the door.',
    expectations: {
      entities: ['Frederick'],
      noPronouns: ['he']
    }
  },
  {
    name: 'Multiple people with pronouns',
    text: 'Frederick met Saul. He greeted him warmly.',
    expectations: {
      entities: ['Frederick', 'Saul'],
      noPronouns: ['he', 'him'],
      separateEntities: true
    }
  },
  {
    name: 'Female pronouns',
    text: 'Eowyn fought bravely. She defeated the Witch-king.',
    expectations: {
      entities: ['Eowyn', 'Witch-king'],
      noPronouns: ['she']
    }
  },
  {
    name: 'Possessive pronouns',
    text: 'Aragorn drew his sword. His blade gleamed.',
    expectations: {
      entities: ['Aragorn'],
      noPronouns: ['his']
    }
  }
];

function containsPronoun(value: string | undefined, pronouns: string[]): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return pronouns.some(p => lower === p.toLowerCase());
}

async function testPronounResolution() {
  let hadFailure = false;

  for (const scenario of scenarios) {
    console.log(`\n=== ${scenario.name} ===`);
    const result = await extractFromSegments(`pronoun-${scenario.name.replace(/\s+/g, '-')}`, scenario.text);

    const lowerPronouns = scenario.expectations.noPronouns.map(p => p.toLowerCase());

    for (const entity of result.entities) {
      const hasPronounCanonical = containsPronoun(entity.canonical, lowerPronouns);
      console.log(`  ${hasPronounCanonical ? '❌' : '✅'} Entity canonical: ${entity.canonical}`);
      if (hasPronounCanonical) {
        hadFailure = true;
      }

      const badAliases = (entity.aliases || []).filter(alias => containsPronoun(alias, lowerPronouns));
      if (badAliases.length) {
        console.log(`  ❌ Aliases contain pronouns for ${entity.canonical}: ${badAliases.join(', ')}`);
        hadFailure = true;
      }
    }

    if (scenario.expectations.separateEntities) {
      const unique = new Set(result.entities.map(e => e.canonical.toLowerCase()));
      if (unique.size < scenario.expectations.entities.length) {
        console.log('  ❌ Entities were merged incorrectly');
        hadFailure = true;
      } else {
        console.log('  ✅ Entities remained distinct');
      }
    }
  }

  if (hadFailure) {
    throw new Error('Pronoun resolution test failed');
  }
}

(async () => {
  try {
    await testPronounResolution();
    console.log('\n🎉 Pronoun resolution scenarios passed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\n❌ Pronoun resolution test failed:', message);
    process.exit(1);
  }
})();
