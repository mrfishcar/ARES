import { extractEntities } from './app/engine/extract/entities';
import { splitIntoSentences } from './app/engine/segment';
import { resolveCoref } from './app/engine/coref';

async function test() {
  const text = `Sarah Chen graduated from Stanford University in 2019. She moved to San Francisco to work at Google.`;

  console.log('DETAILED COREFERENCE TEST');
  console.log('='.repeat(80));
  console.log('TEXT:', text);
  console.log('='.repeat(80));

  // Extract entities
  const { entities, spans } = await extractEntities(text);

  console.log('\nEntities extracted:');
  for (const e of entities) {
    console.log(`  ${e.canonical} (${e.type}, id=${e.id.slice(0, 8)})`);
  }

  console.log('\nEntity spans:');
  for (const span of spans) {
    const spanText = text.slice(span.start, span.end);
    const entity = entities.find(e => e.id === span.entity_id);
    console.log(`  [${span.start}-${span.end}] "${spanText}" -> ${entity?.canonical}`);
  }

  // Split into sentences
  const sentences = splitIntoSentences(text);
  console.log(`\nSentences: ${sentences.length}`);
  for (let i = 0; i < sentences.length; i++) {
    console.log(`  [${i}] ${sentences[i].text}`);
  }

  // Resolve coreference
  const corefLinks = resolveCoref(sentences, entities, spans, text);

  console.log(`\nCoreference links: ${corefLinks.links.length}`);
  for (const link of corefLinks.links) {
    const linkText = text.slice(link.mention.start, link.mention.end);
    const entity = entities.find(e => e.id === link.entity_id);
    console.log(`  "${linkText}" [${link.mention.start}-${link.mention.end}] -> ${entity?.canonical} (method=${link.method}, confidence=${link.confidence})`);
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
