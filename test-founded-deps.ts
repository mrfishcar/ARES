import nlp from 'compromise';
import { parseSentence } from './app/engine/extract/parser';

async function test() {
  const sentences = [
    "The company was founded by Matthew Brooks.",
    "DataVision Systems was founded by Eric Nelson and Maria Garcia.",
    "Antonio Santos co-founded DataStream."
  ];

  for (const text of sentences) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Sentence: ${text}`);
    console.log('='.repeat(80));

    const { tokens } = await parseSentence(text);

    console.log('\nToken dependencies:');
    for (const tok of tokens) {
      const head = tok.head === tok.i ? 'ROOT' : tokens[tok.head]?.text || '?';
      console.log(`  ${tok.i}: "${tok.text}" [${tok.pos}] dep=${tok.dep} head=${tok.head}(${head}) lemma=${tok.lemma}`);
    }

    // Find "founded" token
    const foundedTok = tokens.find(t => t.text.toLowerCase().includes('found'));
    if (foundedTok) {
      console.log(`\nFounded token: ${foundedTok.text} (index ${foundedTok.i})`);

      // Look for "by" agent
      const byTok = tokens.find(t =>
        t.text.toLowerCase() === 'by' && t.head === foundedTok.i
      );
      if (byTok) {
        console.log(`Found "by" token: index ${byTok.i}, dep=${byTok.dep}`);

        // Look for pobj of "by"
        const pobj = tokens.find(t => t.dep === 'pobj' && t.head === byTok.i);
        if (pobj) {
          console.log(`Found pobj: "${pobj.text}" (index ${pobj.i})`);
        }
      } else {
        console.log('No "by" agent found attached to founded');
      }
    }
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
