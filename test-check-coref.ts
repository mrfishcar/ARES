/**
 * Check what coreference links we're getting from NLP
 */

import { parseWithService } from './app/engine/extract/entities';

async function check() {
  const text = 'Daniel Kim was promoted to CTO. He led a team of thirty engineers. His wife Lisa worked at Apple.';

  console.log('Text:', text);
  console.log('='.repeat(80));

  const parsed = await parseWithService(text);

  console.log('\nCoreference Clusters:');
  if (parsed.coref_chains && parsed.coref_chains.length > 0) {
    for (let i = 0; i < parsed.coref_chains.length; i++) {
      const chain = parsed.coref_chains[i];
      console.log(`\nCluster ${i + 1}:`);
      for (const mention of chain) {
        console.log(`  "${mention.text}" (${mention.start}-${mention.end})`);
      }
    }
  } else {
    console.log('  No coreference chains found');
  }

  console.log('\nEntities:');
  if (parsed.entities && parsed.entities.length > 0) {
    for (const ent of parsed.entities) {
      console.log(`  ${ent.text} (${ent.label}) [${ent.start}-${ent.end}]`);
    }
  }
}

check().then(() => console.log('\nDone!'));
