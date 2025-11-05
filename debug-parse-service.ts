import { parseWithService } from './app/engine/extract/entities';

async function debug() {
  const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

  console.log(`Text:\n"${text}"\n`);
  console.log(`Length: ${text.length}\n`);

  const result = await parseWithService(text);

  console.log('Parse Result:');
  console.log(JSON.stringify(result, null, 2));

  console.log('\nEntity Spans:');
  for (const ent of result.entities) {
    const spanText = text.slice(ent.start, ent.end);
    console.log(`[${ent.start}-${ent.end}] "${spanText}" (${ent.label}) - expected: "${ent.text}"`);
    if (spanText !== ent.text) {
      console.log(`  ⚠️  MISMATCH!`);
    }
  }
}

debug().catch(console.error);
