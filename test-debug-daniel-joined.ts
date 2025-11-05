/**
 * Debug "Daniel Kim, who had joined in 1987" pattern
 */

import { parseWithService } from './app/engine/extract/entities';
import type { Token } from './app/engine/extract/relations/types';

async function debug() {
  const text = 'Daniel Kim, who had joined in 1987 as a junior engineer';

  console.log('='.repeat(80));
  console.log(`Text: "${text}"`);
  console.log('-'.repeat(80));

  const parsed = await parseWithService(text);
  const sent = parsed.sentences[0];

  console.log('\nDependency Structure:');
  for (const tok of sent.tokens) {
    const headText = tok.head !== tok.i ? sent.tokens[tok.head]?.text : 'ROOT';
    console.log(`${tok.i} ${tok.text} [${tok.pos}] --${tok.dep}--> ${headText}`);
  }
}

debug().then(() => console.log('\nDone!'));
