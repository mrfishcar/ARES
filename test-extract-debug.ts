import { extractEntities } from './app/engine/extract/entities';

async function test() {
  console.log("[TEST] Starting direct extract test...");
  const result = await extractEntities("Eowyn fought in the Battle of Pelennor Fields.");
  console.log("[TEST] Result:", result);
}

test().catch(console.error);
