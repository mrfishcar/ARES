/**
 * Debug "investment from X went to Y" pattern
 */

import { parseWithService } from './app/engine/extract/entities';
import { findShortestPath, describePath } from './app/engine/extract/relations/dependency-paths';
import type { Token } from './app/engine/extract/relations/types';

async function debugInvestmentFromTo() {
  const text = 'The first investment from Zenith Ventures went to CloudTech';

  console.log('DEBUG: Investment From-To Pattern');
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

  // Find entity tokens
  const venturesToken = sent.tokens.find((t: Token) => t.text.toLowerCase() === 'ventures');
  const cloudtechToken = sent.tokens.find((t: Token) => t.text.toLowerCase() === 'cloudtech');

  if (venturesToken && cloudtechToken) {
    console.log(`Finding path: Ventures (${venturesToken.i}) → CloudTech (${cloudtechToken.i})`);

    const path12 = findShortestPath(venturesToken, cloudtechToken, sent.tokens);
    const path21 = findShortestPath(cloudtechToken, venturesToken, sent.tokens);

    if (path12) {
      console.log(`\nPath Ventures → CloudTech:`);
      console.log(`  Signature: ${path12.signature}`);
      console.log(`  Description: ${describePath(path12)}`);
    } else {
      console.log('\nNo path found Ventures → CloudTech');
    }

    if (path21) {
      console.log(`\nPath CloudTech → Ventures:`);
      console.log(`  Signature: ${path21.signature}`);
      console.log(`  Description: ${describePath(path21)}`);
    } else {
      console.log('\nNo path found CloudTech → Ventures');
    }
  }
}

debugInvestmentFromTo()
  .then(() => {
    console.log('\nDebug complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
