/**
 * Test what spaCy NER is detecting
 */

import { parseWithService } from './app/engine/extract/entities';

async function testNER() {
  const text = "Prince Marcus married Princess Aria.";

  console.log('Text:', text);
  console.log('');

  const parsed = await parseWithService(text);
  const sent = parsed.sentences[0];

  console.log('=== TOKENS ===');
  for (const token of sent.tokens) {
    console.log(`[${token.i}] "${token.text}" ent="${token.ent}" pos=${token.pos}`);
  }

  console.log('\n=== ENTITIES BY TOKEN ===');
  let currentEnt = '';
  let currentTokens: string[] = [];

  for (const token of sent.tokens) {
    if (token.ent && token.ent !== '') {
      if (token.ent === currentEnt) {
        currentTokens.push(token.text);
      } else {
        if (currentTokens.length > 0) {
          console.log(`  ${currentEnt}: "${currentTokens.join(' ')}"`);
        }
        currentEnt = token.ent;
        currentTokens = [token.text];
      }
    } else {
      if (currentTokens.length > 0) {
        console.log(`  ${currentEnt}: "${currentTokens.join(' ')}"`);
        currentTokens = [];
        currentEnt = '';
      }
    }
  }

  if (currentTokens.length > 0) {
    console.log(`  ${currentEnt}: "${currentTokens.join(' ')}"`);
  }
}

testNER().catch(console.error);
