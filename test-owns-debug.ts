/**
 * Debug ownership pattern
 */

import { parseWithService } from './app/engine/extract/entities';
import { findShortestPath, describePath } from './app/engine/extract/relations/dependency-paths';
import type { Token } from './app/engine/extract/relations/types';

async function debugOwns() {
  const text = 'Robert Morrison owns Zenith Computing';

  console.log('DEBUG: Ownership Pattern');
  console.log('='.repeat(80));
  console.log(`Text: "${text}"`);
  console.log('');

  const parsed = await parseWithService(text);
  const sent = parsed.sentences[0];

  console.log('Dependency Structure:');
  console.log('Token | POS | Dep | Head | Head_Text');
  console.log('-'.repeat(80));
  for (const tok of sent.tokens) {
    const headText = tok.head !== tok.i ? sent.tokens[tok.head]?.text : 'ROOT';
    console.log(`${tok.i.toString().padEnd(6)}| ${tok.pos.padEnd(4)}| ${tok.dep.padEnd(8)}| ${tok.head.toString().padEnd(5)}| ${headText}`);
  }
  console.log('');

  const morrisonToken = sent.tokens.find((t: Token) => t.text.toLowerCase() === 'morrison');
  const zenithToken = sent.tokens.find((t: Token) => t.text.toLowerCase() === 'zenith');

  if (morrisonToken && zenithToken) {
    console.log(`Finding path: Morrison (${morrisonToken.i}) → Zenith (${zenithToken.i})`);

    const path12 = findShortestPath(morrisonToken, zenithToken, sent.tokens);
    const path21 = findShortestPath(zenithToken, morrisonToken, sent.tokens);

    if (path12) {
      console.log(`\nPath Morrison → Zenith:`);
      console.log(`  Signature: ${path12.signature}`);
      console.log(`  Description: ${describePath(path12)}`);
    } else {
      console.log('\nNo path found Morrison → Zenith');
    }

    if (path21) {
      console.log(`\nPath Zenith → Morrison:`);
      console.log(`  Signature: ${path21.signature}`);
      console.log(`  Description: ${describePath(path21)}`);
    } else {
      console.log('\nNo path found Zenith → Morrison');
    }
  }
}

debugOwns()
  .then(() => {
    console.log('\nDebug complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
