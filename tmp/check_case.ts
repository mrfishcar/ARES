import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

async function check(id: string, text: string, gold: string[]) {
  const file = path.resolve('tmp', `check-${id}.json`);
  clearStorage(file);
  await appendDoc(id, text, file);
  const graph = loadGraph(file)!;
  const extracted = new Set(graph.entities.map(e => e.canonical.toLowerCase()));
  const goldSet = new Set(gold.map(g => g.toLowerCase()));
  const correct = Array.from(extracted).filter(e => goldSet.has(e));
  const missing = Array.from(goldSet).filter(e => !extracted.has(e));
  console.log('Entities:', graph.entities.map(e => e.canonical));
  console.log('Extracted set:', extracted);
  console.log('Missing:', missing);
}

const text1 = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;
const gold1 = ['Harry Potter', 'James', 'Lily Potter', 'Dursleys', 'Privet Drive', 'Ron Weasley', 'Arthur', 'Ministry of Magic'];
check('3.1', text1, gold1);
