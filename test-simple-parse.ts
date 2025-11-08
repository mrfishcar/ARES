/**
 * Test spaCy parsing with simple sentence
 */

import { parseWithService } from './app/engine/extract/entities';

async function testSimpleParse() {
  const tests = [
    "John married Mary.",
    "Alice founded Tesla.",
    "Bob mentored Sara."
  ];

  for (const text of tests) {
    console.log(`\n=== "${text}" ===`);

    const parsed = await parseWithService(text);
    const sent = parsed.sentences[0];

    console.log('Tokens:');
    for (const token of sent.tokens) {
      console.log(`  [${token.i}] "${token.text}" lemma="${token.lemma}" pos=${token.pos} dep=${token.dep} head=${token.head}`);
    }

    console.log('Dependencies:');
    for (const token of sent.tokens) {
      if (token.head !== token.i) {
        const headToken = sent.tokens.find(t => t.i === token.head);
        console.log(`  "${token.text}" --[${token.dep}]--> "${headToken?.text}"`);
      } else {
        console.log(`  "${token.text}" [ROOT]`);
      }
    }
  }
}

testSimpleParse().catch(console.error);
