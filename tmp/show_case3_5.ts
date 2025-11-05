import { extractEntities } from '../app/engine/extract/entities';

const text = `The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George.

Bill Weasley, the eldest son, worked for Gringotts Bank.`;
extractEntities(text).then(({ entities }) => {
  console.log(entities.map(e => `${e.type}:${e.canonical}`));
});
