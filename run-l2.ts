import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

const tests = [
  { id: '2.1', text: 'Harry went to Hogwarts. He studied magic there.', 
    rels: ['harry::traveled_to::hogwarts', 'harry::studies_at::hogwarts'] },
  { id: '2.2', text: 'Hermione lives in London. She studies at Hogwarts.', 
    rels: ['hermione::lives_in::london', 'hermione::studies_at::hogwarts'] },
  { id: '2.3', text: 'Frodo lived in the Shire. He traveled to Mordor.', 
    rels: ['frodo::lives_in::shire', 'frodo::traveled_to::mordor'] },
  { id: '2.4', text: 'Aragorn married Arwen. He loved her deeply.', 
    rels: ['aragorn::married_to::arwen', 'arwen::married_to::aragorn'] },
  { id: '2.5', text: 'Ginny studied at Hogwarts. She married Harry.', 
    rels: ['ginny::studies_at::hogwarts', 'ginny::married_to::harry', 'harry::married_to::ginny'] },
  { id: '2.7', text: 'Harry and Ron studied at Hogwarts.', 
    rels: ['harry::studies_at::hogwarts', 'ron::studies_at::hogwarts'] },
  { id: '2.8', text: 'Frodo and Sam traveled to Mordor.', 
    rels: ['frodo::traveled_to::mordor', 'sam::traveled_to::mordor'] },
  { id: '2.9', text: 'Aragorn became king of Gondor. The king ruled wisely.', 
    rels: ['aragorn::rules::gondor'] },
  { id: '2.10', text: 'Dumbledore is a wizard. The wizard teaches at Hogwarts.', 
    rels: ['dumbledore::teaches_at::hogwarts'] },
  { id: '2.12', text: 'Aragorn, son of Arathorn, traveled to Gondor. He became king there.', 
    rels: ['aragorn::child_of::arathorn', 'arathorn::parent_of::aragorn', 
           'aragorn::traveled_to::gondor', 'aragorn::rules::gondor'] },
];

async function main() {
  const testPath = path.join(process.cwd(), 'run-l2.json');
  let passed = 0;
  let failed = 0;

  for (const tc of tests) {
    clearStorage(testPath);
    await appendDoc(tc.id, tc.text, testPath);
    const graph = loadGraph(testPath);

    const extracted = new Set(
      graph!.relations.map(r => {
        const subj = graph!.entities.find(e => e.id === r.subj)?.canonical.toLowerCase() || '';
        const obj = graph!.entities.find(e => e.id === r.obj)?.canonical.toLowerCase() || '';
        return subj + '::' + r.pred + '::' + obj;
      })
    );

    const expected = new Set(tc.rels);
    const missing = tc.rels.filter(e => !extracted.has(e));
    const extra = Array.from(extracted).filter(e => !expected.has(e));

    if (missing.length > 0 || extra.length > 0) {
      failed++;
      console.log('\n❌ ' + tc.id + ': "' + tc.text + '"');
      if (missing.length > 0) console.log('   Missing: ' + missing.join(', '));
      if (extra.length > 0) console.log('   Extra: ' + extra.join(', '));
    } else {
      passed++;
    }
  }

  console.log('\n📊 Results: ' + passed + ' passed, ' + failed + ' failed');
  clearStorage(testPath);
}

main().catch(console.error);
