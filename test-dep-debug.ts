import { parseWithService } from './app/engine/extract/entities';
import { findShortestPath, describePath } from './app/engine/extract/relations/dependency-paths';
import type { Token } from './app/engine/extract/parse-types';

async function test() {
  const sentences = [
    "DataVision had been founded by Eric Nelson",
    "They married before founding Zenith Computing",
  ];

  for (const text of sentences) {
    console.log(`\n"${text}"`);
    console.log('='.repeat(80));

    const parsed = await parseWithService(text);
    const tokens = parsed.sentences[0]?.tokens || [];

    // Find entity tokens (proper nouns)
    const entityTokens = tokens.filter((t: Token) => t.pos === 'PROPN');

    if (entityTokens.length >= 2) {
      const path = findShortestPath(entityTokens[0], entityTokens[1], tokens);
      if (path) {
        console.log(`Path signature: ${path.signature}`);
        console.log(`Description: ${describePath(path)}`);
      } else {
        console.log('No path found');
      }
    }

    // Show all tokens
    console.log('\nTokens:');
    for (const t of tokens) {
      console.log(`  ${t.text} (${t.pos}, dep=${t.dep}, head=${t.head})`);
    }
  }
}

test().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
