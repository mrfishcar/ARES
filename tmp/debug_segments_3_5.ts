import { extractFromSegments } from '../app/engine/extract/orchestrator';

const text = `The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George.

Bill Weasley, the eldest son, worked for Gringotts Bank.`;

extractFromSegments('3.5', text).then(({ entities }) => {
  console.log(entities.map(e => `${e.type}:${e.canonical}`));
});
