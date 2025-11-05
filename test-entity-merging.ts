import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = `Sarah Chen graduated from Stanford. Sarah moved to San Francisco. She met Marcus.`;

  console.log('ENTITY MERGING TEST');
  console.log('='.repeat(80));
  console.log('TEXT:', text);
  console.log('='.repeat(80));

  const { entities, relations, spans } = await extractFromSegments('merge-test', text) as any;

  console.log('\nEntities:');
  for (const e of entities) {
    const entitySpans = spans.filter((s: any) => s.entity_id === e.id);
    console.log(`  ${e.canonical} (${e.type}, id=${e.id.slice(0, 8)})`);
    if (e.aliases && e.aliases.length > 0) {
      console.log(`    Aliases: ${e.aliases.join(', ')}`);
    }
    for (const span of entitySpans) {
      const spanText = text.slice(span.start, span.end);
      console.log(`    [${span.start}-${span.end}] "${spanText}"`);
    }
  }

  console.log('\nRelations:');
  for (const rel of relations) {
    const subj = entities.find((e: any) => e.id === rel.subj)?.canonical || rel.subj;
    const obj = entities.find((e: any) => e.id === rel.obj)?.canonical || rel.obj;
    console.log(`  ${subj} --[${rel.pred}]--> ${obj}`);
  }

  // Check for duplicates
  const personEntities = entities.filter((e: any) => e.type === 'PERSON');
  console.log(`\nPERSON entities: ${personEntities.length}`);
  for (const e of personEntities) {
    console.log(`  - ${e.canonical}`);
  }

  if (personEntities.length > 2) {
    console.log('\n⚠️  WARNING: Entity duplication detected!');
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
