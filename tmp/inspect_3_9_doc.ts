import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

const text = `Professor McGonagall taught Transfiguration at Hogwarts. She was also the head of Gryffindor House.

Professor Snape taught Potions. The stern professor later became headmaster.`;
(async () => {
  const file = path.resolve('tmp', 'inspect-3-9.json');
  clearStorage(file);
  await appendDoc('3.9', text, file);
  const graph = loadGraph(file)!;
  console.log(graph.entities.map(e => `${e.type}:${e.canonical}`));
})();
