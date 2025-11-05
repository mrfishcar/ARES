/**
 * Debug coordination: "X and Y founded Z"
 */

import { parseWithService } from './app/engine/extract/entities';
import { findShortestPath, describePath } from './app/engine/extract/relations/dependency-paths';
import type { Token } from './app/engine/extract/relations/types';

async function debugCoordination() {
  const tests = [
    'Robert and Sarah founded Zenith Computing',
    'Gabriel, Michael, and David worked together',
    'Eric Nelson and Maria Garcia led the project'
  ];

  for (const text of tests) {
    console.log('='.repeat(80));
    console.log(`Text: "${text}"`);
    console.log('-'.repeat(80));

    const parsed = await parseWithService(text);
    const sent = parsed.sentences[0];

    console.log('\nDependency Structure:');
    console.log('i  | Token      | POS  | Dep      | Head | Head_Text');
    console.log('-'.repeat(80));
    for (const tok of sent.tokens) {
      const headText = tok.head !== tok.i ? sent.tokens[tok.head]?.text : 'ROOT';
      console.log(`${tok.i.toString().padEnd(3)}| ${tok.text.padEnd(11)}| ${tok.pos.padEnd(5)}| ${tok.dep.padEnd(9)}| ${tok.head.toString().padEnd(5)}| ${headText}`);
    }

    // Find coordination relationships
    const coordinations = sent.tokens.filter((t: Token) => t.dep === 'conj');
    if (coordinations.length > 0) {
      console.log(`\nCoordinations found: ${coordinations.length}`);
      for (const coord of coordinations) {
        const head = sent.tokens[coord.head];
        console.log(`  ${coord.text} (${coord.i}) conj→ ${head.text} (${head.i})`);
      }
    }
    console.log('');
  }
}

debugCoordination()
  .then(() => {
    console.log('Debug complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
