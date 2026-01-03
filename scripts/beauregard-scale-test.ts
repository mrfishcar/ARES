import { appendDoc, clearStorage } from '../app/storage/storage';
import * as fs from 'fs';
import * as path from 'path';

// Load the Beauregard full text
const filePath = path.join(__dirname, '..', 'Barty Beauregard and the Fabulous Fraud PLAIN TEXT.txt');
const text = fs.readFileSync(filePath, 'utf-8');
const wordCount = text.split(/\s+/).length;

console.log(`Loaded Beauregard document: ${wordCount} words`);

async function runTest() {
  const start = Date.now();
  clearStorage('./data/beauregard-scale-test.json');

  try {
    const result = await appendDoc('beauregard-test', text, './data/beauregard-scale-test.json');
    const elapsed = (Date.now() - start) / 1000;
    const wordsPerSec = Math.round(wordCount / elapsed);

    console.log(`\n=== BEAUREGARD SCALE TEST RESULTS ===`);
    console.log(`Text: ${wordCount} words`);
    console.log(`Time: ${elapsed.toFixed(2)}s`);
    console.log(`Speed: ${wordsPerSec} words/sec`);
    console.log(`Entities: ${result.entities.length}`);
    console.log(`Relations: ${result.relations.length}`);
    console.log(`Target: >= 100 words/sec`);
    console.log(`Status: ${wordsPerSec >= 100 ? 'PASSED ✅' : 'FAILED ❌'}`);

    // Show sample entities
    console.log(`\n=== SAMPLE ENTITIES (first 20) ===`);
    result.entities.slice(0, 20).forEach((e: any) => {
      console.log(`  - ${e.canonical || e.name} (${e.type})`);
    });

    // Show sample relations
    console.log(`\n=== SAMPLE RELATIONS (first 15) ===`);
    result.relations.slice(0, 15).forEach((r: any) => {
      console.log(`  - ${r.subj} --[${r.pred}]--> ${r.obj}`);
    });

  } catch (err) {
    console.error('Test failed:', err);
  }
}

runTest();
