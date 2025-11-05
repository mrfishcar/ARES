/**
 * Debug Sophie Laurent worked at pattern
 */

import { parseWithService } from './app/engine/extract/entities';

async function debug() {
  const text = 'Sophie Laurent, a French designer who worked at Adobe';

  console.log('Text:', text);
  console.log('='.repeat(80));

  const parsed = await parseWithService(text);
  const sent = parsed.sentences[0];

  console.log('\nDependency Structure:');
  for (const tok of sent.tokens) {
    const headText = tok.head !== tok.i ? sent.tokens[tok.head]?.text : 'ROOT';
    console.log(`${tok.i} ${tok.text} [${tok.pos}] --${tok.dep}--> ${headText}`);
  }
}

debug().then(() => console.log('\nDone!'));
