import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

const text = `In 1991, Harry Potter started at Hogwarts School. He quickly became friends with Ron and Hermione.

During his first year, Harry faced Voldemort in the chamber. The young wizard survived the encounter.`;

(async () => {
  const file = path.resolve('tmp', 'inspect-3-4.json');
  clearStorage(file);
  await appendDoc('3.4', text, file);
  const graph = loadGraph(file)!;
  console.log(graph.entities.map(e => `${e.type}:${e.canonical}`));
})();
