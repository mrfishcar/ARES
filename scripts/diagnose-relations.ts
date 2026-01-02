/**
 * Relation Extraction Diagnostic
 * Traces why specific patterns aren't matching
 */

import { createParserClient } from '../app/parser';
import type { ParserClient } from '../app/parser';
import type { Token, ParsedSentence } from '../app/parser/parse-types';
import { extractFromSegments } from '../app/engine/extract/orchestrator';

// Sample failing test cases - SVO patterns that should be extracted
const FAILING_CASES = [
  { name: 'Followed', text: 'Ron followed Harry into the forest.', expected: 'followed' },
  { name: 'Attacked', text: 'The dragon attacked the village.', expected: 'attacked' },
  { name: 'Protected', text: 'Dumbledore protected Hogwarts from evil.', expected: 'protected' },
  { name: 'Loved', text: 'Harry loved his friends deeply.', expected: 'loved' },
  { name: 'Betrayed', text: 'Peter Pettigrew betrayed the Potters.', expected: 'betrayed' },
  { name: 'Saved', text: 'Harry saved Ginny in the Chamber of Secrets.', expected: 'saved' },
  { name: 'Defeated', text: 'Harry Potter defeated Lord Voldemort.', expected: 'defeated' },
  { name: 'Trusted', text: 'Harry trusted Dumbledore completely.', expected: 'trusted' },
  { name: 'Helped', text: 'Hermione helped Harry with his homework.', expected: 'helped' },
  { name: 'Feared', text: 'Everyone feared Voldemort.', expected: 'feared' },
];

async function diagnose() {
  const parser: ParserClient = await createParserClient();

  console.log('='.repeat(80));
  console.log('RELATION EXTRACTION DIAGNOSTIC');
  console.log('='.repeat(80));

  for (const testCase of FAILING_CASES) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`TEST: ${testCase.name}`);
    console.log(`TEXT: "${testCase.text}"`);
    console.log(`EXPECTED PREDICATE: ${testCase.expected}`);
    console.log('─'.repeat(80));

    // Get parser output
    const parsed = await parser.parse({ text: testCase.text });

    // Get first sentence tokens
    const tokens: Token[] = parsed.sentences[0]?.tokens || [];

    // Show tokens and deps
    console.log('\nDEPENDENCY PARSE:');
    for (const token of tokens) {
      console.log(`  ${token.i}: ${token.text.padEnd(15)} dep=${token.dep.padEnd(10)} head=${token.head} pos=${token.pos} lemma=${token.lemma}`);
    }

    // Show NER from token.ent
    const ents: { text: string; label: string }[] = [];
    let currentEnt = '';
    let currentLabel = '';
    for (const token of tokens) {
      if (token.ent && token.ent !== 'O' && token.ent !== '') {
        const bioPrefix = token.ent.substring(0, 2);
        const label = token.ent.substring(2);
        if (bioPrefix === 'B-' || (currentLabel !== label && bioPrefix === 'I-')) {
          if (currentEnt) {
            ents.push({ text: currentEnt.trim(), label: currentLabel });
          }
          currentEnt = token.text;
          currentLabel = label;
        } else {
          currentEnt += ' ' + token.text;
        }
      } else {
        if (currentEnt) {
          ents.push({ text: currentEnt.trim(), label: currentLabel });
        }
        currentEnt = '';
        currentLabel = '';
      }
    }
    if (currentEnt) {
      ents.push({ text: currentEnt.trim(), label: currentLabel });
    }

    console.log('\nNAMED ENTITIES:');
    for (const ent of ents) {
      console.log(`  "${ent.text}" → ${ent.label}`);
    }

    // Find the verb (ROOT)
    const verb = tokens.find(t => t.dep === 'ROOT');
    if (verb) {
      console.log(`\nVERB: "${verb.text}" (lemma=${verb.lemma}, dep=${verb.dep})`);

      // Find subject and object
      const subj = tokens.find(t => t.dep.includes('subj') && t.head === verb.i);
      const obj = tokens.find(t => (t.dep.includes('obj') || t.dep === 'dobj') && t.head === verb.i);

      if (subj) console.log(`  SUBJECT: "${subj.text}" (dep=${subj.dep})`);
      if (obj) console.log(`  OBJECT: "${obj.text}" (dep=${obj.dep})`);

      // Show what path signature would be generated
      if (subj && obj) {
        const pathSig = `${subj.text}:↑${subj.dep}:${verb.lemma}:↓${obj.dep}:${obj.text}`;
        console.log(`\n  PATH SIGNATURE (SVO): ${pathSig}`);
      } else if (subj && !obj) {
        console.log(`\n  ⚠️ NO DIRECT OBJECT FOUND - looking for other deps from verb...`);
        // Look for other deps from the verb
        const otherDeps = tokens.filter(t => t.head === verb.i && t !== subj);
        for (const d of otherDeps) {
          console.log(`    "${d.text}": dep=${d.dep} (head=${d.head})`);
        }
      }
    }

    // Run actual extraction
    console.log('\nACTUAL EXTRACTION:');
    const result = await extractFromSegments(
      'diag-doc',
      testCase.text,
    );

    console.log(`  Entities: ${result.entities.map(e => e.canonical).join(', ') || 'none'}`);
    console.log(`  Relations: ${result.relations.length}`);
    for (const rel of result.relations) {
      const subj = result.entities.find(e => e.id === rel.subj);
      const obj = result.entities.find(e => e.id === rel.obj);
      console.log(`    ${subj?.canonical} --[${rel.pred}]--> ${obj?.canonical}`);
    }

    // Check if expected predicate found
    const found = result.relations.some(r => r.pred === testCase.expected);
    console.log(`\n  RESULT: ${found ? '✅ FOUND' : '❌ NOT FOUND'}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(80));
}

diagnose().catch(console.error);
