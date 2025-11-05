import { parseWithService } from '../app/engine/extract/entities';

async function debug() {
  const text = 'Aragorn, son of Arathorn, married Arwen in 3019. Gandalf the Grey traveled to Minas Tirith.';
  const parsed = await parseWithService(text);

  // Find sentence with traveled
  for (const sent of parsed.sentences) {
    const tokens = sent.tokens;
    const traveled = tokens.find(t => t.text === 'traveled');
    if (!traveled) continue;

    const subjTok = tokens.find(t => t.dep === 'nsubj' && t.head === traveled.i);
    console.log('subjTok (before chooseSemanticHead):', subjTok?.text, subjTok?.i);

    // Manually run chooseSemanticHead logic
    if (subjTok) {
      const children = tokens.filter(t => t.head === subjTok.i);
      console.log('Children of subjTok:');
      for (const c of children) {
        console.log(`  [${c.i}] ${c.text} dep=${c.dep} pos=${c.pos} capitalized=${/^[A-Z]/.test(c.text)}`);
        console.log(`    Matches amod: ${c.dep === 'amod'}`);
        console.log(`    In list: ${['nmod', 'compound', 'appos', 'flat', 'amod'].includes(c.dep)}`);
        console.log(`    Is PROPN or capitalized: ${c.pos === 'PROPN' || /^[A-Z]/.test(c.text)}`);
      }

      const properNounChild = tokens.find(t =>
        t.head === subjTok.i &&
        ['nmod', 'compound', 'appos', 'flat', 'amod'].includes(t.dep) &&
        (t.pos === 'PROPN' || /^[A-Z]/.test(t.text))
      );
      console.log('\nproperNounChild:', properNounChild?.text);
    }
  }
}

debug();
