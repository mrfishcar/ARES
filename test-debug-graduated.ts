/**
 * Debug "graduated from" pattern matching
 */

import { parseWithService } from './app/engine/extract/entities';
import { findShortestPath, describePath } from './app/engine/extract/relations/dependency-paths';
import type { Token } from './app/engine/extract/relations/types';

async function debug() {
  const text = 'Vincent Tan, who had graduated from National University of Singapore';

  console.log('='.repeat(80));
  console.log(`Text: "${text}"`);
  console.log('-'.repeat(80));

  const parsed = await parseWithService(text);
  const sent = parsed.sentences[0];

  console.log('\nDependency Structure:');
  for (const tok of sent.tokens) {
    const headText = tok.head !== tok.i ? sent.tokens[tok.head]?.text : 'ROOT';
    console.log(`${tok.i} ${tok.text} [${tok.pos}] --${tok.dep}--> ${headText}`);
  }

  // Find entities
  const entities: { name: string; tokens: Token[] }[] = [
    { name: 'Vincent Tan', tokens: [sent.tokens[0], sent.tokens[1]] },
    { name: 'National University of Singapore', tokens: [sent.tokens[7], sent.tokens[8], sent.tokens[10]] },
  ];

  console.log('\n' + '='.repeat(80));
  console.log('Checking paths between entities:');
  console.log('='.repeat(80));

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const e1 = entities[i];
      const e2 = entities[j];

      console.log(`\n${e1.name} → ${e2.name}:`);

      for (const t1 of e1.tokens) {
        for (const t2 of e2.tokens) {
          const path = findShortestPath(t1, t2, sent.tokens);
          if (path) {
            const desc = describePath(path);
            console.log(`  ${t1.text} → ${t2.text}:`);
            console.log(`    Signature: ${path.signature}`);
            console.log(`    Readable:  ${desc}`);
          }
        }
      }
    }
  }
}

debug().then(() => console.log('\nDone!'));
