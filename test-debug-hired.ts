/**
 * Debug "X hired Y" pattern
 */

import { parseWithService } from './app/engine/extract/entities';
import { findShortestPath, describePath } from './app/engine/extract/relations/dependency-paths';
import type { Token } from './app/engine/extract/relations/types';

async function debug() {
  const tests = [
    'Robert Morrison hired Dr. Yuki Tanaka',
    'Lisa Kim was a product manager at Apple',
    'His partner at Sequoia, Katherine Rodriguez, participated',
    'Vincent Tan had graduated from National University of Singapore',
  ];

  for (const text of tests) {
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
    console.log('');
  }
}

debug().then(() => console.log('Done!'));
