import { extractFromSegments } from './app/engine/extract/orchestrator';

async function debug() {
  const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

  console.log(`Text:\n"${text}"\n`);
  console.log(`Length: ${text.length}\n`);

  const { entities, spans } = await extractFromSegments('3.1', text);

  console.log(`\nEntities (${entities.length}):`);
  for (const e of entities.slice(0, 10)) {
    console.log(`  "${e.canonical}" (${e.type})`);
  }

  console.log(`\nGold entities:`);
  const gold = ['Harry Potter', 'James', 'Lily Potter', 'Dursleys', 'Privet Drive', 'Ron Weasley', 'Arthur', 'Ministry of Magic'];
  for (const g of gold) {
    const found = entities.find(e => e.canonical.toLowerCase() === g.toLowerCase());
    if (found) {
      console.log(`  ✅ ${g}`);
    } else {
      console.log(`  ❌ ${g} - MISSING`);
    }
  }
}

debug().catch(console.error);
