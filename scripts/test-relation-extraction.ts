/**
 * Debug script to test relation extraction patterns
 * Uses direct extraction API without BookNLP
 */
import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';
import { extractAllNarrativeRelations } from '../app/engine/narrative-relations';

interface TestCase {
  text: string;
  expectedRelations: string[];
  description: string;
}

const TEST_CASES: TestCase[] = [
  {
    text: 'Abram begat Isaac.',
    expectedRelations: ['Abram --[parent_of]--> Isaac'],
    description: 'Biblical begat pattern'
  },
  {
    text: 'John is the father of Mary.',
    expectedRelations: ['John --[parent_of]--> Mary'],
    description: 'Father of pattern'
  },
  {
    text: 'Sarah is the mother of Isaac.',
    expectedRelations: ['Sarah --[parent_of]--> Isaac'],
    description: 'Mother of pattern'
  },
  {
    text: 'King David was the son of Jesse.',
    expectedRelations: ['David --[child_of]--> Jesse'],
    description: 'Son of pattern'
  },
  {
    text: 'Mary was the daughter of Joachim.',
    expectedRelations: ['Mary --[child_of]--> Joachim'],
    description: 'Daughter of pattern'
  },
  {
    text: 'Abraham married Sarah.',
    expectedRelations: ['Abraham --[married_to]--> Sarah'],
    description: 'Married pattern'
  },
  {
    text: 'Abraham was the husband of Sarah.',
    expectedRelations: ['Abraham --[married_to]--> Sarah'],
    description: 'Husband of pattern'
  },
  {
    text: 'Aragorn founded the kingdom of Gondor.',
    expectedRelations: [],
    description: 'Founded pattern (no family relation)'
  }
];

async function main() {
  console.log('=== RELATION EXTRACTION TEST ===\n');

  for (const testCase of TEST_CASES) {
    console.log(`\n--- ${testCase.description} ---`);
    console.log(`Input: "${testCase.text}"`);

    // Extract entities first
    const entityResult = await extractEntities(testCase.text);
    const entities = entityResult.entities;
    const spans = entityResult.spans;

    console.log(`Entities: ${entities.map(e => `${e.type}::${e.canonical}`).join(', ')}`);

    // Build entity lookup for narrative relations
    const entityLookup = entities.map(e => ({
      id: e.id,
      type: e.type,
      canonical: e.canonical,
      aliases: e.aliases || []
    }));

    // Extract narrative relations
    const narrativeRels = extractAllNarrativeRelations(
      testCase.text,
      entityLookup,
      'test',
      { links: [], quotes: [] }
    );

    // Extract dependency relations
    const depRels = await extractRelations(
      testCase.text,
      { entities, spans },
      'test'
    );

    // Combine all relations
    const allRels = [...narrativeRels, ...depRels];

    // Format relations for display
    const foundRelations = allRels.map(rel => {
      const subj = entities.find(e => e.id === rel.subj)?.canonical ?? rel.subj;
      const obj = entities.find(e => e.id === rel.obj)?.canonical ?? rel.obj;
      return `${subj} --[${rel.pred}]--> ${obj}`;
    });

    console.log(`Found relations: ${foundRelations.length}`);
    for (const rel of foundRelations) {
      console.log(`  ${rel}`);
    }

    // Check expected relations
    const missing = testCase.expectedRelations.filter(exp => !foundRelations.includes(exp));
    const unexpected = foundRelations.filter(found => !testCase.expectedRelations.includes(found));

    if (missing.length > 0) {
      console.log(`  ❌ MISSING: ${missing.join(', ')}`);
    }
    if (unexpected.length > 0 && testCase.expectedRelations.length > 0) {
      console.log(`  ⚠️ EXTRA: ${unexpected.join(', ')}`);
    }
    if (missing.length === 0 && testCase.expectedRelations.length > 0) {
      console.log('  ✅ PASS');
    } else if (testCase.expectedRelations.length === 0 && foundRelations.length === 0) {
      console.log('  ✅ PASS (no relations expected)');
    }
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);
