import { parseWithService } from './app/engine/extract/entities';

async function debug() {
  const text = "Harry Potter was the son of James and Lily Potter.";

  const result = await parseWithService(text);

  console.log('Sentences:', result.sentences.length);
  for (const sent of result.sentences) {
    console.log('\nTokens:');
    for (const tok of sent.tokens) {
      console.log(`  [${tok.i}] "${tok.text}" pos=${tok.pos} dep=${tok.dep} ent=${tok.ent} head=${tok.head}`);
    }
  }
}

debug().catch(console.error);
