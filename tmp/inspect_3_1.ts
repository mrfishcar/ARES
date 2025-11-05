import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

async function run() {
  const testPath = path.resolve('tmp', 'inspect-3-1.json');
  clearStorage(testPath);
  await appendDoc('3.1', text, testPath);
  const graph = loadGraph(testPath);
  console.log(graph?.entities.map(e => `${e.type}: ${e.canonical}`));
}
run();
