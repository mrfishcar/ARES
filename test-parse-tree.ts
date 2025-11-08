/**
 * Debug: Inspect dependency parse tree for minimal test case
 */

import { parseWithService } from './app/engine/extract/entities';

async function testParseTree() {
  const text = "Master Theron Brightforge mentored Lyssa Moonwhisper.";

  console.log('Testing sentence:', text);
  console.log('');

  const parsed = await parseWithService(text);

  if (parsed.sentences.length === 0) {
    console.log('No sentences parsed!');
    return;
  }

  const sent = parsed.sentences[0];
  const tokens = sent.tokens;

  console.log('=== TOKENS ===');
  for (const token of tokens) {
    console.log(`[${token.i}] "${token.text}" (lemma: "${token.lemma}", pos: ${token.pos}, dep: ${token.dep}, head: ${token.head})`);
  }

  console.log('\n=== DEPENDENCY TREE ===');
  for (const token of tokens) {
    if (token.head !== token.i) {
      const headToken = tokens.find(t => t.i === token.head);
      console.log(`"${token.text}" --[${token.dep}]--> "${headToken?.text}"`);
    } else {
      console.log(`"${token.text}" [ROOT]`);
    }
  }

  console.log('\n=== NAMED ENTITIES ===');
  for (const token of tokens) {
    if (token.ent) {
      console.log(`"${token.text}": ${token.ent}`);
    }
  }
}

testParseTree().catch(console.error);
