/**
 * Quick Beauregard extraction quality check
 */

import { extractFromSegments } from '../app/engine/pipeline/orchestrator';
import { DEFAULT_LLM_CONFIG } from '../app/engine/llm-config';
import * as fs from 'fs';
import * as path from 'path';

// Enable filters to see filtered extraction
process.env.SKIP_PATTERN_LIBRARY = '1';
process.env.ARES_ENTITY_FILTER = 'on';  // Enable quality filter with stopwords

const filePath = path.join(__dirname, '..', 'Barty Beauregard and the Fabulous Fraud PLAIN TEXT.txt');
const rawText = fs.readFileSync(filePath, 'latin1');
const fullText = rawText
  .replace(/[\u2018\u2019\u201A\u201B\u0092]/g, "'")
  .replace(/[\u201C\u201D\u201E\u201F\u0093\u0094]/g, '"')
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/\r\n?/g, '\n');

const sampleText = fullText.slice(0, 25000);  // First ~4k words

async function main() {
  console.log('\n=== Starting Beauregard Extraction ===\n');

  const result = await extractFromSegments('beauregard', sampleText, undefined, DEFAULT_LLM_CONFIG, undefined, { generateHERTs: false });

  console.log('\n=== BEAUREGARD EXTRACTION RESULTS ===');
  console.log('Total entities:', result.entities.length);
  console.log('Total relations:', result.relations.length);

  // Check for junk words
  const junkWords = ['Blood', 'Animals', 'Caged', 'Littering', 'Gluttony', 'Legend', 'Layers', 'Land', 'Driving', 'Please', 'Honey', 'Bullet', 'Steamy', 'Learning', 'Growing', 'Perched', 'Hello', 'Help', 'Famous'];
  const names = result.entities.map((e: any) => e.canonical);
  const stillPresent = junkWords.filter(w => names.some((n: string) => n.toLowerCase() === w.toLowerCase()));

  console.log('\nJunk words remaining:', stillPresent.length ? stillPresent.join(', ') : 'NONE! ✅');

  console.log('\n--- PERSON entities ---');
  const persons = result.entities.filter((e: any) => e.type === 'PERSON').map((e: any) => e.canonical).sort();
  console.log(persons.join(', '));

  console.log('\n--- ORG entities ---');
  const orgs = result.entities.filter((e: any) => e.type === 'ORG').map((e: any) => e.canonical).sort();
  console.log(orgs.length ? orgs.join(', ') : '(none)');

  console.log('\n--- PLACE entities ---');
  const places = result.entities.filter((e: any) => e.type === 'PLACE').map((e: any) => e.canonical).sort();
  console.log(places.length ? places.join(', ') : '(none)');

  // Check for expected entities
  const expectedPersons = ['Barty', 'Frederick', 'Saul', 'Honey', 'Charles', 'Preston', 'Kelly', 'Andrew'];
  const foundExpected = expectedPersons.filter(exp => persons.some((p: string) => p.toLowerCase().includes(exp.toLowerCase())));
  console.log('\n--- Expected Characters Found ---');
  console.log(foundExpected.join(', ') || '(none)');
  const missing = expectedPersons.filter(exp => !persons.some((p: string) => p.toLowerCase().includes(exp.toLowerCase())));
  console.log('Missing:', missing.join(', ') || 'NONE! ✅');

  console.log('\n--- Sample Relations (first 15) ---');
  for (const r of result.relations.slice(0, 15)) {
    const rel = r as any;
    console.log((rel.subj_surface || rel.subj), '--[' + rel.pred + ']-->', (rel.obj_surface || rel.obj));
  }
}

main().catch(console.error);
