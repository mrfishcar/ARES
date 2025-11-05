/**
 * Test fiction-specific extraction patterns
 */

import * as fs from 'fs';
import { extractFictionCharacters, extractFictionRelations } from './app/engine/fiction-extraction';

async function testFiction() {
  console.log('FICTION PATTERN EXTRACTION TEST');
  console.log('='.repeat(80));

  const text = fs.readFileSync('/tmp/barty-beauregard-excerpt.txt', 'utf-8');
  const words = text.split(/\s+/).length;

  console.log(`Text length: ${words.toLocaleString()} words`);
  console.log('='.repeat(80));

  // Extract characters using fiction patterns
  const characters = extractFictionCharacters(text);

  console.log(`\nCharacters found: ${characters.length}`);
  console.log('');
  for (const char of characters.slice(0, 20)) {
    console.log(`  ${char.name} (${char.mentions} mentions)`);
  }

  // Extract relations
  const relations = extractFictionRelations(text, characters, 'barty');

  console.log('');
  console.log('='.repeat(80));
  console.log(`Relations found: ${relations.length}`);
  console.log('='.repeat(80));
  console.log('');

  // Group by predicate
  const byPred = new Map<string, typeof relations>();
  for (const rel of relations) {
    if (!byPred.has(rel.pred)) {
      byPred.set(rel.pred, []);
    }
    byPred.get(rel.pred)!.push(rel);
  }

  for (const [pred, rels] of Array.from(byPred.entries()).sort()) {
    console.log(`${pred} (${rels.length}):`);
    for (const rel of rels.slice(0, 10)) {
      const subj = rel.subj.replace('fiction:', '');
      const obj = rel.obj.replace('fiction:', '');
      console.log(`  ${subj} → ${obj}`);
    }
    if (rels.length > 10) {
      console.log(`  ... and ${rels.length - 10} more`);
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('STATISTICS');
  console.log('='.repeat(80));
  console.log(`Words: ${words.toLocaleString()}`);
  console.log(`Characters: ${characters.length}`);
  console.log(`Relations: ${relations.length}`);
  console.log(`Relations per 100 words: ${(relations.length / words * 100).toFixed(1)}`);
}

testFiction()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
