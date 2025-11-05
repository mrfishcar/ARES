import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

const text = `The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George.\n\nBill Weasley, the eldest son, worked for Gringotts Bank.`;

(async () => {
  const file = path.resolve('tmp', 'inspect-3-5.json');
  clearStorage(file);
  await appendDoc('3.5', text, file);
  const graph = loadGraph(file)!;
  for (const entity of graph.entities) {
    if (entity.type === 'PERSON') {
      console.log(entity.canonical, entity.aliases);
    }
  }
})();
