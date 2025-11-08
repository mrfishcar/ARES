import { extractEntities } from './app/engine/extract/entities';

const text = `Aragorn, son of Arathorn, married Arwen in 3019. Gandalf the Grey traveled to Minas Tirith.`;

async function debug() {
  const { entities, spans } = await extractEntities(text);

  console.log('\nExtracted Entities:');
  for (const e of entities) {
    console.log(`  - ${e.canonical} (${e.type})`);
  }

  console.log(`\nTotal entities: ${entities.length}`);
  console.log(`Total spans: ${spans.length}`);

  console.log('\nSpans:');
  for (const span of spans) {
    const entity = entities.find(e => e.id === span.entity_id);
    const textSpan = text.slice(span.start, span.end);
    console.log(`  [${span.start}-${span.end}] "${textSpan}" → ${entity?.canonical} (${entity?.type})`);
  }
}

debug();
