import { extractEntities } from "../app/engine/extract/entities";

async function test() {
  const text = `Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much. They were the last people you'd expect to be involved in anything strange or mysterious, because they just didn't hold with such nonsense.

Mr. Dursley was the director of a firm called Grunnings, which made drills. He was a big, beefy man with hardly any neck, although he did have a very large mustache. Mrs. Dursley was thin and blonde and had nearly twice the usual amount of neck, which came in very useful as she spent so much of her time craning over garden fences, spying on the neighbors.`;

  console.log("=== Testing HP Chapter 1 Opening ===\n");
  const result = await extractEntities(text);

  console.log("=== Extracted Entities ===");
  for (const e of result.entities) {
    const aliases = e.aliases || [];
    console.log(`- ${e.canonical} (${e.type}) aliases=[${aliases.join(", ")}]`);
  }

  // Validate expected entities
  const persons = result.entities.filter(e => e.type === 'PERSON');
  const places = result.entities.filter(e => e.type === 'PLACE');
  const orgs = result.entities.filter(e => e.type === 'ORG');

  console.log("\n=== Validation ===");
  console.log(`PERSON entities: ${persons.map(p => p.canonical).join(', ')}`);
  console.log(`PLACE entities: ${places.map(p => p.canonical).join(', ')}`);
  console.log(`ORG entities: ${orgs.map(p => p.canonical).join(', ')}`);

  const hasMrDursley = persons.some(p => /Mr\.?\s+Dursley/i.test(p.canonical));
  const hasMrsDursley = persons.some(p => /Mrs\.?\s+Dursley/i.test(p.canonical));
  const hasGrunningsOrg = orgs.some(o => o.canonical === 'Grunnings');
  const hasPrivetDrivePlace = places.some(p => p.canonical.includes('Privet'));

  console.log(`\n✓ Mr. Dursley as PERSON: ${hasMrDursley ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Mrs. Dursley as PERSON: ${hasMrsDursley ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Grunnings as ORG: ${hasGrunningsOrg ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Privet Drive as PLACE: ${hasPrivetDrivePlace ? 'PASS' : 'FAIL'}`);
}

test().catch(console.error);
