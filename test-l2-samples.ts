import { appendDoc, loadGraph, clearStorage } from './app/storage/storage';
import * as path from 'path';

// Test some specific L2 cases to find patterns
async function test(text: string, expected: string[]) {
  const testPath = path.join(process.cwd(), 'test-l2-sample.json');
  clearStorage(testPath);
  
  await appendDoc('test', text, testPath);
  const graph = loadGraph(testPath);
  
  const extracted = graph!.relations.map(r => {
    const subj = graph!.entities.find(e => e.id === r.subj)?.canonical.toLowerCase();
    const obj = graph!.entities.find(e => e.id === r.obj)?.canonical.toLowerCase();
    return subj + '::' + r.pred + '::' + obj;
  });
  
  const missing = expected.filter(e => !extracted.includes(e));
  
  console.log('Text:', text);
  console.log('Expected:', expected.length, 'Got:', extracted.length);
  if (missing.length > 0) {
    console.log('MISSING:', missing.join(', '));
  }
  console.log('');
  
  clearStorage(testPath);
}

async function main() {
  // Test cases that might be problematic
  await test(
    'Gandalf traveled to Rivendell. Elrond lived there. He welcomed Gandalf.',
    ['gandalf::traveled_to::rivendell', 'elrond::lives_in::rivendell']
  );
  
  await test(
    'Legolas was an elf. He was friends with Gimli. They traveled together.',
    ['legolas::friends_with::gimli', 'gimli::friends_with::legolas']
  );
  
  await test(
    'Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan.',
    ['theoden::rules::rohan', 'eowyn::lives_in::rohan']
  );
  
  await test(
    'Elrond dwelt in Rivendell. The elf lord welcomed travelers. He was wise and ancient.',
    ['elrond::lives_in::rivendell']
  );
}

main().catch(console.error);
