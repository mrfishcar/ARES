import { extractEntities } from "../app/engine/extract/entities";

async function test() {
  const text = `Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal. Mr. Dursley was the director of a firm called Grunnings. Mrs. Dursley was thin and blonde.`;

  console.log("=== Testing Married Couple Pattern ===\n");
  console.log("Input:", text);
  console.log("\n=== Expected ===");
  console.log("- Mr. Dursley (PERSON) - separate entity");
  console.log("- Mrs. Dursley (PERSON) - separate entity");

  const result = await extractEntities(text);

  console.log("\n=== Extracted ===");
  for (const e of result.entities) {
    console.log(`- ${e.canonical} (${e.type}) aliases=[${e.aliases?.join(", ") || ""}]`);
  }

  const persons = result.entities.filter(e => e.type === 'PERSON');
  const hasMrDursley = persons.some(p => p.canonical.includes('Mr') && p.canonical.includes('Dursley'));
  const hasMrsDursley = persons.some(p => p.canonical.includes('Mrs') && p.canonical.includes('Dursley'));

  console.log("\n=== Result ===");
  console.log(`Mr. Dursley separate: ${hasMrDursley ? '✓' : '✗'}`);
  console.log(`Mrs. Dursley separate: ${hasMrsDursley ? '✓' : '✗'}`);
  console.log(`PASS: ${hasMrDursley && hasMrsDursley ? '✓ YES' : '✗ NO'}`);
}

test().catch(console.error);
