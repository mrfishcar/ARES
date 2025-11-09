/**
 * Debug the dependency parse for sentence 2.12
 */

import { parseText } from '../../app/services/parse/http-client';

async function debugParse() {
  const text = 'Aragorn, son of Arathorn, traveled to Gondor. He became king there.';

  const parsed = await parseText(text);

  console.log('\n=== DEPENDENCY PARSE ===\n');

  for (let i = 0; i < parsed.sentences.length; i++) {
    const sent = parsed.sentences[i];
    console.log(`Sentence ${i + 1}: "${sent.text}"\n`);

    for (const tok of sent.tokens) {
      console.log(`  ${tok.i}: "${tok.text}" [${tok.pos}] dep=${tok.dep} head=${tok.head}`);
    }

    console.log('\n');
  }

  // Look specifically for entities and their deps
  console.log('=== ENTITY TOKENS ===\n');
  for (const sent of parsed.sentences) {
    for (const tok of sent.tokens) {
      if (tok.pos === 'PROPN' || /^[A-Z]/.test(tok.text)) {
        console.log(`  "${tok.text}" - dep: ${tok.dep}, head: ${tok.head}`);
      }
    }
  }

  // Find "traveled" and its subjects
  console.log('\n=== TRAVEL VERB ANALYSIS ===\n');
  for (const sent of parsed.sentences) {
    const travelTok = sent.tokens.find(t => t.lemma === 'travel');
    if (travelTok) {
      console.log(`Found "traveled" at index ${travelTok.i}`);
      console.log(`Looking for nsubj dependencies with head=${travelTok.i}:`);

      const subjects = sent.tokens.filter(t => t.dep === 'nsubj' && t.head === travelTok.i);
      subjects.forEach(s => {
        console.log(`  - "${s.text}" (index ${s.i})`);
      });

      if (subjects.length === 0) {
        console.log(`  (none found)`);
      }
    }
  }
}

debugParse().catch(console.error);
