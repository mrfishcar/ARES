/**
 * Debug: Why isn't "He studied magic there" extracting studies_at?
 */

import { parseWithService } from './app/engine/extract/entities';
import { findShortestPath } from './app/engine/extract/relations/dependency-paths';

async function debugStudiedMagic() {
  const sentence = 'He studied magic there.';
  console.log(`\nSentence: "${sentence}"\n`);

  const parsed = await parseWithService(sentence);

  if (parsed.sentences.length === 0) {
    console.log('ERROR: No sentences parsed');
    return;
  }

  const tokens = parsed.sentences[0].tokens;

  console.log('Tokens:');
  for (const tok of tokens) {
    console.log(`  [${tok.i}] ${tok.text} (lemma: ${tok.lemma}, pos: ${tok.pos}, dep: ${tok.dep}, head: ${tok.head})`);
  }

  // Find entities
  const he = tokens.find((t: any) => t.lemma.toLowerCase() === 'he');
  const there = tokens.find((t: any) => t.lemma.toLowerCase() === 'there');

  if (!he || !there) {
    console.log('\nERROR: Could not find "he" or "there" tokens');
    return;
  }

  console.log(`\nEntity tokens:`);
  console.log(`  Subject: [${he.i}] ${he.text}`);
  console.log(`  Object: [${there.i}] ${there.text}`);

  // Find shortest path
  const path = findShortestPath(he, there, tokens);

  if (!path) {
    console.log('\nERROR: No dependency path found');
    return;
  }

  console.log(`\nShortest dependency path:`);
  console.log(`  Signature: ${path.signature}`);
  console.log(`  Steps:`);
  for (const step of path.steps) {
    const arrow = step.direction === 'up' ? '↑' : '↓';
    console.log(`    ${arrow}${step.relation} → ${step.token.text}`);
  }

  console.log(`\nPattern to match: ${path.signature}`);
  console.log(`Expected: \\w+:↑nsubj:study:↓(dobj|obj):\\w+:↓(advmod|npadvmod):(there|here)`);
}

debugStudiedMagic().catch(console.error);
