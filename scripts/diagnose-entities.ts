/**
 * Diagnostic for entity extraction issues in Level 2
 */

import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';

interface TestCase {
  id: string;
  text: string;
  expected: Array<{ text: string; type: string }>;
}

const cases: TestCase[] = [
  {
    id: '2.3',
    text: 'Frodo lived in the Shire. He traveled to Mordor.',
    expected: [
      { text: 'Frodo', type: 'PERSON' },
      { text: 'Shire', type: 'PLACE' },
      { text: 'Mordor', type: 'PLACE' }
    ]
  },
  {
    id: '2.9',
    text: 'Aragorn became king of Gondor. The king ruled wisely.',
    expected: [
      { text: 'Aragorn', type: 'PERSON' },
      { text: 'Gondor', type: 'PLACE' }
    ]
  },
  {
    id: '2.14',
    text: 'Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan.',
    expected: [
      { text: 'Theoden', type: 'PERSON' },
      { text: 'Rohan', type: 'PLACE' },
      { text: 'Eowyn', type: 'PERSON' }
    ]
  }
];

async function diagnose() {
  const testPath = 'test-entity-diag.json';

  for (const tc of cases) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Test ${tc.id}: "${tc.text}"`);
    console.log('='.repeat(80));

    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath);

    if (!graph) {
      console.log('ERROR: Failed to load graph\n');
      continue;
    }

    console.log('\nExpected entities:');
    tc.expected.forEach(e => console.log(`  - ${e.text} (${e.type})`));

    console.log('\nExtracted entities:');
    graph.entities.forEach(e => console.log(`  - ${e.canonical} (${e.type})`));

    const expectedSet = new Set(tc.expected.map(e => e.text.toLowerCase()));
    const extractedSet = new Set(graph.entities.map(e => e.canonical.toLowerCase()));

    const missing = tc.expected.filter(e => !extractedSet.has(e.text.toLowerCase()));
    const extra = graph.entities.filter(e => !expectedSet.has(e.canonical.toLowerCase()));

    if (missing.length > 0) {
      console.log('\nMissing entities:');
      missing.forEach(e => console.log(`  - ${e.text} (${e.type})`));
    }

    if (extra.length > 0) {
      console.log('\nExtra entities:');
      extra.forEach(e => console.log(`  - ${e.canonical} (${e.type})`));
    }

    console.log('\nRelations:');
    graph.relations.forEach(r => {
      const subj = graph.entities.find(e => e.id === r.subj);
      const obj = graph.entities.find(e => e.id === r.obj);
      console.log(`  - ${subj?.canonical} --[${r.pred}]--> ${obj?.canonical}`);
    });
  }

  clearStorage(testPath);
}

diagnose().catch(console.error);
