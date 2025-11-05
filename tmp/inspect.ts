import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

async function run() {
  const doc = `Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor.

Draco Malfoy, on the other hand, joined Slytherin. He became a rival to Harry.`;
  const testPath = path.resolve('tmp', 'inspect-graph.json');
  clearStorage(testPath);
  await appendDoc('test', doc, testPath);
  const graph = loadGraph(testPath);
  console.log(graph?.entities.map(e => `${e.type}: ${e.canonical}`));
}
run();
