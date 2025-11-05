// Debug passive voice dependency structure
import { parseSentence } from './app/engine/extract/parser';

async function test() {
  const sentences = [
    "The company was founded by Matthew Brooks and Lauren Davis.",
    "DataVision Systems was founded by Eric Nelson.",
    "Zenith Computing was established by three students."
  ];

  for (const text of sentences) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Sentence: ${text}`);
    console.log('='.repeat(80));

    const { tokens } = await parseSentence(text);

    console.log('\nFull dependency tree:');
    for (const tok of tokens) {
      const head = tok.head === tok.i ? 'ROOT' : tokens[tok.head]?.text || '?';
      console.log(`  ${tok.i}: "${tok.text}" [${tok.pos}] dep=${tok.dep} head=${tok.head}(${head}) lemma=${tok.lemma}`);
    }

    // Find "founded" or "established" token
    const verbTok = tokens.find(t =>
      t.lemma === 'found' || t.lemma === 'establish' || t.text.toLowerCase().includes('found') || t.text.toLowerCase().includes('establish')
    );

    if (verbTok) {
      console.log(`\n>>> Verb found: "${verbTok.text}" (index ${verbTok.i}, lemma: ${verbTok.lemma})`);

      // Find subject
      const subjTok = tokens.find(t =>
        (t.dep === 'nsubj' || t.dep === 'nsubjpass') && t.head === verbTok.i
      );
      if (subjTok) {
        console.log(`    Subject: "${subjTok.text}" (dep=${subjTok.dep})`);
      }

      // Find "by" agent
      const byToks = tokens.filter(t => t.text.toLowerCase() === 'by');
      console.log(`    Found ${byToks.length} "by" tokens`);
      for (const byTok of byToks) {
        console.log(`      ${byTok.i}: dep=${byTok.dep}, head=${byTok.head}(${tokens[byTok.head]?.text})`);

        // Look for pobj of "by"
        const pobj = tokens.find(t => t.dep === 'pobj' && t.head === byTok.i);
        if (pobj) {
          console.log(`        pobj: "${pobj.text}"`);
        }
      }
    }
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
