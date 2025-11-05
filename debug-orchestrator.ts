import { extractFromSegments } from './app/engine/extract/orchestrator';

async function debug() {
  const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

  console.log(`Text:\n"${text}"\n`);
  console.log(`Length: ${text.length}\n`);

  const { entities, spans, relations, fictionEntities } = await extractFromSegments('test', text);

  console.log(`\nEntities (${entities.length}):`);
  for (const e of entities) {
    console.log(`  ${e.canonical} (${e.type})`);

    const entitySpans = spans.filter(s => s.entity_id === e.id);
    for (const s of entitySpans) {
      const spanText = text.slice(s.start, s.end);
      console.log(`    [${s.start}-${s.end}] "${spanText}"`);
      if (spanText !== e.canonical) {
        console.log(`      ⚠️  MISMATCH with canonical!`);
      }
    }
  }

  console.log(`\nFiction highlights (${fictionEntities.length}):`);
  for (const f of fictionEntities.slice(0, 10)) {
    console.log(`  ${f.name} [${f.type}] – ${f.mentions} mentions`);
  }
}

debug().catch(console.error);
