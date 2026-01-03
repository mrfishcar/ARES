import { extractEntities } from '../app/engine/extract/entities';

const text = `He had not spoken face to face with his father, Andrew Beauregard, for thirty-two days. Mr. Beauregard audited business books for a living.`;

async function test() {
  const result = await extractEntities(text);
  console.log('Entities:');
  for (const e of result.entities) {
    console.log(`  ${e.canonical} (${e.type})`);
  }
  console.log('Spans:', result.spans.length);
}

test().catch(console.error);
