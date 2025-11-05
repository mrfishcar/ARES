import { parseWithService } from '../app/engine/extract/entities';

async function debugParse() {
  // Test 1: Gandalf the Grey traveled
  const lotr = `Gandalf the Grey traveled to Minas Tirith.`;
  const lotrParsed = await parseWithService(lotr);

  console.log('\n=== LotR Parse Tree ===');
  console.log('Text:', lotr);
  console.log('\nTokens:');
  for (const sent of lotrParsed.sentences) {
    for (const tok of sent.tokens) {
      const headTok = sent.tokens.find(t => t.i === tok.head);
      console.log(`[${tok.i}] ${tok.text} (${tok.pos}/${tok.dep}) -> head:[${tok.head}] ${headTok?.text || 'ROOT'}`);
    }
  }

  // Test 2: Professor McGonagall teaches
  const hp = `Professor McGonagall teaches at Hogwarts.`;
  const hpParsed = await parseWithService(hp);

  console.log('\n=== HP Parse Tree ===');
  console.log('Text:', hp);
  console.log('\nTokens:');
  for (const sent of hpParsed.sentences) {
    for (const tok of sent.tokens) {
      const headTok = sent.tokens.find(t => t.i === tok.head);
      console.log(`[${tok.i}] ${tok.text} (${tok.pos}/${tok.dep}) -> head:[${tok.head}] ${headTok?.text || 'ROOT'}`);
    }
  }

  // Test 3: Isaac begat Jacob
  const bible = `Isaac begat Jacob.`;
  const bibleParsed = await parseWithService(bible);

  console.log('\n=== Bible Parse Tree ===');
  console.log('Text:', bible);
  console.log('\nTokens:');
  for (const sent of bibleParsed.sentences) {
    for (const tok of sent.tokens) {
      const headTok = sent.tokens.find(t => t.i === tok.head);
      console.log(`[${tok.i}] ${tok.text} (${tok.pos}/${tok.dep}) -> head:[${tok.head}] ${headTok?.text || 'ROOT'}`);
    }
  }
}

debugParse();
