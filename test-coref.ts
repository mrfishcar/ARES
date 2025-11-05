import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = `Sarah Chen graduated from Stanford University in 2019. She moved to San Francisco to work at Google.`;

  console.log('COREFERENCE TEST');
  console.log('='.repeat(80));
  console.log('TEXT:', text);
  console.log('='.repeat(80));

  const { entities, relations, spans } = await extractFromSegments('coref-test', text) as any;

  console.log('\nEntities:');
  for (const e of entities) {
    const entitySpans = spans.filter((s: any) => s.entity_id === e.id);
    console.log(`  ${e.canonical} (${e.type})`);
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

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
