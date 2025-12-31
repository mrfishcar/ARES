/**
 * Trace exactly which patterns create which relations
 */
import { getParserClient } from '../app/parser';

async function main() {
  const text = "Aragorn, son of Arathorn, married Arwen.";

  console.log('=== Tracing Relations for Test 1.1 ===\n');
  console.log('Text:', text);
  console.log('');

  const parser = await getParserClient();
  const parsed = await parser.parse(text);

  if (!parsed || parsed.length === 0) {
    console.error('Failed to parse');
    return;
  }

  const tokens = parsed[0].tokens;

  console.log('=== Token Structure ===');
  for (const t of tokens) {
    const headText = tokens[t.head]?.text || '-';
    console.log(`[${t.i}] ${t.text.padEnd(10)} pos=${t.pos.padEnd(6)} dep=${t.dep.padEnd(8)} head=${t.head}(${headText}) ent=${t.ent || '-'}`);
  }
  console.log('');

  // Find the "married" token
  const marriedTok = tokens.find(t => t.text === 'married');
  if (marriedTok) {
    console.log('=== Analyzing "married" Token ===');
    console.log(`married: pos=${marriedTok.pos}, dep=${marriedTok.dep}, head=${marriedTok.head}`);

    if (marriedTok.dep === 'amod') {
      console.log('  → Case 2: married is amod (adjective modifier)');
      const obj = tokens.find(t => t.i === marriedTok.head);
      console.log(`  → obj = ${obj?.text} (head of married)`);

      // Subject is ROOT or appositive before obj
      const subj = tokens.find(t => t.dep === 'ROOT' || (t.dep === 'appos' && obj && t.i < obj.i));
      console.log(`  → subj = ${subj?.text} (ROOT or appos before obj)`);
      console.log(`  → Would create: ${subj?.text} married_to ${obj?.text}`);
    }
  }

  // Find the "son" token
  const sonTok = tokens.find(t => t.text === 'son');
  if (sonTok) {
    console.log('\n=== Analyzing "son" Token ===');
    console.log(`son: pos=${sonTok.pos}, dep=${sonTok.dep}, head=${sonTok.head}`);

    const ofPrep = tokens.find(t => t.dep === 'prep' && t.head === sonTok.i && t.text === 'of');
    console.log(`  → ofPrep = ${ofPrep?.text}`);

    if (ofPrep) {
      const parentTok = tokens.find(t => t.dep === 'pobj' && t.head === ofPrep.i);
      console.log(`  → parentTok = ${parentTok?.text}`);

      // Child is head of "son"
      const headToken = tokens.find(t => t.i === sonTok.head);
      console.log(`  → headToken = ${headToken?.text} (head of son)`);

      if (headToken && (headToken.pos === 'PROPN' || /^[A-Z]/.test(headToken.text))) {
        console.log(`  → childToken = ${headToken?.text} (headToken is PROPN)`);
        console.log(`  → Would create: ${headToken?.text} child_of ${parentTok?.text}`);
      }
    }
  }

  console.log('\n=== Expected Relations ===');
  console.log('  Aragorn child_of Arathorn (from "son of")');
  console.log('  Aragorn married_to Arwen (from "married")');

  console.log('\n=== Check for Other Patterns ===');
  console.log('Checking if any other token could trigger married_to...');
  for (const t of tokens) {
    if (t.lemma === 'marry' || t.text.toLowerCase() === 'married') {
      console.log(`  Found marry/married at token ${t.i}: "${t.text}"`);
    }
    if (['wife', 'husband', 'spouse', 'partner'].includes(t.lemma) ||
        ['wife', 'husband', 'spouse', 'partner'].includes(t.text.toLowerCase())) {
      console.log(`  Found spouse noun at token ${t.i}: "${t.text}"`);
    }
  }
}

main().catch(console.error);
