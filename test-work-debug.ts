import { parseWithService } from './app/engine/extract/entities';

async function test() {
  const text = `She moved to San Francisco to work at Google.`;

  console.log('WORK PATTERN DEBUG');
  console.log('='.repeat(80));
  console.log('TEXT:', text);
  console.log('='.repeat(80));

  const parsed = await parseWithService(text);
  const tokens = parsed.sentences[0].tokens;

  console.log('\nTokens:');
  for (const tok of tokens) {
    console.log(`  [${tok.i}] ${tok.text} (${tok.pos}, dep=${tok.dep}, head=${tok.head}, lemma=${tok.lemma})`);
  }

  // Find "work" token
  const workTok = tokens.find(t => t.lemma === 'work');
  if (workTok) {
    console.log('\n"work" token found:');
    console.log(`  Index: ${workTok.i}, Dep: ${workTok.dep}, Head: ${workTok.head}`);

    // Check if it's xcomp
    if (workTok.dep === 'xcomp') {
      console.log('  ✓ Is xcomp (clausal complement)');
      const parentVerb = tokens.find(t => t.i === workTok.head);
      if (parentVerb) {
        console.log(`  Parent verb: ${parentVerb.text} (${parentVerb.lemma})`);

        // Check for subject of parent
        const subj = tokens.find(t => (t.dep === 'nsubj' || t.dep === 'nsubjpass') && t.head === parentVerb.i);
        if (subj) {
          console.log(`  Subject: ${subj.text} (pos=${subj.pos})`);
        }
      }
    }

    // Check for "at" preposition
    const atPrep = tokens.find(t => t.dep === 'prep' && t.head === workTok.i && t.text.toLowerCase() === 'at');
    if (atPrep) {
      console.log('  ✓ "at" preposition found');
      const pobj = tokens.find(t => t.dep === 'pobj' && t.head === atPrep.i);
      if (pobj) {
        console.log(`  Object: ${pobj.text}`);
      }
    }
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
