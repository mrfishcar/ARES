import { extractEntities } from '../app/engine/extract/entities';

const text = `The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George.\n\nBill Weasley, the eldest son, worked for Gringotts Bank.`;

(async () => {
  const result = await extractEntities(text);
  console.log('entities', JSON.stringify(result.entities, null, 2));
  console.log('spans', JSON.stringify(result.spans, null, 2));
})();
