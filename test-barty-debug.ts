/**
 * Debug why Barty extraction is failing
 */

import * as fs from 'fs';
import { parseWithService } from './app/engine/extract/entities';

async function debug() {
  const text = fs.readFileSync('/tmp/barty-beauregard-excerpt.txt', 'utf-8');

  // Take first 500 characters to see what we're working with
  const sample = text.slice(0, 500);
  console.log('SAMPLE TEXT:');
  console.log('='.repeat(80));
  console.log(sample);
  console.log('='.repeat(80));

  // Parse it to see what entities are detected
  console.log('\nPARSER OUTPUT:');
  const parsed = await parseWithService(sample);

  console.log(`\nSentences: ${parsed.sentences.length}`);

  for (let si = 0; si < Math.min(3, parsed.sentences.length); si++) {
    const sent = parsed.sentences[si];
    console.log(`\nSentence ${si + 1}:`);
    console.log('Tokens with ENT tags:');

    for (const tok of sent.tokens) {
      if (tok.ent && tok.ent !== 'O' && tok.ent !== '') {
        console.log(`  ${tok.text} [${tok.pos}] ent=${tok.ent}`);
      }
    }
  }
}

debug().then(() => console.log('\nDone!'));
