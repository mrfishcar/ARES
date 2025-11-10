import { parseSentence } from './app/nlp/spacy-client';

async function test() {
  const text = "Mira spent mornings in the Academy's youth wing studying mechanical grammar. She idolized her parents, often insisting that she was equally the child of Aria and Elias.";

  const result = await parseSentence(text);

  console.log('\n=== ENTITIES ===');
  for (const ent of result.entities) {
    console.log(`"${ent.text}" [${ent.start},${ent.end}] - ${ent.label}`);
  }

  console.log('\n=== TOKENS (last 10) ===');
  const lastTokens = result.tokens.slice(-10);
  for (const tok of lastTokens) {
    console.log(`"${tok.text}" [${tok.start},${tok.end}] pos=${tok.pos} ent_type=${tok.ent_type || 'O'}`);
  }
}

test().catch(console.error);
