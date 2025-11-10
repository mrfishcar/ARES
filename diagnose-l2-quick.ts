import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

// Quick test of key L2 cases
const tests = [
  {
    id: '2.1',
    text: 'Harry went to Hogwarts. He studied magic there.',
    expected: ['Harry::traveled_to::Hogwarts', 'Harry::studies_at::Hogwarts']
  },
  {
    id: '2.4',
    text: 'Aragorn married Arwen. He loved her deeply.',
    expected: ['Aragorn::married_to::Arwen', 'Arwen::married_to::Aragorn']
  },
  {
    id: '2.7',
    text: 'Harry and Ron studied at Hogwarts.',
    expected: ['Harry::studies_at::Hogwarts', 'Ron::studies_at::Hogwarts']
  },
  {
    id: '2.10',
    text: 'Dumbledore is a wizard. The wizard teaches at Hogwarts.',
    expected: ['Dumbledore::teaches_at::Hogwarts']
  },
  {
    id: '2.12',
    text: 'Aragorn, son of Arathorn, traveled to Gondor. He became king there.',
    expected: ['Aragorn::child_of::Arathorn', 'Arathorn::parent_of::Aragorn',
               'Aragorn::traveled_to::Gondor', 'Aragorn::rules::Gondor']
  }
];

async function main() {
  const testPath = path.join(process.cwd(), 'diagnose-l2.json');

  for (const tc of tests) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath);

    const extracted = new Set(
      graph!.relations.map(r => {
        const subj = graph!.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '';
        const obj = graph!.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '';
        return `${subj}::${r.pred}::${obj}`;
      })
    );

    const expected = new Set(tc.expected.map(e => e.toLowerCase()));
    const missing = Array.from(expected).filter(e => !extracted.has(e));
    const extra = Array.from(extracted).filter(e => !expected.has(e));

    if (missing.length > 0 || extra.length > 0) {
      console.log(`\n❌ Test ${tc.id} FAILED:`);
      console.log(`   Text: "${tc.text}"`);
      if (missing.length > 0) {
        console.log(`   Missing: ${missing.join(', ')}`);
      }
      if (extra.length > 0) {
        console.log(`   Extra: ${extra.join(', ')}`);
      }
    } else {
      console.log(`✓ Test ${tc.id} passed`);
    }
  }

  clearStorage(testPath);
}

main().catch(console.error);
