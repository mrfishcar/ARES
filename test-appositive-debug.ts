/**
 * Debug appositive structure
 */

import { parseWithService } from './app/engine/extract/entities';
import type { Token } from './app/engine/extract/relations/types';

async function debugAppositive() {
  const text = 'Robert Morrison, CEO of Zenith Computing, announced the merger';

  console.log('DEBUG: Appositive Structure');
  console.log('='.repeat(80));
  console.log(`Text: "${text}"`);
  console.log('');

  const parsed = await parseWithService(text);
  const sent = parsed.sentences[0];

  console.log('Dependency Structure:');
  console.log('i  | Token      | POS  | Dep      | Head | Head_Text');
  console.log('-'.repeat(80));
  for (const tok of sent.tokens) {
    const headText = tok.head !== tok.i ? sent.tokens[tok.head]?.text : 'ROOT';
    console.log(`${tok.i.toString().padEnd(3)}| ${tok.text.padEnd(11)}| ${tok.pos.padEnd(5)}| ${tok.dep.padEnd(9)}| ${tok.head.toString().padEnd(5)}| ${headText}`);
  }

  // Find appositive relationships
  const appositives = sent.tokens.filter((t: Token) => t.dep === 'appos');
  if (appositives.length > 0) {
    console.log(`\nAppositives found: ${appositives.length}`);
    for (const appos of appositives) {
      const head = sent.tokens[appos.head];
      console.log(`  ${appos.text} (${appos.i}) appos→ ${head.text} (${head.i})`);
    }
  }
  console.log('');
}

debugAppositive()
  .then(() => {
    console.log('Debug complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
