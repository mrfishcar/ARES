import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import * as path from 'path';

const text = `Albus Dumbledore was the headmaster of Hogwarts. The wise wizard had a phoenix named Fawkes.

He trusted Severus Snape completely. The headmaster believed Snape was loyal to the Order.`;
const gold = ['Albus Dumbledore', 'Hogwarts', 'Fawkes', 'Severus Snape'];

async function run() {
  const file = path.resolve('tmp', 'check-3-3.json');
  clearStorage(file);
  await appendDoc('3.3', text, file);
  const graph = loadGraph(file)!;
  console.log(graph.entities.map(e => e.canonical));
}
run();
