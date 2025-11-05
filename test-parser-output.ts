/**
 * Check raw parser output to see what data we get
 */

import { parseWithService } from './app/engine/extract/entities';

async function check() {
  const text = 'Robert Morrison founded Zenith Computing. He hired Dr. Yuki Tanaka from MIT.';

  const parsed = await parseWithService(text);

  console.log('Sentences:', parsed.sentences.length);

  for (let si = 0; si < parsed.sentences.length; si++) {
    const sent = parsed.sentences[si];
    console.log(`\nSentence ${si + 1}:`);
    console.log('Tokens with ENT tags:');

    for (const tok of sent.tokens) {
      if (tok.ent && tok.ent !== 'O' && tok.ent !== '') {
        console.log(`  ${tok.text} [${tok.pos}] ent=${tok.ent}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Full first sentence tokens:');
  for (const tok of parsed.sentences[0].tokens) {
    console.log(`  ${tok.i}: "${tok.text}" pos=${tok.pos} dep=${tok.dep} ent=${tok.ent}`);
  }
}

check().then(() => console.log('\nDone!'));
